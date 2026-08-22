#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import {
  createLocalJob,
  verifyJobSignature,
} from './job-contract.mjs';

const WORKER_VERSION = '1.0.0';
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
const DEFAULT_ROOT = resolve(process.env.PANDORA_WORKER_ROOT || join(process.cwd(), '.pandora-worker'));

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}=*/gi,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,})\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  /(?:password|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"';,]+/gi,
];

function redact(text) {
  let value = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) value = value.replace(pattern, '[REDACTED_SECRET]');
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exe(name) {
  if (process.platform !== 'win32') return name;
  if (name === 'npm') return 'npm.cmd';
  if (name === 'flutter') return 'flutter.bat';
  return name;
}

const JOB_STEPS = Object.freeze({
  node_regression: [
    { name: 'npm-ci', cwd: '.', command: 'npm', args: ['ci'] },
    { name: 'npm-check', cwd: '.', command: 'npm', args: ['run', 'check'] },
    { name: 'npm-test', cwd: '.', command: 'npm', args: ['test'] },
    { name: 'npm-audit-high', cwd: '.', command: 'npm', args: ['audit', '--omit=dev', '--audit-level=high'] },
  ],
  flutter_mobile_verify: [
    { name: 'flutter-pub-get', cwd: 'apps/pandora-mobile', command: 'flutter', args: ['pub', 'get'] },
    { name: 'flutter-analyze', cwd: 'apps/pandora-mobile', command: 'flutter', args: ['analyze'] },
    { name: 'flutter-test', cwd: 'apps/pandora-mobile', command: 'flutter', args: ['test'] },
    { name: 'flutter-build-web', cwd: 'apps/pandora-mobile', command: 'flutter', args: ['build', 'web'] },
    { name: 'flutter-build-apk-debug', cwd: 'apps/pandora-mobile', command: 'flutter', args: ['build', 'apk', '--debug'] },
  ],
  supabase_migration_replay: [
    { name: 'npm-ci', cwd: '.', command: 'npm', args: ['ci'] },
    { name: 'migration-replay', cwd: '.', command: 'node', args: ['scripts/replay-supabase-migrations.mjs'] },
  ],
  pandora_skill_evals: [
    { name: 'npm-ci', cwd: '.', command: 'npm', args: ['ci'] },
    { name: 'validate-skills', cwd: '.', command: 'node', args: ['scripts/validate-pandora-skills.mjs'] },
    { name: 'eval-structure', cwd: '.', command: 'python', args: ['.claude/skills/evals/check_structure.py'] },
    { name: 'eval-invariants', cwd: '.', command: 'python', args: ['.claude/skills/evals/check_invariants.py'] },
    { name: 'eval-routing', cwd: '.', command: 'python', args: ['.claude/skills/evals/check_routing.py'] },
  ],
});

async function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    await new Promise((done) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('close', () => done());
      killer.once('error', () => done());
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
  }
}

async function runProcess({ command, args, cwd, timeoutMs, env = {} }) {
  const started = Date.now();
  let captured = '';
  let truncated = false;

  const child = spawn(exe(command), args, {
    cwd,
    env: { ...process.env, ...env },
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  function capture(chunk) {
    if (truncated) return;
    const next = redact(chunk.toString('utf8'));
    const remaining = MAX_CAPTURE_BYTES - Buffer.byteLength(captured, 'utf8');
    if (remaining <= 0) { truncated = true; return; }
    captured += next.slice(0, remaining);
    if (Buffer.byteLength(next, 'utf8') > remaining) truncated = true;
  }

  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  let timedOut = false;
  const timer = setTimeout(async () => {
    timedOut = true;
    await killTree(child);
  }, timeoutMs);
  timer.unref?.();

  const result = await new Promise((resolveResult) => {
    child.once('error', (error) => resolveResult({ exitCode: null, signal: null, spawnError: redact(error.message) }));
    child.once('close', (code, signal) => resolveResult({ exitCode: code, signal, spawnError: null }));
  });
  clearTimeout(timer);

  return {
    ...result,
    timedOut,
    durationMs: Date.now() - started,
    output: captured,
    outputTruncated: truncated,
  };
}

async function ensureExactSource(job, workspace) {
  const repoDir = join(workspace, 'repo');
  await rm(repoDir, { recursive: true, force: true });
  await mkdir(repoDir, { recursive: true });

  const repoUrl = `https://github.com/${job.repository}.git`;
  const steps = [
    ['git-init', 'git', ['init']],
    ['git-remote', 'git', ['remote', 'add', 'origin', repoUrl]],
    ['git-fetch-exact', 'git', ['fetch', '--depth=1', 'origin', job.exactSha]],
    ['git-checkout-exact', 'git', ['checkout', '--detach', job.exactSha]],
    ['git-verify-head', 'git', ['rev-parse', 'HEAD']],
  ];

  for (const [name, command, args] of steps) {
    const result = await runProcess({ command, args, cwd: repoDir, timeoutMs: 180_000 });
    if (result.exitCode !== 0 || result.timedOut) {
      throw new Error(`${name.toUpperCase().replaceAll('-', '_')}_FAILED: ${result.output.slice(-2000)}`);
    }
    if (name === 'git-verify-head') {
      const observed = result.output.trim().split(/\s+/).at(-1)?.toLowerCase();
      if (observed !== job.exactSha) throw new Error(`SOURCE_SHA_MISMATCH expected=${job.exactSha} observed=${observed || 'none'}`);
    }
  }
  return repoDir;
}

async function artifactDigest(path) {
  try {
    const data = await readFile(path);
    return { path, bytes: data.length, sha256: sha256(data) };
  } catch {
    return null;
  }
}

async function runJob(job, { allowUnsignedLocal = false, controlPublicKeyPem = null } = {}) {
  const verified = verifyJobSignature(job, controlPublicKeyPem, { allowUnsignedLocal });
  const workerId = process.env.PANDORA_WORKER_ID || 'unregistered-local-worker';
  const workspace = join(DEFAULT_ROOT, 'work', verified.job.taskId);
  const evidenceDir = join(DEFAULT_ROOT, 'evidence', verified.job.taskId);
  await mkdir(workspace, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });

  const overallStarted = Date.now();
  const repoDir = await ensureExactSource(verified.job, workspace);
  const jobSteps = JOB_STEPS[verified.job.jobClass];
  if (!jobSteps) throw new Error('JOB_CLASS_IMPLEMENTATION_MISSING');

  const deadline = overallStarted + verified.job.maxRuntimeSeconds * 1000;
  const stepResults = [];
  let outcome = 'passed';

  for (const step of jobSteps) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      outcome = 'failed';
      stepResults.push({ name: step.name, exitCode: null, timedOut: true, durationMs: 0, outputSha256: null, outputBytes: 0 });
      break;
    }
    const result = await runProcess({
      command: step.command,
      args: step.args,
      cwd: join(repoDir, step.cwd),
      timeoutMs: Math.min(remaining, 20 * 60 * 1000),
      env: {
        CI: 'true',
        PANDORA_WORKER_PRODUCTION_MUTATION: 'false',
      },
    });
    const logPath = join(evidenceDir, `${String(stepResults.length + 1).padStart(2, '0')}-${step.name}.log`);
    await writeFile(logPath, result.output, 'utf8');
    const logStat = await stat(logPath);
    stepResults.push({
      name: step.name,
      command: step.command,
      args: step.args,
      cwd: step.cwd,
      exitCode: result.exitCode,
      signal: result.signal,
      spawnError: result.spawnError,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      outputTruncated: result.outputTruncated,
      outputBytes: logStat.size,
      outputSha256: sha256(await readFile(logPath)),
    });
    if (result.exitCode !== 0 || result.timedOut || result.spawnError) {
      outcome = 'failed';
      break;
    }
  }

  const artifacts = [];
  if (verified.job.jobClass === 'flutter_mobile_verify') {
    for (const candidate of [
      join(repoDir, 'apps/pandora-mobile/build/app/outputs/flutter-apk/app-debug.apk'),
      join(repoDir, 'apps/pandora-mobile/build/web/index.html'),
    ]) {
      const digest = await artifactDigest(candidate);
      if (digest) artifacts.push({ ...digest, path: candidate.slice(repoDir.length + 1).replaceAll('\\', '/') });
    }
  }

  const evidence = {
    schemaVersion: '1.0.0',
    workerVersion: WORKER_VERSION,
    workerId,
    taskId: verified.job.taskId,
    jobDigest: verified.digest,
    repository: verified.job.repository,
    exactSha: verified.job.exactSha,
    jobClass: verified.job.jobClass,
    environment: 'verification',
    productionMutationAllowed: false,
    outcome,
    startedAt: new Date(overallStarted).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - overallStarted,
    machine: {
      platform: platform(),
      release: release(),
      cpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtCompletion: freemem(),
    },
    steps: stepResults,
    artifacts,
  };
  const evidencePayload = JSON.stringify(evidence, null, 2);
  const manifest = {
    ...evidence,
    evidenceSha256: sha256(Buffer.from(evidencePayload, 'utf8')),
  };
  const manifestPath = join(evidenceDir, 'result.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { manifest, manifestPath };
}

function usage() {
  console.error('Usage:');
  console.error('  node pandora-worker.mjs run <job.json>');
  console.error('  node pandora-worker.mjs local-run <jobClass> <exactSha> [taskId]');
}

async function main() {
  const [mode, arg1, arg2, arg3] = process.argv.slice(2);
  if (!mode) { usage(); process.exitCode = 2; return; }

  if (mode === 'local-run') {
    const jobClass = arg1;
    const exactSha = arg2;
    const taskId = arg3 || `local-${jobClass}-${Date.now()}`;
    const job = createLocalJob({ taskId, exactSha, jobClass });
    const result = await runJob(job, { allowUnsignedLocal: true });
    console.log(JSON.stringify({ ok: result.manifest.outcome === 'passed', evidence: result.manifestPath, sha256: result.manifest.evidenceSha256 }, null, 2));
    process.exitCode = result.manifest.outcome === 'passed' ? 0 : 1;
    return;
  }

  if (mode === 'run') {
    if (!arg1) { usage(); process.exitCode = 2; return; }
    const job = JSON.parse(await readFile(resolve(arg1), 'utf8'));
    const keyFile = process.env.PANDORA_WORKER_CONTROL_PUBLIC_KEY_FILE;
    if (!keyFile) throw new Error('PANDORA_WORKER_CONTROL_PUBLIC_KEY_FILE_REQUIRED');
    const publicKeyPem = await readFile(resolve(keyFile), 'utf8');
    const result = await runJob(job, { controlPublicKeyPem: publicKeyPem });
    console.log(JSON.stringify({ ok: result.manifest.outcome === 'passed', evidence: result.manifestPath, sha256: result.manifest.evidenceSha256 }, null, 2));
    process.exitCode = result.manifest.outcome === 'passed' ? 0 : 1;
    return;
  }

  usage();
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('pandora-worker.mjs')) {
  main().catch((error) => {
    console.error(redact(error?.stack || error?.message || String(error)));
    process.exitCode = 1;
  });
}

export { JOB_STEPS, redact, runJob };
