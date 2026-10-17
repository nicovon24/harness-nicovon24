import { mkdir, readFile, writeFile, readdir, realpath, unlink, rmdir, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { resolveConfig } from './config.mjs';

const lockRoot = () => path.resolve(process.env.HARNESS_STATE_DIR || path.join(os.homedir(), '.harness-nicovon24'), 'locks');
const digest = value => createHash('sha256').update(value).digest('hex');
const runFile = (project, run) => path.join(project, 'harness/.local/runs', run, 'state.json');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

function lockNames(projectId, checkout, feature) {
  return [`checkout-${digest(checkout)}`, `feature-${digest(`${projectId}:${feature}`)}`].sort();
}

async function readOwned(project, run, token) {
  if (!/^[a-f0-9-]{36}$/.test(run || '')) throw new Error('runId inválido');
  const state = await readJson(runFile(project, run));
  if (state.token !== token) throw new Error('Token de ejecución incorrecto');
  for (const name of state.locks) {
    const owner = await readJson(path.join(lockRoot(), name, 'owner.json'));
    if (owner.runId !== run || owner.token !== token) throw new Error(`Bloqueo perdido: ${name}`);
  }
  return state;
}

export async function beginRun(project, manifest, feature) {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(feature || '')) throw new Error('Se requiere --feature con slug válido');
  const checkout = await realpath(project);
  const runId = randomUUID();
  const token = randomUUID();
  const locks = lockNames(manifest.projectId, checkout, feature);
  const owner = { runId, token, projectId: manifest.projectId, checkout, feature, pid: process.pid, host: os.hostname(), acquiredAt: new Date().toISOString() };
  const acquired = [];
  await mkdir(lockRoot(), { recursive: true });
  try {
    for (const name of locks) {
      const directory = path.join(lockRoot(), name);
      try { await mkdir(directory); }
      catch (error) { if (error.code === 'EEXIST') throw new Error(`Bloqueo ocupado: ${name}`); throw error; }
      acquired.push(directory);
      await writeFile(path.join(directory, 'owner.json'), JSON.stringify(owner, null, 2) + '\n', { flag: 'wx' });
    }
    const state = { runId, token, projectId: manifest.projectId, checkout, feature, phase: 'started', status: 'active', startedAt: owner.acquiredAt,
      policy: resolveConfig(manifest), locks, checks: [], codeSnapshot: null, specSnapshot: null, nextStep: null, memorySync: 'pending' };
    const file = runFile(project, runId);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    return { runId, token, file, locks, note: 'Bloqueos cooperativos; conservar token y no liberar con workers activos' };
  } catch (error) {
    for (const directory of acquired.reverse()) {
      try { await unlink(path.join(directory, 'owner.json')); await rmdir(directory); } catch { /* retener si la limpieza no es segura */ }
    }
    throw error;
  }
}

export async function checkpointRun(project, options) {
  const state = await readOwned(project, options.run, options.token);
  if (!options.phase || !options.next) throw new Error('Se requieren --phase y --next');
  state.phase = options.phase;
  state.nextStep = options.next;
  state.updatedAt = new Date().toISOString();
  const event = { format: 1, projectId: state.projectId, runId: state.runId, feature: state.feature, phase: state.phase,
    nextStep: state.nextStep, codeSnapshot: state.codeSnapshot, specSnapshot: state.specSnapshot, createdAt: state.updatedAt };
  const eventId = digest(JSON.stringify({ runId: event.runId, phase: event.phase, nextStep: event.nextStep }));
  const queueDir = path.join(project, 'harness/.local/memory-queue');
  await mkdir(queueDir, { recursive: true });
  try { await writeFile(path.join(queueDir, `${eventId}.json`), JSON.stringify({ id: eventId, ...event }, null, 2) + '\n', { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const file = runFile(project, options.run);
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, file);
  return { runId: state.runId, phase: state.phase, nextStep: state.nextStep, memorySync: state.memorySync, queuedEvent: eventId };
}

export async function endRun(project, options) {
  if (!options['workers-stopped']) throw new Error('Se requiere --workers-stopped después de comprobar que ningún worker sigue escribiendo');
  const state = await readOwned(project, options.run, options.token);
  for (const name of state.locks) {
    const directory = path.join(lockRoot(), name);
    await unlink(path.join(directory, 'owner.json'));
    await rmdir(directory);
  }
  state.status = 'ended';
  state.endedAt = new Date().toISOString();
  await writeFile(runFile(project, options.run), JSON.stringify(state, null, 2) + '\n');
  return { runId: state.runId, status: state.status };
}

export async function listRuns(project) {
  let names;
  try { names = await readdir(path.join(project, 'harness/.local/runs')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const name of names) {
    try {
      const state = await readJson(runFile(project, name));
      result.push({ runId: state.runId, feature: state.feature, phase: state.phase, status: state.status, nextStep: state.nextStep, updatedAt: state.updatedAt || state.startedAt });
    } catch { result.push({ runId: name, error: 'checkpoint ilegible' }); }
  }
  return result;
}
