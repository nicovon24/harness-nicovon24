import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const exec = promisify(execFile);
const directory = project => path.join(project, 'harness/.local/memory-usage');

export async function recordUsage(project, value) {
  await mkdir(directory(project), { recursive: true });
  const id = randomUUID();
  const entry = { id, timestampUtc: new Date().toISOString(), ...value };
  await writeFile(path.join(directory(project), `${id}.json`), JSON.stringify(entry) + '\n', { flag: 'wx' });
  return id;
}

async function worktrees(project) {
  try {
    const { stdout } = await exec('git', ['-C', project, 'worktree', 'list', '--porcelain'], { windowsHide: true });
    return [...new Set([project, ...stdout.split(/\r?\n/).filter(line => line.startsWith('worktree ')).map(line => line.slice(9))])];
  } catch { return [project]; }
}

export async function usageReport(project, manifest, { days = 7, projectDays = 30, officialFile = null } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(projectDays) || projectDays < 1 || projectDays > 365) throw new Error('Ventanas de uso inválidas');
  const roots = await worktrees(project), all = new Map();
  for (const root of roots) {
    if (root !== project) {
      try { if (JSON.parse(await readFile(path.join(root, 'harness/project.json'), 'utf8')).projectId !== manifest.projectId) continue; }
      catch { continue; }
    }
    let names;
    try { names = await readdir(directory(root)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const name of names.filter(value => /^[a-f0-9-]{36}\.json$/.test(value))) {
      const entry = JSON.parse(await readFile(path.join(directory(root), name), 'utf8'));
      if (entry.id === name.slice(0, -5) && entry.projectId === manifest.projectId) all.set(entry.id, entry);
    }
  }
  const cutoff = Date.now() - days * 86400000;
  const entries = [...all.values()].filter(item => Date.parse(item.timestampUtc) >= cutoff);
  const requests = entries.filter(item => item.stage === 'attempt');
  const results = entries.filter(item => item.stage === 'result');
  const count = type => requests.filter(item => item.type === type).length;
  const summary = { searches: count('search'), writes: count('write'), reconciliations: count('reconcile'), processingChecks: count('processing'),
    retries: requests.filter(item => item.retry).length, errors: results.filter(item => item.outcome === 'error').length,
    unknownResults: requests.filter(item => !results.some(result => result.requestId === item.id)).length,
    additionalOperationsRequested: requests.filter(item => item.additionalOperation).length,
    bytesSent: requests.reduce((sum, item) => sum + (item.bytesSent || 0), 0),
    lastSuccessUtc: results.filter(item => item.outcome === 'success').map(item => item.timestampUtc).sort().at(-1) || null };
  let official = null;
  if (officialFile) {
    const allowed = path.resolve(project, 'harness/.local') + path.sep;
    const file = path.resolve(project, officialFile);
    if (!file.startsWith(allowed)) throw new Error('El archivo oficial debe estar bajo harness/.local/');
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value.observedAtUtc || !value.periodStartUtc || !value.periodEndUtc || !Number.isFinite(value.searchQueries) || !Number.isFinite(value.creditsBalanceUsd)) throw new Error('Resumen oficial inválido: requiere período, búsquedas y saldo');
    official = { observedAtUtc: value.observedAtUtc, periodStartUtc: value.periodStartUtc, periodEndUtc: value.periodEndUtc,
      searchQueries: value.searchQueries, creditsBalanceUsd: value.creditsBalanceUsd,
      comparison: 'La cuenta puede incluir otros proyectos/clientes; comparar sólo períodos y ámbitos equivalentes.' };
  }
  return { projectId: manifest.projectId, windowDays: days, projectedDays: projectDays, worktreesInspected: roots.length, ...summary, official,
    projected: { searches: summary.searches * projectDays / days, writes: summary.writes * projectDays / days,
      searchCostUsdEstimate: summary.searches * projectDays / days * 5 / 1000000,
      ingestCostUsdEstimate: null, totalCostUsdEstimate: null,
      assumption: 'Tasa diaria constante; búsquedas a USD 5 por millón. SM tokens facturados y saldo de cuenta desconocidos.' },
    billing: 'Estimación local; otros proyectos/clientes pueden compartir créditos del proveedor' };
}
