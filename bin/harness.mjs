#!/usr/bin/env node
import path from 'node:path';
import { access } from 'node:fs/promises';
import { defaults, initProject, loadManifest, packageInfo, resolveConfig } from '../src/config.mjs';
import { applyInstallation, installationPlan } from '../src/install.mjs';
import { beginRun, checkpointRun, endRun, listRuns, recordReview, reviewStatus } from '../src/runs.mjs';

function parse(argv) {
  const command = argv[0];
  const options = {};
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Argumento inesperado: ${arg}`);
    const key = arg.slice(2);
    if (['apply', 'dry-run', 'workers-stopped'].includes(key)) options[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Falta valor para ${arg}`);
      options[key] = argv[++i];
    }
  }
  const allowed = ['project', 'runtime', 'apply', 'dry-run', 'classification', 'feature', 'run', 'token', 'phase', 'next', 'workers-stopped', 'role', 'profile', 'effort', 'mode', 'testing', 'verdict', 'reviewer', 'review-session'];
  for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new Error(`Opción desconocida: --${key}`);
  return { command, options };
}

const print = value => console.log(JSON.stringify(value, null, 2));
const exists = async file => { try { await access(file); return true; } catch { return false; } };

async function main() {
  const { command, options } = parse(process.argv.slice(2));
  if (command === 'help' || !command) {
    console.log('Uso: node bin/harness.mjs <init|validate|config|doctor|install|uninstall|begin|checkpoint|end|runs|review-record|review-status> --project <ruta> [opciones]');
    return;
  }
  if (!options.project) throw new Error('Se requiere --project <ruta>');
  const project = path.resolve(options.project);
  if (!(await exists(project))) throw new Error(`Proyecto inexistente: ${project}`);
  if (command === 'init') { print({ created: await initProject(project) }); return; }
  const manifest = await loadManifest(project);
  if (command === 'validate') { print({ valid: true, projectId: manifest.projectId, harnessVersion: manifest.harnessVersion }); return; }
  if (command === 'config') {
    if (options.classification && !defaults.modelRouting.rules.some(rule => rule.classification === options.classification)) throw new Error('Clasificación desconocida; conservar default sin --classification');
    if ((options.role || options.profile || options.effort) && !(options.role && options.profile && options.effort)) throw new Error('Un override de rol requiere --role, --profile y --effort');
    if (options.role && !Object.hasOwn(defaults.roles, options.role)) throw new Error('Rol desconocido');
    const execution = {};
    if (options.role) execution.roles = { [options.role]: { profile: options.profile, effort: options.effort } };
    if (options.mode) execution.execution = { mode: options.mode };
    if (options.testing) execution.testing = { strategy: options.testing };
    print(resolveConfig(manifest, { classification: options.classification, execution }));
    return;
  }
  if (command === 'doctor') {
    let plan;
    try { plan = await installationPlan(project, 'install'); }
    catch (error) { plan = { error: error.message }; }
    print({ projectId: manifest.projectId, node: process.version, platform: process.platform, harnessSourceVersion: packageInfo.version,
      manifestVersion: manifest.harnessVersion, installation: plan.error ? 'error' : plan.changes.every(item => item.operation === 'keep') ? 'files-match' : 'needs-attention',
      installationDetails: plan.error || plan.changes.filter(item => item.operation !== 'keep'),
      runtimeModels: 'unverified', skillDiscovery: 'unverified', delegation: 'unverified', memory: 'unverified' });
    return;
  }
  if (command === 'install' || command === 'uninstall') {
    if (options.runtime !== 'codex') throw new Error('Se requiere --runtime codex');
    if (options.apply && options['dry-run']) throw new Error('--apply y --dry-run son excluyentes');
    if (command === 'install' && manifest.harnessVersion !== packageInfo.version) throw new Error(`El manifiesto fija ${manifest.harnessVersion}; este checkout es ${packageInfo.version}. Actualizá la versión explícitamente antes de instalar.`);
    const plan = await installationPlan(project, command);
    if (options.apply) print(await applyInstallation(project, command));
    else print({ action: command, preview: true, version: plan.version, changes: plan.changes });
    return;
  }
  if (command === 'begin') { print(await beginRun(project, manifest, options.feature)); return; }
  if (command === 'checkpoint') { print(await checkpointRun(project, options)); return; }
  if (command === 'end') { print(await endRun(project, options)); return; }
  if (command === 'runs') { print(await listRuns(project)); return; }
  if (command === 'review-record') { print(await recordReview(project, options)); return; }
  if (command === 'review-status') { print(await reviewStatus(project, options)); return; }
  throw new Error(`Comando desconocido: ${command}`);
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
