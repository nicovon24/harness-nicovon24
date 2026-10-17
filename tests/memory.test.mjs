import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MEMORY_LIMITS, memoryBudget, renderMemory } from '../src/memory.mjs';

const cli = fileURLToPath(new URL('../bin/harness.mjs', import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-memory-'));
  t.after(async () => { if (root.startsWith(os.tmpdir() + path.sep)) await rm(root, { recursive: true, force: true }); });
  const project = path.join(root, 'project');
  await mkdir(project);
  await mkdir(path.join(project, 'harness'));
  await writeFile(path.join(project, 'harness/project.json'), JSON.stringify({ schemaVersion: 1, projectId: 'memory-test', harnessVersion: '0.1.0' }));
  await writeFile(path.join(project, 'docs-plan.md'), '');
  const run = (...args) => new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args, '--project', project], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  const record = (text, opts = {}) => run('memory-record', '--kind', opts.kind || 'progress', '--text', text, '--ref', 'docs-plan.md', '--session-id', opts.session || 'session-1', '--agent-id', opts.agent || 'agent-a');
  return { project, run, record };
}
const cacheFile = project => path.join(project, 'MEMORY.md');

test('context survives a month of inactivity and rendering does not create activity', async t => {
  const { project } = await fixture(t);
  const cache = { format: 1, entries: [{ day: '2026-09-17', timestampUtc: '2026-09-17T15:00:00.000Z', kind: 'resume', text: 'Retomar revisión del feature.', ref: 'docs-plan.md', sessionId: 'old-session', agentId: 'agent-a', projectId: 'memory-test', worktree: project, branch: 'main', commit: 'abc' }] };
  await writeFile(cacheFile(project), JSON.stringify(cache));
  const before = await readFile(cacheFile(project), 'utf8');
  const manifest = { projectId: 'memory-test' };
  const first = await renderMemory(project, manifest), second = await renderMemory(project, manifest);
  assert.match(first.output, /Retomar revisión del feature/);
  assert.equal(second.version, first.version);
  assert.equal(await readFile(cacheFile(project), 'utf8'), before);
  assert.deepEqual(memoryBudget(first.output), first.budget);
  assert.equal(MEMORY_LIMITS.expireOnInactivity, false);
});

test('sixth distinct activity day evicts only the oldest after durable source checks', async t => {
  const { project, record } = await fixture(t);
  const prior = [];
  const days = ['2026-02-03', '2026-03-18', '2026-06-11', '2026-08-27', '2026-09-30'];
  for (let i = 0; i < days.length; i++) {
    const text = 'durable event ' + i;
    prior.push({ day: days[i], timestampUtc: `${days[i]}T12:00:00.000Z`, kind: 'progress', text, ref: 'docs-plan.md', sessionId: 's' + i, agentId: 'a', projectId: 'memory-test', worktree: project, branch: 'main', commit: 'abc' });
  }
  await writeFile(path.join(project, 'docs-plan.md'), prior.map(item => item.text).concat('sixth active event').join('\n'));
  await writeFile(cacheFile(project), JSON.stringify({ format: 1, entries: prior }));
  const result = await record('sixth active event');
  assert.equal(result.code, 0, result.stderr);
  const entries = JSON.parse(await readFile(cacheFile(project), 'utf8')).entries;
  assert.equal(new Set(entries.map(item => item.day)).size, 5);
  assert.equal(entries.some(item => item.text === 'durable event 0'), false);
  assert.equal(entries.some(item => item.text === 'durable event 1'), true);
});

test('global line and UTF-8 byte limits include Unicode remote titles and content', async t => {
  const { project } = await fixture(t);
  const entries = [];
  for (let i = 0; i < 5; i++) entries.push({ day: `2026-10-1${i}`, timestampUtc: '2026-10-17T12:00:00.000Z', kind: 'progress', text: 'avance Unicode ñ 🧪 ' + i, ref: 'docs-plan.md', sessionId: 's', agentId: 'a', projectId: 'memory-test', worktree: project, branch: 'main', commit: 'abc' });
  await writeFile(cacheFile(project), JSON.stringify({ format: 1, entries }));
  const remote = JSON.stringify({ memories: Array.from({ length: 80 }, (_, i) => ({ id: `remote-${i}`, namespace: 'memory-test', projectId: 'memory-test', title: 'Título 🧠 ' + i, content: 'Información remota útil 🧪 '.repeat(15) })) });
  const { output, budget } = await renderMemory(project, { projectId: 'memory-test' }, remote);
  assert.equal(budget.valid, true);
  assert.ok(budget.lines <= 150);
  assert.ok(budget.bytes <= 8192);
  assert.ok(Buffer.byteLength(output, 'utf8') <= 8192);
  assert.match(output, /Título 🧠/);
  assert.match(output, /Omitidos por presupuesto global/);
});

test('concurrent sessions serialize read-modify-write without losing either entry', async t => {
  const { project, record } = await fixture(t);
  await writeFile(path.join(project, 'docs-plan.md'), 'concurrent one\nconcurrent two\n');
  const results = await Promise.all([record('concurrent one', { session: 'session-one' }), record('concurrent two', { session: 'session-two', agent: 'agent-b' })]);
  assert.deepEqual(results.map(result => result.code), [0, 0], results.map(result => result.stderr).join('\n'));
  const entries = JSON.parse(await readFile(cacheFile(project), 'utf8')).entries;
  assert.deepEqual(new Set(entries.map(entry => entry.text)), new Set(['concurrent one', 'concurrent two']));
  assert.deepEqual(new Set(entries.map(entry => entry.sessionId)), new Set(['session-one', 'session-two']));
});

test('cache clear preserves durable pending records and refuses unbacked entries', async t => {
  const { project, run, record } = await fixture(t);
  const pending = 'Pendiente durable: pilotear reanudación en otra sesión.';
  await writeFile(path.join(project, 'docs-plan.md'), pending);
  assert.equal((await record(pending, { kind: 'blocker' })).code, 0);
  const cleared = await run('memory-clear', '--session-id', 'cleaner');
  assert.equal(cleared.code, 0, cleared.stderr);
  assert.match(await readFile(path.join(project, 'docs-plan.md'), 'utf8'), /pilotear reanudación/);
  assert.equal(JSON.parse(await readFile(cacheFile(project), 'utf8')).entries.length, 0);
  const unbacked = { format: 1, entries: [{ day: '2026-10-17', timestampUtc: '2026-10-17T12:00:00Z', kind: 'blocker', text: 'único ejemplar', ref: 'missing.md' }] };
  await writeFile(cacheFile(project), JSON.stringify(unbacked));
  const blocked = await run('memory-clear', '--session-id', 'cleaner-2');
  assert.notEqual(blocked.code, 0);
  assert.match(await readFile(cacheFile(project), 'utf8'), /único ejemplar/);
});

test('record refuses a summary absent from its durable document', async t => {
  const { project, record } = await fixture(t);
  await writeFile(path.join(project, 'docs-plan.md'), 'Another decision lives here.');
  const attempt = await record('Important decision missing from the document', { kind: 'decision' });
  assert.notEqual(attempt.code, 0);
  await assert.rejects(readFile(cacheFile(project), 'utf8'), { code: 'ENOENT' });
});

test('compaction uses entry identity when legacy timestamps collide', async t => {
  const { project, record } = await fixture(t);
  const days = ['2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01'];
  const entries = days.map((day, index) => ({ day, timestampUtc: '2026-02-01T12:00:00.000Z', kind: 'progress', text: 'durable item ' + index, ref: index ? 'docs-plan.md' : 'missing.md', sessionId: 'old', agentId: 'a', projectId: 'memory-test', worktree: project, branch: 'main', commit: 'abc' }));
  await writeFile(path.join(project, 'docs-plan.md'), entries.slice(1).map(item => item.text).concat('new active item').join('\n'));
  await writeFile(cacheFile(project), JSON.stringify({ format: 1, entries }));
  const before = await readFile(cacheFile(project), 'utf8');
  const attempt = await record('new active item');
  assert.notEqual(attempt.code, 0);
  assert.equal(await readFile(cacheFile(project), 'utf8'), before);
});
