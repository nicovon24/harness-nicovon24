import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { recallMemory, syncMemory, publishMemory, memoryStatus, inspectProcessing } from '../src/supermemory.mjs';
import { usageReport } from '../src/usage.mjs';

async function projectFixture(t) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'harness-supermemory-'));
  t.after(async () => { if (project.startsWith(os.tmpdir() + path.sep)) await rm(project, { recursive: true, force: true }); });
  const manifest = { projectId: 'alpha', memory: { namespace: 'alpha' } };
  await writeFile(path.join(project, 'MEMORY.md'), JSON.stringify({ format: 1, entries: [] }));
  return { project, manifest };
}

test('Supermemory v5 sync preserves queue on failure and reconciles by stable id', async t => {
  const { project, manifest } = await projectFixture(t);
  const id = 'a'.repeat(64), queue = path.join(project, 'harness/.local/memory-queue');
  await mkdir(queue, { recursive: true });
  await writeFile(path.join(queue, `${id}.json`), JSON.stringify({ id, projectId: 'alpha', target: { provider: 'supermemory', namespace: 'alpha', projectId: 'alpha' }, feature: 'feature', phase: 'review', nextStep: 'validate',
    codeSnapshot: { sha256: 'code' }, specSnapshot: { sha256: 'spec' } }));
  await assert.rejects(syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: '' }), /SUPERMEMORY_API_KEY/);
  let posts = 0, remote = null;
  const fetchImpl = async (url, options) => {
    assert.match(url, /\/ns\/alpha\/document/);
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    if (options.method === 'GET') return remote ? Response.json(remote) : new Response('', { status: 404 });
    posts++;
    const body = JSON.parse(options.body);
    assert.equal(body.id, id);
    assert.equal(body.metadata.projectId, 'alpha');
    remote = { id, content: body.content };
    throw new Error('respuesta perdida');
  };
  await assert.rejects(syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'test-key', fetchImpl }), /respuesta perdida/);
  assert.equal((await readFile(path.join(queue, `${id}.json`), 'utf8')).includes('validate'), true);
  const result = await syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'test-key', fetchImpl });
  assert.equal(result.synced, 1);
  assert.equal(result.pending, 0);
  assert.equal(posts, 1);
  assert.equal(JSON.parse(await readFile(path.join(project, 'harness/.local/memory-receipts', `${id}.json`), 'utf8')).status, 'reconciled');
  assert.equal((await syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'test-key', fetchImpl })).synced, 0);
});

test('Supermemory search is isolated by namespace and composed under global memory budget', async t => {
  const { project, manifest } = await projectFixture(t);
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.supermemory.ai/ns/alpha/search');
    assert.deepEqual(JSON.parse(options.body), { query: 'next step', searchMode: 'memories', limit: 10, rerank: 'none', rewriteQuery: false });
    return Response.json({ results: [{ id: 'one', metadata: { projectId: 'alpha' }, memory: 'Próximo paso: probar integración.' }, { id: 'two', metadata: { projectId: 'alpha' }, memory: 'á'.repeat(10000) }] });
  };
  const result = await recallMemory(project, manifest, { pilot: true, apiKey: 'test-key', fetchImpl, query: 'next step' });
  assert.equal(result.remoteStatus, 'searched');
  assert.match(result.output, /Próximo paso: probar integración/);
  assert.ok(Buffer.byteLength(result.output, 'utf8') <= 8192);
  assert.ok(result.budget.lines <= 150);
  assert.doesNotMatch(result.output, /á{1000}/);
});

test('uncertain write is kept pending and never retried blindly', async t => {
  const { project, manifest } = await projectFixture(t);
  const id = 'b'.repeat(64), queue = path.join(project, 'harness/.local/memory-queue');
  await mkdir(queue, { recursive: true });
  await writeFile(path.join(queue, `${id}.json`), JSON.stringify({ id, projectId: 'alpha', target: { provider: 'supermemory', namespace: 'alpha', projectId: 'alpha' }, feature: 'feature', phase: 'done', nextStep: 'verify' }));
  let posts = 0;
  const fetchImpl = async (_url, options) => {
    if (options.method === 'GET') return new Response('', { status: 404 });
    posts++;
    throw new Error('network timeout');
  };
  await assert.rejects(syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'test-key', fetchImpl }), /network timeout/);
  await assert.rejects(syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'test-key', fetchImpl }), /resultado incierto/);
  assert.equal(posts, 1);
  assert.equal((await readFile(path.join(queue, `${id}.json`), 'utf8')).includes('verify'), true);
});

test('remote recall failure preserves local context with explicit pending status', async t => {
  const { project, manifest } = await projectFixture(t);
  const result = await recallMemory(project, manifest, { pilot: true, apiKey: 'test-key', fetchImpl: async () => { throw new Error('offline'); } });
  assert.match(result.remoteStatus, /pending: remote search failed/);
  assert.match(result.output, /Contexto de memoria del harness/);
});

test('pilot requires explicit selection and does not relabel unknown or foreign memories', async t => {
  const { project, manifest } = await projectFixture(t);
  await writeFile(path.join(project, 'decision.md'), 'Resume with the local project plan.\n');
  const published = await publishMemory(project, manifest, { text: 'Resume with the local project plan.', ref: 'decision.md', sessionId: 'session-one' });
  const id = published.queuedEvent;
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    if (url.endsWith('/search')) return Response.json({ results: [
      { id: 'own', memory: 'Own memory.', metadata: { projectId: 'alpha', ref: 'decision.md' } },
      { id: 'foreign', memory: 'Foreign memory.', metadata: { projectId: 'bravo' } },
      { id: 'unknown', memory: 'Unknown memory.' }
    ] });
    if (options.method === 'GET') return new Response('', { status: 404 });
    return Response.json({ id, status: 'queued' });
  };
  assert.equal((await recallMemory(project, manifest, { apiKey: 'key', fetchImpl })).remoteStatus, 'disabled');
  assert.equal(calls, 0);
  await assert.rejects(syncMemory(project, manifest, { eventId: id, apiKey: 'key', fetchImpl }), /desactivada/);
  assert.equal(calls, 0);
  const found = await recallMemory(project, manifest, { pilot: true, apiKey: 'key', fetchImpl });
  assert.equal(found.accepted, 1);
  assert.match(found.output, /Own memory/);
  assert.doesNotMatch(found.output, /Foreign memory|Unknown memory/);
  const sent = await syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'key', fetchImpl });
  assert.equal(sent.status, 'accepted');
  manifest.memory.namespace = 'alpha-new';
  assert.equal((await memoryStatus(project, manifest)).events[0].target.namespace, 'alpha');
  assert.equal((await memoryStatus(project, manifest)).events[0].status, 'accepted');
  assert.equal((await syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'key', fetchImpl })).namespace, 'alpha');
  const usage = await usageReport(project, manifest);
  assert.equal(usage.searches, 1);
  assert.equal(usage.writes, 1);
  assert.equal(usage.reconciliations, 1);
  assert.equal(usage.additionalOperationsRequested, 0);
  assert.equal(usage.projected.totalCostUsdEstimate, null);
  const officialFile = path.join(project, 'harness/.local/official-usage.json');
  await writeFile(officialFile, JSON.stringify({ observedAtUtc: '2026-10-17T00:00:00Z', periodStartUtc: '2026-10-01T00:00:00Z', periodEndUtc: '2026-11-01T00:00:00Z', searchQueries: 12, creditsBalanceUsd: 4.99 }));
  const compared = await usageReport(project, manifest, { officialFile: 'harness/.local/official-usage.json' });
  assert.equal(compared.official.searchQueries, 12);
  assert.equal(compared.searches, 1);
  await assert.rejects(usageReport(project, manifest, { officialFile: 'decision.md' }), /harness\/\.local/);
});

test('processing and extraction alone do not prove recoverable memory', async t => {
  const { project, manifest } = await projectFixture(t);
  await writeFile(path.join(project, 'decision.md'), 'Pilot processing evidence.\n');
  const id = (await publishMemory(project, manifest, { text: 'Pilot processing evidence.', ref: 'decision.md', sessionId: 'one' })).queuedEvent;
  const fetchImpl = async (_url, options) => options.method === 'GET'
    ? new Response('', { status: 404 }) : Response.json({ id, status: 'queued' });
  await syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'key', fetchImpl });
  const processingFetch = async (url) => url.endsWith('/search')
    ? Response.json({ results: [{ id: 'other', memory: 'Similar words', metadata: { projectId: 'alpha', eventId: 'other' } }] })
    : Response.json({ id, system: { status: 'done', dreamingStatus: 'done' } });
  const result = await inspectProcessing(project, manifest, { eventId: id, apiKey: 'key', fetchImpl: processingFetch });
  assert.equal(result.status, 'done');
  assert.equal(result.extraction, 'done');
  assert.equal(result.recoverable, false);
});

test('402 and 429 preserve pending events and Retry-After without another POST', async t => {
  for (const status of [402, 429]) {
    const { project, manifest } = await projectFixture(t);
    await writeFile(path.join(project, 'decision.md'), 'Keep local continuity.\n');
    const id = (await publishMemory(project, manifest, { text: 'Keep local continuity.', ref: 'decision.md', sessionId: String(status) })).queuedEvent;
    let posts = 0;
    const fetchImpl = async (_url, options) => options.method === 'GET' ? new Response('', { status: 404 }) : (posts++, new Response('', { status, headers: status === 429 ? { 'Retry-After': '120' } : {} }));
    await assert.rejects(syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'key', fetchImpl }), new RegExp(String(status)));
    assert.equal(posts, 1);
    assert.equal((await memoryStatus(project, manifest)).events[0].status, 'pending');
    if (status === 429) {
      const next = await syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'key', fetchImpl });
      assert.equal(next.status, 'rate-limited');
      assert.equal(posts, 1);
    }
  }
});

test('legacy event destination is frozen before the selected send', async t => {
  const { project, manifest } = await projectFixture(t);
  const id = 'c'.repeat(64), file = path.join(project, 'harness/.local/memory-queue', `${id}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ id, projectId: 'alpha', summary: 'legacy summary' }));
  await assert.rejects(syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'key', fetchImpl: async () => { throw new Error('unexpected'); } }), /--namespace/);
  const fetchImpl = async (url, options) => {
    assert.match(url, /\/ns\/legacy-ns\/document/);
    return options.method === 'GET' ? new Response('', { status: 404 }) : Response.json({ id });
  };
  const result = await syncMemory(project, manifest, { pilot: true, eventId: id, legacyNamespace: 'legacy-ns', apiKey: 'key', fetchImpl });
  assert.equal(result.status, 'accepted');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).target.namespace, 'legacy-ns');
  manifest.memory.namespace = 'another-ns';
  assert.equal((await syncMemory(project, manifest, { pilot: true, eventId: id, apiKey: 'key', fetchImpl })).namespace, 'legacy-ns');
});
