import { mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderMemory } from './memory.mjs';

const endpoint = 'https://api.supermemory.ai';
const queueDir = project => path.join(project, 'harness/.local/memory-queue');
const receiptDir = project => path.join(project, 'harness/.local/memory-receipts');
const attemptDir = project => path.join(project, 'harness/.local/memory-attempts');
const namespace = manifest => manifest.memory?.namespace || manifest.projectId;
const marker = id => `[harness checkpoint ${id}]`;

async function request(fetchImpl, apiKey, method, route, body) {
  const response = await fetchImpl(endpoint + route, { method, headers: {
    Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return { missing: true };
  if (!response.ok) throw new Error(`Supermemory HTTP ${response.status}`);
  return response.json();
}

async function withQueueWriter(project, action) {
  const directory = path.join(project, 'harness/.local/memory-sync.lock');
  await mkdir(path.dirname(directory), { recursive: true });
  try { await mkdir(directory); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Otra sincronización de memoria sigue activa'); throw error; }
  try {
    await writeFile(path.join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }), { flag: 'wx' });
    return await action();
  } finally {
    await unlink(path.join(directory, 'owner.json'));
    await rmdir(directory);
  }
}

async function receipt(project, id, remoteId, status) {
  await mkdir(receiptDir(project), { recursive: true });
  const file = path.join(receiptDir(project), `${id}.json`);
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify({ id, remoteId, status, confirmedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
  await rename(temp, file);
}

export async function syncMemory(project, manifest, { apiKey = process.env.SUPERMEMORY_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('Falta SUPERMEMORY_API_KEY; la cola local permanece pendiente');
  return withQueueWriter(project, async () => {
    let names;
    try { names = (await readdir(queueDir(project))).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort(); }
    catch (error) { if (error.code === 'ENOENT') return { synced: 0, pending: 0, namespace: namespace(manifest) }; throw error; }
    let synced = 0, pending = 0;
    for (const name of names) {
      const id = name.slice(0, -5);
      try {
        const existing = JSON.parse(await readFile(path.join(receiptDir(project), name), 'utf8'));
        if (existing.id !== id || existing.remoteId !== id) throw new Error(`Recibo local ${name} no coincide con el evento`);
        continue;
      }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      pending++;
      const event = JSON.parse(await readFile(path.join(queueDir(project), name), 'utf8'));
      if (event.id !== id || event.projectId !== manifest.projectId) throw new Error(`Evento de memoria inválido: ${name}`);
      const route = `/ns/${encodeURIComponent(namespace(manifest))}/document`;
      const previous = await request(fetchImpl, apiKey, 'GET', `${route}/${id}`);
      if (!previous.missing) {
        if (previous.id !== id || !String(previous.content || '').includes(marker(id))) throw new Error(`Documento remoto ${id} no coincide; no se marcará sincronizado`);
        await receipt(project, id, previous.id, 'reconciled');
        synced++; pending--;
        continue;
      }
      try {
        await readFile(path.join(attemptDir(project), name));
        throw new Error(`Envío previo de ${id} con resultado incierto: comprobar Supermemory antes de reintentar`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const content = [marker(id), `Proyecto: ${event.projectId}`, `Feature: ${event.feature}`, `Fase: ${event.phase}`, `Próximo paso: ${event.nextStep}`,
        `Código: ${event.codeSnapshot?.sha256 || 'sin verificar'}`, `Aceptación: ${event.specSnapshot?.sha256 || 'sin verificar'}`].join('\n');
      await mkdir(attemptDir(project), { recursive: true });
      await writeFile(path.join(attemptDir(project), name), JSON.stringify({ id, attemptedAt: new Date().toISOString() }) + '\n', { flag: 'wx' });
      const saved = await request(fetchImpl, apiKey, 'POST', route, { id, content, taskType: 'memory', metadata: { projectId: event.projectId, runId: event.runId, eventId: id, source: 'harness-checkpoint' } });
      if (saved.id !== id) throw new Error(`Supermemory no confirmó el ID ${id}; la cola permanece pendiente`);
      await receipt(project, id, saved.id, saved.status || 'accepted');
      synced++; pending--;
    }
    return { synced, pending, namespace: namespace(manifest) };
  });
}

export async function recallMemory(project, manifest, { query = 'objetivo decisiones pendientes y próximo paso del proyecto', apiKey = process.env.SUPERMEMORY_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) return { ...(await renderMemory(project, manifest)), remoteStatus: 'unavailable: SUPERMEMORY_API_KEY unset' };
  try {
    const response = await request(fetchImpl, apiKey, 'POST', `/ns/${encodeURIComponent(namespace(manifest))}/search`, { query, searchMode: 'memories', limit: 10 });
    if (!Array.isArray(response.results)) throw new Error('formato de búsqueda no reconocido');
    const remote = response.results.map(item => ({ title: item.title || 'recuerdo', memory: item.memory, projectId: manifest.projectId })).filter(item => typeof item.memory === 'string');
    return { ...(await renderMemory(project, manifest, JSON.stringify(remote))), remoteStatus: 'searched', fetched: remote.length };
  } catch {
    return { ...(await renderMemory(project, manifest)), remoteStatus: 'pending: remote search failed' };
  }
}
