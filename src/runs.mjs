import { mkdir, readFile, writeFile, readdir, realpath, unlink, rmdir, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { resolveConfig } from './config.mjs';
import { captureSnapshot, captureCheckpointSnapshot } from './snapshot.mjs';

const lockRoot = () => path.resolve(process.env.HARNESS_STATE_DIR || path.join(os.homedir(), '.harness-nicovon24'), 'locks');
const digest = value => createHash('sha256').update(value).digest('hex');
const runFile = (project, run) => path.join(project, 'harness/.local/runs', run, 'state.json');
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

async function writeRunState(project, state) {
  const file = runFile(project, state.runId);
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, file);
}

async function withRunWriter(project, run, token, action) {
  if (!/^[a-f0-9-]{36}$/.test(run || '')) throw new Error('runId inválido');
  const directory = path.join(project, 'harness/.local/runs', run, 'writer.lock');
  const deadline = Date.now() + 10000;
  while (true) {
    try { await mkdir(directory); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() > deadline) throw new Error('Otra escritura del run sigue activa; no se sobrescribió el estado');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  try {
    await writeFile(path.join(directory, 'owner.json'), JSON.stringify({ runId: run, pid: process.pid, acquiredAt: new Date().toISOString() }), { flag: 'wx' });
    return await action(await readOwned(project, run, token));
  } finally {
    try { await unlink(path.join(directory, 'owner.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rmdir(directory);
  }
}

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
      policy: resolveConfig(manifest), locks, checks: [], codeSnapshot: null, specSnapshot: null, nextStep: null, memorySync: 'none' };
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
  if (!options.phase || !options.next) throw new Error('Se requieren --phase y --next');
  const hasCheck = options['check-command'] || options['check-result'] || options['check-scope'];
  if (hasCheck && !(options['check-command'] && options['check-result'])) throw new Error('Una comprobación requiere --check-command y --check-result');
  if (options['check-result'] && !['pass', 'fail', 'skipped'].includes(options['check-result'])) throw new Error('--check-result debe ser pass|fail|skipped');
  return withRunWriter(project, options.run, options.token, async state => {
    const snapshots = await captureCheckpointSnapshot(project, state.feature);
    state.phase = options.phase;
    state.nextStep = options.next;
    state.updatedAt = new Date().toISOString();
    state.checkpointSeq = (state.checkpointSeq || 0) + 1;
    state.codeSnapshot = snapshots.codeSnapshot;
    state.specSnapshot = snapshots.specSnapshot;
    if (hasCheck) state.checks.push({ command: options['check-command'], result: options['check-result'], scope: options['check-scope'] || null,
      source: 'caller-reported', recordedAt: state.updatedAt });
    const event = { format: 1, projectId: state.projectId, runId: state.runId, feature: state.feature, phase: state.phase,
      nextStep: state.nextStep, codeSnapshot: state.codeSnapshot, specSnapshot: state.specSnapshot, checks: state.checks, createdAt: state.updatedAt };
    const eventId = digest(JSON.stringify({ runId: event.runId, sequence: state.checkpointSeq }));
    state.queuedEvents = [...(state.queuedEvents || []), eventId];
    state.memorySync = 'pending';
    const queueDir = path.join(project, 'harness/.local/memory-queue');
    await mkdir(queueDir, { recursive: true });
    const queueFile = path.join(queueDir, `${eventId}.json`);
    const content = JSON.stringify({ id: eventId, ...event }, null, 2) + '\n';
    try { await writeFile(queueFile, content, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await readFile(queueFile, 'utf8') !== content) throw new Error(`Evento ${eventId} ya existe con otro contenido; revisar antes de repetir checkpoint`);
    }
    await writeRunState(project, state);
    return { runId: state.runId, phase: state.phase, nextStep: state.nextStep, codeSnapshot: state.codeSnapshot,
      specSnapshot: state.specSnapshot, checks: state.checks.length, memorySync: state.memorySync, queuedEvent: eventId };
  });
}

export async function endRun(project, options) {
  if (!options['workers-stopped']) throw new Error('Se requiere --workers-stopped después de comprobar que ningún worker sigue escribiendo');
  return withRunWriter(project, options.run, options.token, async state => {
    state.status = 'ending';
    await writeRunState(project, state);
    for (const name of state.locks) {
      const directory = path.join(lockRoot(), name);
      await unlink(path.join(directory, 'owner.json'));
      await rmdir(directory);
    }
    state.status = 'ended';
    state.endedAt = new Date().toISOString();
    await writeRunState(project, state);
    return { runId: state.runId, status: state.status };
  });
}

export async function listRuns(project, { verify = false } = {}) {
  let names;
  try { names = await readdir(path.join(project, 'harness/.local/runs')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const name of names) {
    try {
      const state = await readJson(runFile(project, name));
      const item = { runId: state.runId, feature: state.feature, phase: state.phase, status: state.status, nextStep: state.nextStep, updatedAt: state.updatedAt || state.startedAt };
      if (state.queuedEvents?.length) {
        const receipts = await Promise.all(state.queuedEvents.map(async id => {
          try { const value = await readJson(path.join(project, 'harness/.local/memory-receipts', `${id}.json`)); return value.id === id && value.remoteId === id; }
          catch { return false; }
        }));
        item.memorySync = receipts.every(Boolean) ? 'confirmed' : 'pending';
      } else item.memorySync = state.memorySync || 'none';
      if (verify) {
        const current = await captureCheckpointSnapshot(project, state.feature);
        const code = state.codeSnapshot?.status === 'captured' && current.codeSnapshot.status === 'captured' && state.codeSnapshot.sha256 === current.codeSnapshot.sha256;
        const spec = state.specSnapshot?.status === 'captured' && current.specSnapshot.status === 'captured' && state.specSnapshot.sha256 === current.specSnapshot.sha256;
        item.resumeValidation = code && spec ? 'current' : 'needs-revalidation';
        item.codeMatches = code;
        item.specMatches = spec;
      }
      result.push(item);
    } catch { result.push({ runId: name, error: 'checkpoint ilegible' }); }
  }
  return result;
}

export async function recordReview(project, options) {
  if (!['pass', 'fail'].includes(options.verdict)) throw new Error('Se requiere --verdict pass|fail');
  if (!['self', 'independent'].includes(options.reviewer)) throw new Error('Se requiere --reviewer self|independent');
  if (options.reviewer === 'independent' && !options['review-session']) throw new Error('La revisión independiente requiere --review-session');
  return withRunWriter(project, options.run, options.token, async state => {
    const snapshot = await captureSnapshot(project, state.feature);
    state.review = { verdict: options.verdict, reviewer: options.reviewer, reviewerSession: options['review-session'] || null,
      independence: 'declared-by-caller', snapshot, recordedAt: new Date().toISOString() };
    await writeRunState(project, state);
    return { runId: state.runId, review: state.review };
  });
}

export async function reviewStatus(project, options) {
  if (!/^[a-f0-9-]{36}$/.test(options.run || '')) throw new Error('runId inválido');
  const state = await readJson(runFile(project, options.run));
  if (!state.review) return { runId: state.runId, status: 'pending' };
  const current = await captureSnapshot(project, state.feature);
  const sameCode = current.codeSha256 === state.review.snapshot.codeSha256;
  const sameAcceptance = current.acceptanceSha256 === state.review.snapshot.acceptanceSha256;
  return { runId: state.runId, status: sameCode && sameAcceptance && state.review.verdict === 'pass' ? 'current' : 'stale-or-failed',
    sameCode, sameAcceptance, verdict: state.review.verdict, reviewer: state.review.reviewer, independence: state.review.independence };
}
