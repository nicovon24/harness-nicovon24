import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
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
  return { base, invoke, makeProject };
}

test('init inherits defaults and config reports routing precedence', async t => {
  const { invoke, makeProject } = await fixture(t);
  const project = await makeProject('alpha');
  const manifestFile = path.join(project, 'harness/project.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  assert.equal(manifest.roles, undefined);
  assert.equal(await readFile(path.join(project, 'harness/.gitignore'), 'utf8'), '.local/\n');
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
  const manifest = { schemaVersion: 1, projectId: 'example', harnessVersion: '0.1.0-alpha.1', roles: { implementer: { profile: 'sol', effort: 'low' } } };
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
  const record = invoke('review-record', project, '--run', runId, '--token', token, '--verdict', 'pass', '--reviewer', 'independent', '--review-session', 'session-2');
  assert.equal(record.status, 0, record.stderr);
  assert.equal(invoke('review-status', project, '--run', runId).json.status, 'current');
  await writeFile(code, 'export const value = false;\n');
  assert.equal(invoke('review-status', project, '--run', runId).json.sameCode, false);
  await writeFile(code, 'export const value = true;\n');
  await writeFile(acceptance, '# REQ-001\nReturn false.\n');
  assert.equal(invoke('review-status', project, '--run', runId).json.sameAcceptance, false);
  assert.equal(invoke('end', project, '--run', runId, '--token', token, '--workers-stopped').status, 0);
});
