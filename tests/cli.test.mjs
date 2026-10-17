import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defaults, resolveConfig } from '../src/config.mjs';

const cli = fileURLToPath(new URL('../bin/harness.mjs', import.meta.url));
const absent = async file => { try { await access(file); return false; } catch { return true; } };

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'harness-test-'));
  t.after(async () => { if (base.startsWith(os.tmpdir() + path.sep)) await rm(base, { recursive: true, force: true }); });
  const stateDir = path.join(base, 'host-state');
  const invoke = (command, project, ...args) => {
    const result = spawnSync(process.execPath, [cli, command, '--project', project, ...args], {
      encoding: 'utf8', env: { ...process.env, HARNESS_STATE_DIR: stateDir }
    });
    return { ...result, json: result.status === 0 ? JSON.parse(result.stdout) : null };
  };
  const makeProject = async name => { const project = path.join(base, name); await mkdir(project); assert.equal(invoke('init', project).status, 0); return project; };
  return { base, stateDir, invoke, makeProject };
}

test('init inherits defaults and config reports routing precedence', async t => {
  const { invoke, makeProject } = await fixture(t);
  const project = await makeProject('alpha');
  const manifestFile = path.join(project, 'harness/project.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  assert.equal(manifest.roles, undefined);
  assert.equal(await readFile(path.join(project, 'harness/.gitignore'), 'utf8'), '.local/\n');
  assert.equal(await readFile(path.join(project, '.gitignore'), 'utf8'), '/MEMORY.md\n');
  assert.equal(invoke('validate', project).status, 0);
  const base = invoke('config', project).json;
  assert.deepEqual(base.config.roles.implementer, defaults.roles.implementer);
  assert.equal(base.sources.roles.implementer, 'default');
  const routed = invoke('config', project, '--classification', 'complex-implementation').json;
  assert.equal(routed.config.roles.implementer.effort, 'high');
  assert.equal(routed.sources.roles.implementer, 'rule:complex-implementation');
  assert.equal(routed.requestedModels.implementer.model, 'gpt-6-sol');
  const manual = invoke('config', project, '--classification', 'complex-implementation', '--role', 'implementer', '--profile', 'astra', '--effort', 'high');
  assert.equal(manual.json.sources.roles.implementer, 'execution');
  assert.equal(manual.json.requestedModels.implementer.model, 'gpt-6-astra');
  assert.notEqual(invoke('config', project, '--role', 'implementer', '--profile', 'sol', '--effort', 'invalid').status, 0);
  manifest.roles = { implementer: { profile: 'sol', effort: 'low' } };
  await writeFile(manifestFile, JSON.stringify(manifest));
  assert.equal(invoke('config', project, '--classification', 'complex-implementation').json.sources.roles.implementer, 'project');
  manifest.roles.implementer.effort = 'invalid';
  await writeFile(manifestFile, JSON.stringify(manifest));
  assert.notEqual(invoke('validate', project).status, 0);
});

test('init preserves existing root ignore rules while excluding only root memory', async t => {
  const { base, invoke } = await fixture(t);
  const project = path.join(base, 'existing-ignore');
  await mkdir(project);
  await writeFile(path.join(project, '.gitignore'), 'dist/\n');
  assert.equal(invoke('init', project).status, 0);
  assert.equal(await readFile(path.join(project, '.gitignore'), 'utf8'), 'dist/\n/MEMORY.md\n');
});

test('installation preview, isolation, idempotence and modified-file protection', async t => {
  const { invoke, makeProject } = await fixture(t);
  const a = await makeProject('alpha');
  const b = await makeProject('bravo');
  const skill = project => path.join(project, '.agents/skills/h-feature/SKILL.md');
  assert.equal(invoke('install', a, '--runtime', 'codex').json.preview, true);
  assert.equal(await absent(skill(a)), true);
  assert.equal(invoke('install', a, '--runtime', 'codex', '--apply').status, 0);
  assert.equal(invoke('install', b, '--runtime', 'codex', '--apply').status, 0);
  const installed = spawnSync(process.execPath, [path.join(a, '.agents/harness/bin/harness.mjs'), 'config', '--project', a], { encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).config.projectId, 'alpha');
  const installedDoctor = spawnSync(process.execPath, [path.join(a, '.agents/harness/bin/harness.mjs'), 'doctor', '--project', a], { encoding: 'utf8' });
  assert.equal(installedDoctor.status, 0, installedDoctor.stderr);
  assert.equal(JSON.parse(installedDoctor.stdout).installation, 'files-match');
  const installedMemory = spawnSync(process.execPath, [path.join(a, '.agents/harness/bin/harness.mjs'), 'memory-render', '--project', a], { encoding: 'utf8' });
  assert.equal(installedMemory.status, 0, installedMemory.stderr);
  assert.match(installedMemory.stdout, /Contexto de memoria del harness/);
  assert.equal(invoke('install', a, '--runtime', 'codex', '--apply').json.count, 0);
  assert.equal(invoke('uninstall', a, '--runtime', 'codex', '--apply').status, 0);
  assert.equal(await absent(skill(a)), true);
  assert.equal(await absent(skill(b)), false);
  await writeFile(skill(b), (await readFile(skill(b), 'utf8')) + '\nlocal edit\n');
  assert.notEqual(invoke('uninstall', b, '--runtime', 'codex', '--apply').status, 0);
  assert.equal((await readFile(skill(b), 'utf8')).includes('local edit'), true);
});

test('two executions cannot hold one checkout; checkpoints require the owner token', async t => {
  const { invoke, makeProject } = await fixture(t);
  const project = await makeProject('alpha');
  const first = invoke('begin', project, '--feature', 'sample');
  assert.equal(first.status, 0, first.stderr);
  assert.notEqual(invoke('begin', project, '--feature', 'sample').status, 0);
  const { runId, token } = first.json;
  assert.notEqual(invoke('checkpoint', project, '--run', runId, '--token', 'wrong', '--phase', 'review', '--next', 'done').status, 0);
  const checkpoint = invoke('checkpoint', project, '--run', runId, '--token', token, '--phase', 'review', '--next', 'check diff');
  assert.equal(checkpoint.status, 0);
  const event = JSON.parse(await readFile(path.join(project, 'harness/.local/memory-queue', `${checkpoint.json.queuedEvent}.json`), 'utf8'));
  assert.equal(event.nextStep, 'check diff');
  const repeated = invoke('checkpoint', project, '--run', runId, '--token', token, '--phase', 'review', '--next', 'check diff');
  assert.equal(repeated.status, 0);
  assert.notEqual(repeated.json.queuedEvent, checkpoint.json.queuedEvent);
  assert.notEqual(invoke('end', project, '--run', runId, '--token', token).status, 0);
  assert.equal(invoke('end', project, '--run', runId, '--token', token, '--workers-stopped').status, 0);
  const second = invoke('begin', project, '--feature', 'sample');
  assert.equal(second.status, 0, second.stderr);
  assert.equal(invoke('end', project, '--run', second.json.runId, '--token', second.json.token, '--workers-stopped').status, 0);
});

test('execution role override wins over project and routing rule', () => {
  const manifest = { schemaVersion: 1, projectId: 'example', harnessVersion: '0.1.0-alpha.2', roles: { implementer: { profile: 'sol', effort: 'low' } } };
  const result = resolveConfig(manifest, { classification: 'complex-implementation', execution: { roles: { implementer: { profile: 'astra', effort: 'high' } } } });
  assert.deepEqual(result.config.roles.implementer, { profile: 'astra', effort: 'high' });
  assert.equal(result.sources.roles.implementer, 'execution');
});

test('review becomes stale when code or acceptance changes', async t => {
  const { invoke, makeProject } = await fixture(t);
  const project = await makeProject('review');
  const git = spawnSync('git', ['init', project], { encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  const featureDir = path.join(project, 'harness/features/change');
  await mkdir(featureDir, { recursive: true });
  const acceptance = path.join(featureDir, 'requirements.md');
  await writeFile(acceptance, '# REQ-001\nReturn true.\n');
  const code = path.join(project, 'app.js');
  await writeFile(code, 'export const value = true;\n');
  const begin = invoke('begin', project, '--feature', 'change');
  assert.equal(begin.status, 0, begin.stderr);
  const { runId, token } = begin.json;
  const checkpoint = invoke('checkpoint', project, '--run', runId, '--token', token, '--phase', 'verification', '--next', 'review change',
    '--check-command', 'node --test', '--check-result', 'pass', '--check-scope', 'REQ-001');
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  const saved = JSON.parse(await readFile(path.join(project, 'harness/.local/runs', runId, 'state.json'), 'utf8'));
  assert.equal(saved.codeSnapshot.status, 'captured');
  assert.equal(saved.specSnapshot.status, 'captured');
  assert.equal(saved.checks[0].command, 'node --test');
  assert.equal(invoke('runs', project, '--verify').json[0].resumeValidation, 'current');
  assert.equal(invoke('runs', project, '--verify').json[0].checks[0].status, 'current');
  const record = invoke('review-record', project, '--run', runId, '--token', token, '--verdict', 'pass', '--reviewer', 'independent', '--review-session', 'session-2');
  assert.equal(record.status, 0, record.stderr);
  assert.equal(invoke('review-status', project, '--run', runId).json.status, 'current');
  await writeFile(code, 'export const value = false;\n');
  assert.equal(invoke('review-status', project, '--run', runId).json.sameCode, false);
  assert.equal(invoke('runs', project, '--verify').json[0].resumeValidation, 'needs-revalidation');
  assert.equal(invoke('runs', project, '--verify').json[0].checks[0].status, 'stale');
  await writeFile(code, 'export const value = true;\n');
  await writeFile(acceptance, '# REQ-001\nReturn false.\n');
  assert.equal(invoke('review-status', project, '--run', runId).json.sameAcceptance, false);
  assert.equal(invoke('end', project, '--run', runId, '--token', token, '--workers-stopped').status, 0);
});

test('concurrent checkpoints retain both updates and distinct queued events', async t => {
  const { invoke, makeProject, stateDir } = await fixture(t);
  const project = await makeProject('parallel-checkpoint');
  assert.equal(spawnSync('git', ['init', project], { encoding: 'utf8' }).status, 0);
  const featureDir = path.join(project, 'harness/features/sample');
  await mkdir(featureDir, { recursive: true });
  await writeFile(path.join(featureDir, 'requirements.md'), '# REQ-001\nConcurrent checkpoint.\n');
  const begin = invoke('begin', project, '--feature', 'sample');
  assert.equal(begin.status, 0, begin.stderr);
  const { runId, token } = begin.json;
  const checkpoint = next => new Promise(resolve => {
    const child = spawn(process.execPath, [cli, 'checkpoint', '--project', project, '--run', runId, '--token', token, '--phase', 'verification', '--next', next],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HARNESS_STATE_DIR: stateDir } });
    let output = '', error = '';
    child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => error += chunk);
    child.on('close', status => resolve({ status, output, error }));
  });
  const results = await Promise.all([checkpoint('first result'), checkpoint('second result')]);
  assert.deepEqual(results.map(item => item.status), [0, 0], results.map(item => item.error).join('\n'));
  const queued = results.map(item => JSON.parse(item.output).queuedEvent);
  assert.notEqual(queued[0], queued[1]);
  const state = JSON.parse(await readFile(path.join(project, 'harness/.local/runs', runId, 'state.json'), 'utf8'));
  assert.equal(state.checkpointSeq, 2);
  assert.equal(invoke('end', project, '--run', runId, '--token', token, '--workers-stopped').status, 0);
});

test('interrupted checkpoint is recovered with frozen identity and is not exported early', async t => {
  const { invoke, makeProject } = await fixture(t);
  const project = await makeProject('interrupted');
  assert.equal(spawnSync('git', ['init', project], { encoding: 'utf8' }).status, 0);
  const featureDir = path.join(project, 'harness/features/sample');
  await mkdir(featureDir, { recursive: true });
  await writeFile(path.join(featureDir, 'requirements.md'), '# REQ-001\nRecover.\n');
  const begin = invoke('begin', project, '--feature', 'sample');
  const { runId, token } = begin.json;
  const stateFile = path.join(project, 'harness/.local/runs', runId, 'state.json');
  const before = JSON.parse(await readFile(stateFile, 'utf8'));
  const checkpoint = invoke('checkpoint', project, '--run', runId, '--token', token, '--phase', 'review', '--next', 'recover');
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  const after = JSON.parse(await readFile(stateFile, 'utf8'));
  const id = checkpoint.json.queuedEvent;
  const event = JSON.parse(await readFile(path.join(project, 'harness/.local/memory-queue', `${id}.json`), 'utf8'));
  await writeFile(stateFile, JSON.stringify(before));
  await writeFile(path.join(project, 'harness/.local/runs', runId, 'checkpoint-pending.json'), JSON.stringify({ format: 1, runId, projectId: 'interrupted', previousSeq: 0, eventId: id, event, nextState: after }));
  const eventFile = path.join(project, 'harness/.local/memory-queue', `${id}.json`);
  await writeFile(eventFile, JSON.stringify({ ...event, nextStep: 'divergent' }));
  assert.notEqual(invoke('checkpoint', project, '--run', runId, '--token', token, '--recover').status, 0);
  assert.equal((await readFile(path.join(project, 'harness/.local/runs', runId, 'checkpoint-pending.json'), 'utf8')).includes(id), true);
  await writeFile(eventFile, JSON.stringify(event, null, 2) + '\n');
  assert.equal(invoke('runs', project).json[0].checkpointRecovery, 'pending');
  assert.equal(invoke('memory-status', project).json.events[0].status, 'checkpoint-incomplete');
  assert.notEqual(invoke('checkpoint', project, '--run', runId, '--token', token, '--phase', 'review', '--next', 'recover').status, 0);
  const recovered = invoke('checkpoint', project, '--run', runId, '--token', token, '--recover');
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(recovered.json.queuedEvent, id);
  assert.equal(JSON.parse(await readFile(stateFile, 'utf8')).checkpointSeq, 1);
  assert.equal(invoke('checkpoint', project, '--run', runId, '--token', token, '--recover').status !== 0, true);
  assert.equal(invoke('end', project, '--run', runId, '--token', token, '--workers-stopped').status, 0);
});

test('installed CLI completes a local solo run and resumes from a fresh process', async t => {
  const { invoke, makeProject, stateDir } = await fixture(t);
  const project = await makeProject('pilot');
  assert.equal(spawnSync('git', ['init', project], { encoding: 'utf8' }).status, 0);
  assert.equal(invoke('install', project, '--runtime', 'codex', '--apply').status, 0);
  const installed = path.join(project, '.agents/harness/bin/harness.mjs');
  const call = (...args) => {
    const result = spawnSync(process.execPath, [installed, ...args, '--project', project],
      { encoding: 'utf8', env: { ...process.env, HARNESS_STATE_DIR: stateDir, SUPERMEMORY_API_KEY: '' } });
    let json = null;
    if (result.status === 0 && args[0] !== 'memory-recall') json = JSON.parse(result.stdout);
    return { ...result, json };
  };
  const requirements = path.join(project, 'harness/features/pilot/requirements.md');
  await mkdir(path.dirname(requirements), { recursive: true });
  await writeFile(requirements, '# REQ-001\nPrint ready.\n');
  await writeFile(path.join(project, 'app.js'), 'console.log("ready");\n');
  const begin = call('begin', '--feature', 'pilot');
  assert.equal(begin.status, 0, begin.stderr);
  const memory = call('memory-recall');
  assert.equal(memory.status, 0, memory.stderr);
  assert.match(memory.stdout, /Contexto de memoria del harness/);
  assert.match(memory.stderr, /disabled/);
  const { runId, token } = begin.json;
  const actualCheck = spawnSync(process.execPath, [path.join(project, 'app.js')], { encoding: 'utf8' });
  assert.equal(actualCheck.status, 0, actualCheck.stderr);
  assert.equal(actualCheck.stdout.trim(), 'ready');
  const checkpoint = call('checkpoint', '--run', runId, '--token', token, '--phase', 'verification', '--next', 'review REQ-001',
    '--check-command', 'node app.js', '--check-result', 'pass', '--check-scope', 'REQ-001');
  assert.equal(checkpoint.status, 0, checkpoint.stderr);
  assert.equal(call('runs', '--verify').json.find(item => item.runId === runId).resumeValidation, 'current');
  assert.equal(call('runs').json.find(item => item.runId === runId).memorySync, 'pending');
  const review = call('review-record', '--run', runId, '--token', token, '--verdict', 'pass', '--reviewer', 'self');
  assert.equal(review.status, 0, review.stderr);
  assert.equal(call('review-status', '--run', runId).json.status, 'current');
  assert.equal(call('end', '--run', runId, '--token', token, '--workers-stopped').json.status, 'ended');
  const receiptDir = path.join(project, 'harness/.local/memory-receipts');
  await mkdir(receiptDir, { recursive: true });
  await writeFile(path.join(receiptDir, `${checkpoint.json.queuedEvent}.json`), JSON.stringify({ id: checkpoint.json.queuedEvent, remoteId: checkpoint.json.queuedEvent }));
  const resumed = call('runs', '--verify');
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(resumed.json.find(item => item.runId === runId).resumeValidation, 'current');
  assert.equal(resumed.json.find(item => item.runId === runId).nextStep, 'review REQ-001');
  assert.equal(resumed.json.find(item => item.runId === runId).memorySync, 'pending');
});
