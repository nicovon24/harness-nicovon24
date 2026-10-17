import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
export const packageInfo = await readJson(path.join(root, 'package.json'));
export const defaults = await readJson(path.join(root, 'config/defaults.json'));
const schema = await readJson(path.join(root, 'schemas/project.schema.json'));
const codexModels = await readJson(path.join(root, 'adapters/codex/models.json'));
const validateSchema = new Ajv({ allErrors: true }).compile(schema);

export function manifestPath(project) { return path.join(project, 'harness/project.json'); }

export async function loadManifest(project) {
  const file = manifestPath(project);
  let manifest;
  try { manifest = await readJson(file); }
  catch (error) { throw new Error(`No se pudo leer ${file}: ${error.message}`); }
  if (!validateSchema(manifest)) {
    throw new Error(`Manifiesto inválido: ${validateSchema.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  }
  if (manifest.memory?.namespace && manifest.memory.namespace !== manifest.projectId && !manifest.memory.legacyNamespaces?.includes(manifest.projectId)) {
    throw new Error('memory.namespace debe coincidir con projectId o declarar la migración en legacyNamespaces');
  }
  for (const [name, relative] of Object.entries(manifest.references || {})) {
    const full = path.resolve(project, relative);
    if (!full.startsWith(path.resolve(project) + path.sep)) throw new Error(`Referencia fuera del proyecto: ${name}`);
    try { await access(full); }
    catch { throw new Error(`Referencia inexistente: ${name}=${relative}`); }
  }
  return manifest;
}

export function resolveConfig(manifest, { execution = {}, classification } = {}) {
  const config = {};
  const sources = {};
  for (const section of ['execution', 'testing', 'spec', 'review', 'workflows', 'coordination', 'modelRouting']) {
    config[section] = {};
    sources[section] = {};
    for (const [key, value] of Object.entries(defaults[section] || {})) {
      if (key === 'rules') continue;
      config[section][key] = value;
      sources[section][key] = 'default';
    }
    for (const [key, value] of Object.entries(manifest[section] || {})) {
      config[section][key] = value;
      sources[section][key] = 'project';
    }
    for (const [key, value] of Object.entries(execution[section] || {})) {
      if (!(key in config[section])) throw new Error(`Override de ejecución desconocido: ${section}.${key}`);
      config[section][key] = value;
      sources[section][key] = 'execution';
    }
  }
  config.roles = {};
  sources.roles = {};
  for (const [role, fallback] of Object.entries(defaults.roles)) {
    let selected = fallback;
    let source = 'default';
    if (classification) {
      const rule = defaults.modelRouting.rules.find(item => item.classification === classification && item.role === role);
      if (rule) { selected = { profile: rule.profile, effort: rule.effort }; source = `rule:${rule.id}`; }
    }
    if (manifest.roles?.[role]) { selected = manifest.roles[role]; source = 'project'; }
    if (execution.roles?.[role]) { selected = execution.roles[role]; source = 'execution'; }
    config.roles[role] = selected;
    sources.roles[role] = source;
  }
  config.memory = manifest.memory || null;
  config.projectId = manifest.projectId;
  config.harnessVersion = manifest.harnessVersion;
  config.modelRouting.rules = defaults.modelRouting.rules;
  const effectiveManifest = { ...manifest, ...Object.fromEntries(['execution', 'testing', 'spec', 'review', 'workflows', 'coordination', 'roles'].map(section => [section, config[section]])) };
  if (!validateSchema(effectiveManifest)) throw new Error(`Política efectiva inválida: ${validateSchema.errors.map(e => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  const requestedModels = Object.fromEntries(Object.entries(config.roles).map(([role, choice]) => [role, { model: codexModels[choice.profile], effort: choice.effort }]));
  return { config, sources, classification: classification || null, requestedModels, runtimeModels: 'unverified' };
}

export async function initProject(project) {
  const file = manifestPath(project);
  try { await access(file); throw new Error(`Ya existe ${file}; no se modificó`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const projectId = path.basename(path.resolve(project)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(projectId)) throw new Error('No se pudo derivar un projectId válido del nombre de carpeta');
  const references = {};
  for (const [name, relative] of Object.entries({ instructions: 'AGENTS.md', roadmap: 'docs/PLAN.md', commands: 'package.json' })) {
    try { await access(path.join(project, relative)); references[name] = relative; } catch { /* referencia opcional */ }
  }
  const manifest = { schemaVersion: 1, projectId, harnessVersion: packageInfo.version, references };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return file;
}
