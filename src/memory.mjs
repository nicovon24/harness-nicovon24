import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lstat } from 'node:fs/promises';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const MEMORY_LIMITS = Object.freeze({ maxActiveDays: 5, maxLines: 150, maxBytes: 8192, maxPointsPerDay: 5, expireOnInactivity: false, defaultTimeZone: 'America/Argentina/Buenos_Aires' });
const memoryFile = project => path.join(project, 'MEMORY.md');
const hash = value => createHash('sha256').update(value).digest('hex');
const priority = { resume: 100, blocker: 95, decision: 90, verified: 85, progress: 70, change: 60, test: 55 };
const validKinds = Object.keys(priority);
const json = value => JSON.stringify(value, null, 2) + '\n';
function checkBudget(text, limits = MEMORY_LIMITS) {
  const lines = text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
  const bytes = Buffer.byteLength(text, 'utf8');
  return { valid: lines <= limits.maxLines && bytes <= limits.maxBytes, lines, bytes };
}
function activeDay(timestamp, timezone) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.valueOf())) throw new Error('timestamp UTC inválido');
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
async function git(project, args) {
  try { return (await exec('git', args, { cwd: project, windowsHide: true })).stdout.trim(); } catch { return null; }
}
async function gitObjectExists(project, ref) {
  try { await exec('git', ['cat-file', '-e', ref + '^{commit}'], { cwd: project, windowsHide: true }); return true; }
  catch { return false; }
}
async function context(project, manifest) {
  const values = await Promise.all([git(project, ['rev-parse', '--show-toplevel']), git(project, ['branch', '--show-current']), git(project, ['rev-parse', 'HEAD'])]);
  return { projectId: manifest.projectId, worktree: values[0] || path.resolve(project), branch: values[1] || '(sin rama)', commit: values[2] || '(sin commit)' };
}
async function readCache(project) {
  try {
    const raw = await readFile(memoryFile(project), 'utf8');
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('MEMORY.md no usa formato estructurado; migrarlo antes de cargar o registrar memoria.'); }
    if (parsed.format !== 1 || !Array.isArray(parsed.entries)) throw new Error('Formato de MEMORY.md no compatible.');
    parsed.entries = parsed.entries.map((entry, index) => ({ ...entry, id: entry.id || 'legacy-' + hash(JSON.stringify({ index, entry })) }));
    return { raw, cache: parsed };
  } catch (error) { if (error.code === 'ENOENT') return { raw: '', cache: { format: 1, entries: [] } }; throw error; }
}
async function durable(project, ref, text = '', kind = '') {
  if (!ref || typeof ref !== 'string') return false;
  const relative = path.relative(path.resolve(project), path.resolve(project, ref));
  if (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) {
    const candidate = path.resolve(project, ref);
    try {
      if (!(await lstat(candidate)).isFile()) return false;
      const contents = (await readFile(candidate, 'utf8')).replace(/\s+/g, ' ').toLocaleLowerCase();
      return contents.includes(text.trim().replace(/\s+/g, ' ').toLocaleLowerCase());
    } catch (error) { if (error.code !== 'ENOENT') return false; }
  }
  if (!['change', 'test', 'verified'].includes(kind) || !/^(?:HEAD|[a-f0-9]{7,40})$/i.test(ref)) return false;
  return gitObjectExists(project, ref);
}
export async function verifyDurableRef(project, ref, text) { return durable(project, ref, text, 'decision'); }
async function acquire(project, sessionId, agentId) {
  const dir = path.join(project, 'harness/.local/memory-writer.lock');
  await mkdir(path.dirname(dir), { recursive: true });
  const deadline = Date.now() + 10000;
  while (true) {
    try {
      await mkdir(dir);
      await writeFile(path.join(dir, 'owner.json'), json({ sessionId, agentId, pid: process.pid, host: os.hostname(), acquiredAt: new Date().toISOString() }), { flag: 'wx' });
      return async () => rm(dir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() > deadline) throw new Error('Escritura de memoria ocupada; no se sobrescribió.');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
}
async function writeAtomic(project, cache) {
  const text = json(cache), budget = checkBudget(text);
  if (!budget.valid) throw new Error('La cache excede presupuesto (' + budget.lines + ' líneas, ' + budget.bytes + ' bytes).');
  const target = memoryFile(project), temp = target + '.' + randomUUID() + '.tmp';
  await writeFile(temp, text, { flag: 'wx' }); await rename(temp, target); return hash(text);
}
function compact(cache) {
  const entries = [...cache.entries], days = [...new Set(entries.map(item => item.day))].sort();
  while (days.length > MEMORY_LIMITS.maxActiveDays) { const old = days.shift(); for (let i = entries.length - 1; i >= 0; i--) if (entries[i].day === old) entries.splice(i, 1); }
  const byDay = new Map();
  for (const item of entries) byDay.set(item.day, [...(byDay.get(item.day) || []), item]);
  for (const [day, items] of byDay) { items.sort((a, b) => (priority[b.kind] || 0) - (priority[a.kind] || 0) || b.timestampUtc.localeCompare(a.timestampUtc)); byDay.set(day, items.slice(0, MEMORY_LIMITS.maxPointsPerDay)); }
  let kept = [...byDay.values()].flat();
  const fits = value => checkBudget(json({ ...cache, entries: value })).valid;
  kept.sort((a, b) => (priority[b.kind] || 0) - (priority[a.kind] || 0) || b.timestampUtc.localeCompare(a.timestampUtc));
  while (kept.length && !fits(kept)) kept.pop();
  return { ...cache, entries: kept };
}
export async function recordMemory(project, manifest, { kind, text, ref, sessionId, agentId = 'coordinator' }) {
  if (!validKinds.includes(kind)) throw new Error('kind permitido: ' + validKinds.join(', '));
  if (!text || !text.trim() || !ref || !sessionId) throw new Error('Se requieren --text, --ref durable y --session-id.');
  if (!await durable(project, ref, text, kind)) throw new Error('La referencia duradera no contiene el dato o no es comprobable: ' + ref + '; cache preservada.');
  const release = await acquire(project, sessionId, agentId);
  try {
    const { cache } = await readCache(project), timestampUtc = new Date().toISOString(), timezone = manifest.timeZone || MEMORY_LIMITS.defaultTimeZone;
    const entry = { id: randomUUID(), day: activeDay(timestampUtc, timezone), timestampUtc, kind, text: text.trim().replace(/\s+/g, ' '), ref, sessionId, agentId, ...await context(project, manifest) };
    if (cache.entries.some(item => item.day === entry.day && item.kind === kind && item.text === entry.text && item.ref === ref)) return { recorded: false, duplicate: true, version: hash(json(cache)), entries: cache.entries.length };
    cache.entries.push(entry);
    const compacted = compact(cache);
    const keptIds = new Set(compacted.entries.map(item => item.id));
    for (const removed of cache.entries) if (!keptIds.has(removed.id) && !await durable(project, removed.ref, removed.text, removed.kind)) {
      throw new Error('No se compactó: falta fuente duradera para conservar ' + removed.kind + ': ' + removed.ref);
    }
    if (!keptIds.has(entry.id)) throw new Error('La nueva actividad no cabe; cache previa intacta.');
    return { recorded: true, day: entry.day, version: await writeAtomic(project, compacted), entries: compacted.entries.length, limits: MEMORY_LIMITS };
  } finally { await release(); }
}
function remoteItems(input, projectId, expectedNamespace) {
  if (!input) return [];
  let values;
  try { const parsed = JSON.parse(input); values = Array.isArray(parsed) ? parsed : parsed.memories || parsed.results || []; } catch { throw new Error('Supermemory stdin requiere JSON: array, memories[] o results[].'); }
  return values.map(item => ({ source: 'Supermemory', title: String(item.title || item.metadata?.title || 'recuerdo'), text: String(item.content || item.memory || item.text || ''),
    projectId: item.metadata?.projectId || item.projectId || null, namespace: item.namespace || null, id: item.id || null,
    documentId: item.documentId || item.included?.document?.id || null, ref: item.metadata?.ref || null,
    conflictingProject: Boolean(item.projectId && item.metadata?.projectId && item.projectId !== item.metadata.projectId) }))
    .filter(item => !item.conflictingProject && item.projectId === projectId && item.namespace === expectedNamespace && item.id && item.text.trim());
}
function entryBlock(entry, current) {
  const currentKnown = current.branch !== '(sin rama)' && current.commit !== '(sin commit)';
  const matches = currentKnown && entry.projectId === current.projectId && entry.worktree === current.worktree && entry.branch === current.branch && entry.commit === current.commit;
  return ['- [' + entry.kind + '] ' + entry.text, '  UTC: ' + entry.timestampUtc + ' | sesión: ' + entry.sessionId + ' | agente: ' + entry.agentId, '  Ref: ' + entry.ref + ' | commit: ' + entry.commit, '  Revalidación: ' + (matches ? 'coincide repo/worktree/rama/commit' : 'pendiente: cambió o no se pudo confirmar repo/worktree/rama/commit')];
}
export async function renderMemory(project, manifest, remoteJson = '') {
  const { cache } = await readCache(project), timezone = manifest.timeZone || MEMORY_LIMITS.defaultTimeZone;
  const days = [...new Set(cache.entries.map(item => item.day))].sort().slice(-MEMORY_LIMITS.maxActiveDays);
  const local = cache.entries.filter(item => days.includes(item.day)).sort((a, b) => (priority[b.kind] || 0) - (priority[a.kind] || 0) || b.timestampUtc.localeCompare(a.timestampUtc));
  const ctx = await context(project, manifest);
  const localTexts = new Set(local.map(item => item.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
  const remote = remoteItems(remoteJson, manifest.projectId, manifest.memory?.namespace || manifest.projectId).filter(item => !localTexts.has(item.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
  let lines = ['# Contexto de memoria del harness', 'Proyecto consultado: ' + ctx.projectId, 'Namespace consultado: ' + (manifest.memory?.namespace || ctx.projectId), 'Worktree: ' + ctx.worktree, 'Rama: ' + ctx.branch, 'Commit: ' + ctx.commit, 'Zona horaria: ' + timezone, 'Límites globales: 5 días activos; 150 líneas; 8192 bytes UTF-8.', '', '## Cache local'];
  let omitted = 0;
  for (const e of local) {
    const block = ['### ' + e.day, ...entryBlock(e, ctx)];
    const next = [...lines, ...block];
    if (checkBudget(next.join('\n') + '\n').valid) lines = next; else omitted++;
  }
  if (remote.length) {
    const marker = [...lines, '', '## Recuerdos remotos'];
    if (checkBudget(marker.join('\n') + '\n').valid) {
      lines = marker;
      for (const e of remote) {
        const next = [...lines, '### Supermemory: ' + e.title,
          '  Origen: ' + e.projectId + ' | namespace: ' + (e.namespace || 'desconocido') + ' | ID: ' + (e.id || 'desconocido'),
          '  Documento: ' + (e.documentId || 'desconocido') + ' | Ref: ' + (e.ref || 'sin referencia'), '- ' + e.text];
        if (checkBudget(next.join('\n') + '\n').valid) lines = next; else omitted++;
      }
    } else omitted += remote.length;
  }
  if (omitted && checkBudget(lines.join('\n') + '\n[Omitidos por presupuesto global: ' + omitted + ']\n').valid) lines.push('[Omitidos por presupuesto global: ' + omitted + ']');
  const output = lines.join('\n').replace(/\n+$/, '') + '\n', budget = checkBudget(output);
  if (!budget.valid) throw new Error('No se pudo componer memoria dentro del presupuesto global.');
  return { output, budget, activeDays: days.length, entries: local.length, remoteEntries: remote.length, version: hash(json(cache)) };
}
export async function clearMemory(project, { sessionId = 'maintenance', agentId = 'coordinator' } = {}) {
  const release = await acquire(project, sessionId, agentId);
  try {
    const { cache } = await readCache(project);
    for (const entry of cache.entries) if (!await durable(project, entry.ref, entry.text, entry.kind)) throw new Error('No se limpió cache: falta fuente duradera para ' + entry.kind + ': ' + (entry.ref || '(sin referencia)'));
    return { cleared: true, verifiedDurableEntries: cache.entries.length, version: await writeAtomic(project, { format: 1, entries: [] }) };
  } finally { await release(); }
}
export function memoryBudget(text) { return checkBudget(text); }
