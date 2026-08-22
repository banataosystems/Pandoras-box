import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  canonicalize,
  createLocalJob,
  jobDigest,
  unsignedJobPayload,
  validateJob,
  verifyJobSignature,
} from '../job-contract.mjs';

const SHA = 'a'.repeat(40);

test('local verification job is exact-SHA bound and mutation-disabled', () => {
  const job = createLocalJob({ taskId: 'local-test-12345', exactSha: SHA, jobClass: 'node_regression' });
  const validated = validateJob(job, { allowUnsignedLocal: true });
  assert.equal(validated.exactSha, SHA);
  assert.equal(validated.productionMutationAllowed, false);
  assert.equal(validated.environment, 'verification');
});

test('arbitrary repository is rejected', () => {
  const job = createLocalJob({ taskId: 'local-test-12346', exactSha: SHA, jobClass: 'node_regression' });
  job.repository = 'evil/example';
  assert.throws(() => validateJob(job, { allowUnsignedLocal: true }), /REPOSITORY_NOT_ALLOWED/);
});

test('arbitrary job class is rejected', () => {
  const job = createLocalJob({ taskId: 'local-test-12347', exactSha: SHA, jobClass: 'node_regression' });
  job.jobClass = 'run_any_shell_command';
  assert.throws(() => validateJob(job, { allowUnsignedLocal: true }), /JOB_CLASS_NOT_ALLOWED/);
});

test('short ref or branch name cannot replace exact SHA', () => {
  const job = createLocalJob({ taskId: 'local-test-12348', exactSha: SHA, jobClass: 'node_regression' });
  job.exactSha = 'main';
  assert.throws(() => validateJob(job, { allowUnsignedLocal: true }), /EXACT_SHA_REQUIRED/);
});

test('production mutation flag cannot be enabled', () => {
  const job = createLocalJob({ taskId: 'local-test-12349', exactSha: SHA, jobClass: 'node_regression' });
  job.productionMutationAllowed = true;
  assert.throws(() => validateJob(job, { allowUnsignedLocal: true }), /PRODUCTION_MUTATION_MUST_BE_FALSE/);
});

test('expired jobs fail closed', () => {
  const now = Date.now();
  const job = createLocalJob({ taskId: 'local-test-12350', exactSha: SHA, jobClass: 'node_regression', now: now - 40 * 60 * 1000 });
  assert.throws(() => validateJob(job, { now, allowUnsignedLocal: true }), /JOB_EXPIRED/);
});

test('ed25519 signature validates canonical job payload', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const job = createLocalJob({ taskId: 'signed-test-12351', exactSha: SHA, jobClass: 'node_regression' });
  job.signatureAlgorithm = 'ed25519';
  const payload = Buffer.from(canonicalize(unsignedJobPayload(job)), 'utf8');
  job.signature = sign(null, payload, privateKey).toString('base64');
  const verified = verifyJobSignature(job, publicKey.export({ type: 'spki', format: 'pem' }));
  assert.equal(verified.valid, true);
  assert.equal(verified.digest, jobDigest(job));
});

test('tampering after signature is rejected', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const job = createLocalJob({ taskId: 'signed-test-12352', exactSha: SHA, jobClass: 'node_regression' });
  job.signatureAlgorithm = 'ed25519';
  const payload = Buffer.from(canonicalize(unsignedJobPayload(job)), 'utf8');
  job.signature = sign(null, payload, privateKey).toString('base64');
  job.exactSha = 'b'.repeat(40);
  assert.throws(() => verifyJobSignature(job, publicKey.export({ type: 'spki', format: 'pem' })), /JOB_SIGNATURE_INVALID/);
});
