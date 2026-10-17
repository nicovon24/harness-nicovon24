import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, readlink, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const run = promisify(execFile);
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function git(project, ...args) {
  try { return (await run('git', ['-C', project, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })).stdout; }
  catch (error) { throw new Error(`Git no disponible para snapshot: ${error.stderr?.trim() || error.message}`); }
}

export async function captureSnapshot(project, feature, { allowMissingAcceptance = false } = {}) {
  const top = (await git(project, 'rev-parse', '--show-toplevel')).trim();
  if (await realpath(top) !== await realpath(project)) throw new Error('El proyecto debe ser la raíz de su propio repositorio Git para capturar snapshots');
  const names = [...new Set((await git(project, 'ls-files', '--cached', '--others', '--exclude-standard', '-z')).split('\0').filter(Boolean))].sort();
  const digest = createHash('sha256');
  for (const name of names) {
    if (name.startsWith('harness/.local/')) continue;
    const file = path.resolve(project, name);
    if (!file.startsWith(path.resolve(project) + path.sep)) throw new Error(`Git devolvió ruta fuera del proyecto: ${name}`);
    let contents;
    try {
      const stat = await lstat(file);
      contents = stat.isSymbolicLink() ? Buffer.from(await readlink(file)) : await readFile(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      contents = Buffer.from('<deleted>');
    }
    digest.update(name).update('\0').update(sha256(contents)).update('\0');
  }
  const acceptanceFile = path.join(project, 'harness/features', feature, 'requirements.md');
  let acceptance;
  try { acceptance = await readFile(acceptanceFile); }
  catch (error) {
    if (error.code === 'ENOENT' && allowMissingAcceptance) acceptance = null;
    else throw new Error(`Falta aceptación ${acceptanceFile}: ${error.message}`);
  }
  let gitHead;
  try { gitHead = (await git(project, 'rev-parse', 'HEAD')).trim(); } catch { gitHead = null; }
  return { codeSha256: digest.digest('hex'), acceptanceSha256: acceptance === null ? null : sha256(acceptance), gitHead, fileCount: names.length };
}

export async function captureCheckpointSnapshot(project, feature) {
  const acceptanceFile = path.join(project, 'harness/features', feature, 'requirements.md');
  let specSnapshot;
  try { specSnapshot = { status: 'captured', file: `harness/features/${feature}/requirements.md`, sha256: sha256(await readFile(acceptanceFile)) }; }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    specSnapshot = { status: 'missing', file: `harness/features/${feature}/requirements.md`, sha256: null };
  }
  try {
    const snapshot = await captureSnapshot(project, feature, { allowMissingAcceptance: true });
    return { codeSnapshot: { status: 'captured', sha256: snapshot.codeSha256, gitHead: snapshot.gitHead, fileCount: snapshot.fileCount }, specSnapshot };
  } catch (error) {
    return { codeSnapshot: { status: 'unverified', reason: error.message }, specSnapshot };
  }
}
