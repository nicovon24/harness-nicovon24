import { mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { renderMemory, verifyDurableRef } from './memory.mjs';
import { recordUsage } from './usage.mjs';

const endpoint = 'https://api.supermemory.ai';
const local = (project, folder, id) => path.join(project, 'harness/.local', folder, `${id}.json`);
const namespace = manifest => manifest.memory?.namespace || manifest.projectId;
const marker = id => `[harness pilot ${id}]`;
const hash = value => createHash('sha256').update(value).digest('hex');
async function readOptional(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, file);
}
async function withQueueWriter(project, action) {
  const dir = path.join(project, 'harness/.local/memory-sync.lock');
  await mkdir(path.dirname(dir), { recursive: true });
  try { await mkdir(dir); } catch (error) { if (error.code === 'EEXIST') throw new Error('Otra sincronización de memoria sigue activa'); throw error; }
  try {
    await writeFile(path.join(dir, 'owner.json'), JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }), { flag: 'wx' });
    return await action();
  } finally { await unlink(path.join(dir, 'owner.json')); await rmdir(dir); }
}
function retryAfter(response) {
  const value = response.headers.get('Retry-After');
  if (!value) return null;
  const seconds = Number(value);
  const date = Number.isFinite(seconds) ? new Date(Date.now() + Math.max(0, seconds) * 1000) : new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}
async function request(project, manifest, fetchImpl, apiKey, type, method, route, body, retry = false) {
  const requestId = await recordUsage(project, { stage: 'attempt', projectId: manifest.projectId, type, method,
    bytesSent: body ? Buffer.byteLength(JSON.stringify(body), 'utf8') : 0, retry, additionalOperation: false });
  try {
    const response = await fetchImpl(endpoint + route, { method, headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    const after = retryAfter(response);
    await recordUsage(project, { stage: 'result', projectId: manifest.projectId, type, requestId, outcome: response.ok || response.status === 404 ? 'success' : 'error', status: response.status, retryAfterUtc: after });
    if (response.status === 404) return { missing: true };
    if (!response.ok) { const error = new Error(`Supermemory HTTP ${response.status}`); error.status = response.status; error.retryAfterUtc = after; throw error; }
    return response.json();
  } catch (error) {
    if (!error.status) await recordUsage(project, { stage: 'result', projectId: manifest.projectId, type, requestId, outcome: 'error', status: 'network' });
    throw error;
  }
}
async function safeRequest(project, manifest, fetchImpl, apiKey, type, method, route, body) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await request(project, manifest, fetchImpl, apiKey, type, method, route, body, attempt > 0); }
    catch (error) {
      last = error;
      if (error.status === 402 || error.status === 401 || error.status === 403 || error.status === 429 || (error.status && error.status < 500)) break;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw last;
}
async function selectedEvent(project, manifest, id, legacyNamespace) {
  if (!/^[a-f0-9]{64}$/.test(id || '')) throw new Error('Se requiere --event con ID de 64 caracteres hexadecimales');
  const event = await readOptional(local(project, 'memory-queue', id));
  if (!event || event.id !== id || event.projectId !== manifest.projectId) throw new Error('Evento ausente o de otro proyecto');
  const target = event.target || (legacyNamespace ? { provider: 'supermemory', namespace: legacyNamespace, projectId: event.projectId } : null);
  if (!target) throw new Error('Evento legacy sin destino fijo; indicar --namespace');
  if (target.provider !== 'supermemory' || target.projectId !== manifest.projectId || !/^[a-zA-Z0-9_:-]{1,100}$/.test(target.namespace)) throw new Error('Destino remoto inválido');
  if (!event.target) {
    const priorAttempt = await readOptional(local(project, 'memory-attempts', id));
    const priorReceipt = await readOptional(local(project, 'memory-receipts', id));
    if ((priorAttempt && JSON.stringify(priorAttempt.target) !== JSON.stringify(target)) || (priorReceipt && JSON.stringify(priorReceipt.target) !== JSON.stringify(target))) throw new Error('Evento legacy con intento o recibo de destino incierto; conservar evidencia');
  }
  if (event.runId) {
    const state = await readOptional(local(project, `runs/${event.runId}`, 'state'));
    const pending = await readOptional(path.join(project, 'harness/.local/runs', event.runId, 'checkpoint-pending.json'));
    if (pending || !state?.queuedEvents?.includes(id)) throw new Error('Checkpoint inconcluso: no se exportó el evento');
  }
  if (!event.target) {
    await atomicJson(local(project, 'memory-queue', id), { ...event, target });
    event.target = target;
  }
  return { event, target };
}
function contentOf(event) {
  return [marker(event.id), `Proyecto: ${event.projectId}`, event.summary || `Feature: ${event.feature}\nFase: ${event.phase}\nPróximo paso: ${event.nextStep}\nCódigo: ${event.codeSnapshot?.sha256 || 'sin verificar'}\nAceptación: ${event.specSnapshot?.sha256 || 'sin verificar'}`,
    event.ref ? `Fuente: ${event.ref}` : ''].filter(Boolean).join('\n');
}
export async function publishMemory(project, manifest, { text, ref, sessionId, agentId = 'coordinator' } = {}) {
  if (!text?.trim() || !ref || !sessionId || Buffer.byteLength(text, 'utf8') > 2048) throw new Error('Se requieren texto breve, --ref y --session-id');
  if (!await verifyDurableRef(project, ref, text)) throw new Error('La fuente duradera no contiene el resumen');
  const id = hash(JSON.stringify({ projectId: manifest.projectId, ref, text: text.trim(), sessionId, nonce: randomUUID() }));
  const event = { format: 2, id, projectId: manifest.projectId, summary: text.trim(), ref, sessionId, agentId, createdAt: new Date().toISOString(),
    target: { provider: 'supermemory', namespace: namespace(manifest), projectId: manifest.projectId } };
  await mkdir(path.dirname(local(project, 'memory-queue', id)), { recursive: true });
  await writeFile(local(project, 'memory-queue', id), JSON.stringify(event, null, 2) + '\n', { flag: 'wx' });
  return { queuedEvent: id, status: 'pending', target: event.target };
}
export async function syncMemory(project, manifest, { pilot = false, eventId, legacyNamespace, apiKey = process.env.SUPERMEMORY_API_KEY, fetchImpl = fetch } = {}) {
  if (!pilot) throw new Error('Sincronización remota desactivada; usar --pilot --event <id>');
  if (!apiKey) throw new Error('Falta SUPERMEMORY_API_KEY; evento pendiente');
  return withQueueWriter(project, async () => {
    const { event, target } = await selectedEvent(project, manifest, eventId, legacyNamespace);
    const receiptFile = local(project, 'memory-receipts', event.id), attemptFile = local(project, 'memory-attempts', event.id);
    const content = contentOf(event), payloadHash = hash(content);
    const receipt = await readOptional(receiptFile), attempt = await readOptional(attemptFile);
    if (receipt) {
      if (receipt.id !== event.id || receipt.remoteId !== event.id || receipt.payloadHash !== payloadHash || JSON.stringify(receipt.target) !== JSON.stringify(target)) throw new Error('Recibo divergente; no se reinterpretó el destino');
      return { synced: 0, pending: 0, status: receipt.status, namespace: target.namespace };
    }
    if (attempt && (attempt.payloadHash !== payloadHash || JSON.stringify(attempt.target) !== JSON.stringify(target))) throw new Error('Intento previo con otro destino o payload');
    if (attempt?.retryAfterUtc && Date.now() < Date.parse(attempt.retryAfterUtc)) return { synced: 0, pending: 1, status: 'rate-limited', retryAfterUtc: attempt.retryAfterUtc };
    const route = `/ns/${encodeURIComponent(target.namespace)}/document`;
    let previous;
    try { previous = await safeRequest(project, manifest, fetchImpl, apiKey, 'reconcile', 'GET', `${route}/${event.id}`); }
    catch (error) {
      if (error.status === 429) await atomicJson(attemptFile, { id: event.id, target, payloadHash, postStarted: Boolean(attempt?.postStarted), retryAfterUtc: error.retryAfterUtc || null, lastStatus: 429 });
      throw error;
    }
    if (!previous.missing) {
      if (previous.id !== event.id || previous.content !== content || (previous.metadata?.projectId && previous.metadata.projectId !== event.projectId)) throw new Error('Documento remoto divergente; conservar evidencia');
      await atomicJson(receiptFile, { id: event.id, remoteId: previous.id, target, payloadHash, status: 'reconciled', confirmedAt: new Date().toISOString() });
      return { synced: 1, pending: 0, status: 'reconciled', namespace: target.namespace };
    }
    if (attempt?.postStarted) throw new Error('Envío previo de resultado incierto; no se reintenta automáticamente');
    const nextAttempt = { id: event.id, target, payloadHash, postStarted: true, attemptedAt: new Date().toISOString() };
    await atomicJson(attemptFile, nextAttempt);
    let saved;
    try { saved = await request(project, manifest, fetchImpl, apiKey, 'write', 'POST', route,
      { id: event.id, content, taskType: 'memory', dreaming: 'dynamic', metadata: { projectId: event.projectId, eventId: event.id, ref: event.ref || '', source: event.summary ? 'harness-pilot' : 'harness-checkpoint' } }); }
    catch (error) {
      if (error.status === 402 || error.status === 429) await atomicJson(attemptFile, { ...nextAttempt, postStarted: false, retryAfterUtc: error.retryAfterUtc || null, lastStatus: error.status });
      throw error;
    }
    if (saved.id !== event.id) throw new Error('Supermemory no confirmó el ID; resultado incierto');
    await atomicJson(receiptFile, { id: event.id, remoteId: saved.id, target, payloadHash, status: 'accepted', confirmedAt: new Date().toISOString() });
    return { synced: 1, pending: 0, status: 'accepted', namespace: target.namespace };
  });
}
export async function recallMemory(project, manifest, { pilot = false, query = 'objetivo decisiones pendientes y próximo paso del proyecto', apiKey = process.env.SUPERMEMORY_API_KEY, fetchImpl = fetch } = {}) {
  if (!pilot) return { ...(await renderMemory(project, manifest)), remoteStatus: 'disabled' };
  if (!apiKey) return { ...(await renderMemory(project, manifest)), remoteStatus: 'unavailable: SUPERMEMORY_API_KEY unset' };
  try {
    const ns = namespace(manifest);
    const response = await safeRequest(project, manifest, fetchImpl, apiKey, 'search', 'POST', `/ns/${encodeURIComponent(ns)}/search`, { query, searchMode: 'memories', limit: 10, rerank: 'none', rewriteQuery: false });
    if (!Array.isArray(response.results)) throw new Error('formato de búsqueda no reconocido');
    const remote = response.results.map(item => ({ title: item.title || 'recuerdo', memory: item.memory, id: item.id, namespace: item.namespace || ns,
      projectId: item.metadata?.projectId || null, documentId: item.included?.document?.id || null, metadata: item.metadata,
      conflictingProject: Boolean(item.projectId && item.metadata?.projectId && item.projectId !== item.metadata.projectId) })).filter(item => typeof item.memory === 'string');
    const accepted = remote.filter(item => !item.conflictingProject && item.id && item.namespace === ns && item.projectId === manifest.projectId);
    return { ...(await renderMemory(project, manifest, JSON.stringify(accepted))), remoteStatus: 'searched', fetched: remote.length, accepted: accepted.length, unknownOrForeign: remote.length - accepted.length };
  } catch (error) { return { ...(await renderMemory(project, manifest)), remoteStatus: `pending: remote search failed (${error.status || 'network'})` }; }
}
export async function memoryStatus(project, manifest) {
  let names;
  try { names = (await readdir(path.join(project, 'harness/.local/memory-queue'))).filter(name => /^[a-f0-9]{64}\.json$/.test(name)); }
  catch (error) { if (error.code === 'ENOENT') names = []; else throw error; }
  const events = [];
  for (const name of names) {
    const event = await readOptional(local(project, 'memory-queue', name.slice(0, -5)));
    if (event.projectId !== manifest.projectId) continue;
    const receipt = await readOptional(local(project, 'memory-receipts', event.id));
    const attempt = await readOptional(local(project, 'memory-attempts', event.id));
    const state = event.runId ? await readOptional(local(project, `runs/${event.runId}`, 'state')) : null;
    const pending = event.runId ? await readOptional(path.join(project, 'harness/.local/runs', event.runId, 'checkpoint-pending.json')) : null;
    const target = event.target || attempt?.target || receipt?.target || null;
    const receiptValid = receipt && receipt.id === event.id && receipt.remoteId === event.id && receipt.payloadHash === hash(contentOf(event)) && JSON.stringify(receipt.target) === JSON.stringify(target);
    events.push({ id: event.id, target,
      status: pending || (event.runId && !state?.queuedEvents?.includes(event.id)) ? 'checkpoint-incomplete' : receipt ? receiptValid ? receipt.status : 'receipt-unverified' : attempt?.postStarted ? 'uncertain' : 'pending',
      retryAfterUtc: attempt?.retryAfterUtc || null });
  }
  return { pilot: 'disabled-by-default', events };
}
export async function inspectProcessing(project, manifest, { eventId, apiKey = process.env.SUPERMEMORY_API_KEY, fetchImpl = fetch, waitSeconds = 0 } = {}) {
  if (!apiKey) throw new Error('Falta SUPERMEMORY_API_KEY');
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 300) throw new Error('--wait-seconds debe estar entre 0 y 300');
  const { event, target } = await selectedEvent(project, manifest, eventId);
  const receipt = await readOptional(local(project, 'memory-receipts', eventId));
  if (!receipt || JSON.stringify(receipt.target) !== JSON.stringify(target)) throw new Error('Documento aún no aceptado');
  const deadline = Date.now() + waitSeconds * 1000;
  let result;
  for (let count = 0; count < 30; count++) {
    result = await safeRequest(project, manifest, fetchImpl, apiKey, 'processing', 'GET', `/ns/${encodeURIComponent(target.namespace)}/document/${eventId}?include=memories`);
    if (result.missing) return { status: 'missing' };
    const processing = result.system?.status || 'unknown', extraction = result.system?.dreamingStatus || 'unknown';
    if (processing === 'done' && extraction === 'done') {
      const found = await safeRequest(project, manifest, fetchImpl, apiKey, 'search', 'POST', `/ns/${encodeURIComponent(target.namespace)}/search`,
        { query: event.summary || event.nextStep || marker(eventId), searchMode: 'memories', limit: 10, rerank: 'none', rewriteQuery: false });
    const recovered = Array.isArray(found.results) && found.results.some(item => (!item.namespace || item.namespace === target.namespace) && item.metadata?.projectId === event.projectId && item.metadata?.eventId === eventId);
      if (recovered || Date.now() + 10000 > deadline) return { status: processing, extraction, recoverable: recovered };
    }
    if (processing === 'failed' || Date.now() + 10000 > deadline) return { status: processing, extraction, recoverable: false };
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  return { status: result.system?.status || 'unknown', extraction: result.system?.dreamingStatus || 'unknown', recoverable: false };
}
