import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { recallMemory, syncMemory } from '../src/supermemory.mjs';

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
  await writeFile(path.join(queue, `${id}.json`), JSON.stringify({ id, projectId: 'alpha', runId: 'run-1', feature: 'feature', phase: 'review', nextStep: 'validate',
    codeSnapshot: { sha256: 'code' }, specSnapshot: { sha256: 'spec' } }));
  await assert.rejects(syncMemory(project, manifest, { apiKey: '' }), /SUPERMEMORY_API_KEY/);
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
  await assert.rejects(syncMemory(project, manifest, { apiKey: 'test-key', fetchImpl }), /respuesta perdida/);
  assert.equal((await readFile(path.join(queue, `${id}.json`), 'utf8')).includes('validate'), true);
  const result = await syncMemory(project, manifest, { apiKey: 'test-key', fetchImpl });
  assert.equal(result.synced, 1);
  assert.equal(result.pending, 0);
  assert.equal(posts, 1);
  assert.equal(JSON.parse(await readFile(path.join(project, 'harness/.local/memory-receipts', `${id}.json`), 'utf8')).status, 'reconciled');
  assert.equal((await syncMemory(project, manifest, { apiKey: 'test-key', fetchImpl })).synced, 0);
});

test('Supermemory search is isolated by namespace and composed under global memory budget', async t => {
  const { project, manifest } = await projectFixture(t);
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.supermemory.ai/ns/alpha/search');
    assert.deepEqual(JSON.parse(options.body), { query: 'next step', searchMode: 'memories', limit: 10 });
    return Response.json({ results: [{ memory: 'Próximo paso: probar integración.' }, { memory: 'á'.repeat(10000) }] });
  };
  const result = await recallMemory(project, manifest, { apiKey: 'test-key', fetchImpl, query: 'next step' });
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
  await writeFile(path.join(queue, `${id}.json`), JSON.stringify({ id, projectId: 'alpha', runId: 'run-2', feature: 'feature', phase: 'done', nextStep: 'verify' }));
  let posts = 0;
  const fetchImpl = async (_url, options) => {
    if (options.method === 'GET') return new Response('', { status: 404 });
    posts++;
    throw new Error('network timeout');
  };
  await assert.rejects(syncMemory(project, manifest, { apiKey: 'test-key', fetchImpl }), /network timeout/);
  await assert.rejects(syncMemory(project, manifest, { apiKey: 'test-key', fetchImpl }), /resultado incierto/);
  assert.equal(posts, 1);
  assert.equal((await readFile(path.join(queue, `${id}.json`), 'utf8')).includes('verify'), true);
});

test('remote recall failure preserves local context with explicit pending status', async t => {
  const { project, manifest } = await projectFixture(t);
  const result = await recallMemory(project, manifest, { apiKey: 'test-key', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.remoteStatus, 'pending: remote search failed');
  assert.match(result.output, /Contexto de memoria del harness/);
});
