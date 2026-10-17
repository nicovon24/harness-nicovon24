import { readFile, readdir, mkdir, writeFile, rename, rm, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { root, packageInfo } from './config.mjs';

const packages = ['ajv', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string'];
const registryName = '.agents/harness-install.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = name => name.split(path.sep).join('/');

async function filesIn(directory) {
  const names = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (directory.startsWith('node_modules')) {
      const parts = posix(relative).split('/').slice(2);
      if (parts.some(part => ['test', 'tests', 'spec', 'benchmark', 'benchmarks', '.github', 'examples'].includes(part))) continue;
      if (parts[0] === 'lib' && parts.length > 1 && directory.startsWith('node_modules/ajv')) continue;
    }
    if (entry.isDirectory()) names.push(...await filesIn(relative));
    else if (entry.isFile()) {
      if (directory.startsWith('node_modules') && !/\.(?:js|cjs|mjs|json)$|^license$/i.test(entry.name)) continue;
      names.push(relative);
    }
    else throw new Error(`Recurso no regular en el arnés: ${relative}`);
  }
  return names;
}

export async function installSources() {
  const pairs = [];
  for (const name of ['package.json', 'package-lock.json', 'config/defaults.json', 'schemas/project.schema.json']) {
    pairs.push([name, `.agents/harness/${name}`]);
  }
  for (const directory of ['bin', 'src', 'workflows', 'adapters/codex', ...packages.map(name => `node_modules/${name}`)]) {
    for (const file of await filesIn(directory)) pairs.push([file, `.agents/harness/${posix(file)}`]);
  }
  const skillsDirectory = (await existingBytes(path.join(root, 'skills/h-start/SKILL.md'))) ? 'skills' : '../skills';
  for (const file of await filesIn(skillsDirectory)) pairs.push([file, `.agents/skills/${posix(path.relative(skillsDirectory, file))}`]);
  return pairs;
}

async function existingBytes(file) {
  try { return await readFile(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function assertSafeParents(project, relative) {
  const parts = relative.split('/');
  let current = project;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    try {
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Ruta de instalación insegura: ${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const destination = path.join(project, ...parts);
  try { if ((await lstat(destination)).isSymbolicLink()) throw new Error(`Enlace no permitido: ${destination}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return destination;
}

async function registry(project) {
  const bytes = await existingBytes(path.join(project, registryName));
  if (!bytes) return null;
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Registro de instalación ilegible; no se modificó el proyecto'); }
  if (value.format !== 1 || typeof value.files !== 'object' || Array.isArray(value.files)) throw new Error('Registro de instalación inválido');
  for (const [name, digest] of Object.entries(value.files)) {
    if (!name.startsWith('.agents/') || name.includes('..') || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Registro de instalación inseguro');
  }
  return value;
}

async function atomicJson(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  try { await rename(temp, file); }
  catch (error) { await rm(temp, { force: true }); throw error; }
}

async function atomicBytes(file, bytes) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, bytes, { flag: 'wx' });
  try { await rename(temp, file); }
  catch (error) { await rm(temp, { force: true }); throw error; }
}

export async function installationPlan(project, action) {
  const previous = await registry(project);
  const desired = new Map();
  if (action === 'install') {
    for (const [source, destination] of await installSources()) desired.set(destination, await readFile(path.join(root, source)));
  }
  const all = new Set([...Object.keys(previous?.files || {}), ...desired.keys()]);
  const changes = [];
  for (const name of [...all].sort()) {
    const target = await assertSafeParents(project, name);
    const current = await existingBytes(target);
    const expected = previous?.files[name];
    const next = desired.get(name);
    const currentHash = current && hash(current);
    let operation;
    if (current && currentHash !== expected && (expected || next)) operation = 'conflict';
    else if (next && currentHash === hash(next)) operation = 'keep';
    else if (next) operation = current ? 'update' : 'create';
    else operation = current ? 'remove' : 'missing';
    changes.push({ file: name, operation, ...(next ? { sha256: hash(next) } : {}), ...(expected ? { installedSha256: expected } : {}) });
  }
  return { action, version: packageInfo.version, previousVersion: previous?.version || null, changes, desired };
}

export async function applyInstallation(project, action) {
  const lockFile = await assertSafeParents(project, '.agents/.harness-install.lock');
  await mkdir(path.dirname(lockFile), { recursive: true });
  try { await writeFile(lockFile, `${process.pid}\n`, { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Otra instalación está en curso o dejó un bloqueo que requiere revisión'); throw error; }
  try { return await applyLocked(project, action); }
  finally { await unlink(lockFile); }
}

async function applyLocked(project, action) {
  const plan = await installationPlan(project, action);
  if (plan.changes.some(change => change.operation === 'conflict')) throw new Error('Conflictos en archivos de instalación; se preservaron sin cambios');
  const registryFile = path.join(project, registryName);
  const applied = [];
  const rollback = [];
  try {
    for (const change of plan.changes) {
      const target = path.join(project, ...change.file.split('/'));
      if (change.operation === 'create' || change.operation === 'update') {
        await mkdir(path.dirname(target), { recursive: true });
        const before = await existingBytes(target);
        await atomicBytes(target, plan.desired.get(change.file));
        rollback.push({ target, before, afterHash: change.sha256 });
        applied.push(change.file);
      } else if (change.operation === 'remove') {
        const before = await existingBytes(target);
        await rm(target);
        rollback.push({ target, before, afterHash: null });
        applied.push(change.file);
      }
    }
    if (action === 'install') {
      const files = Object.fromEntries(plan.changes.map(change => [change.file, change.sha256]));
      await atomicJson(registryFile, { format: 1, version: packageInfo.version, files });
    } else if (await existingBytes(registryFile)) await rm(registryFile);
  } catch (error) {
    let recovered = true;
    for (const entry of rollback.reverse()) {
      try {
        const current = await existingBytes(entry.target);
        if ((current && hash(current)) !== entry.afterHash) { recovered = false; continue; }
        if (entry.before) await atomicBytes(entry.target, entry.before);
        else await rm(entry.target, { force: true });
      } catch { recovered = false; }
    }
    throw new Error(`${error.message}; reversión ${recovered ? 'completada' : 'incompleta, revisar archivos y registro'}`);
  }
  return { action, applied, count: applied.length };
}
