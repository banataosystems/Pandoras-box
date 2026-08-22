import { createHash, verify as cryptoVerify } from 'node:crypto';

export const JOB_SCHEMA_VERSION = '1.0.0';
export const ALLOWED_REPOSITORIES = new Set(['banataosystems/Pandoras-box']);
export const ALLOWED_JOB_CLASSES = new Set([
  'node_regression',
  'flutter_mobile_verify',
  'supabase_migration_replay',
  'pandora_skill_evals',
]);

const SHA_RE = /^[0-9a-f]{40}$/;
const TASK_RE = /^[A-Za-z0-9._:-]{8,160}$/;

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

export function unsignedJobPayload(job) {
  const {
    signature,
    signatureAlgorithm,
    ...payload
  } = job;
  return payload;
}

export function jobDigest(job) {
  return sha256Hex(canonicalize(unsignedJobPayload(job)));
}

function parseTime(value, name) {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error(`${name}_INVALID`);
  return millis;
}

export function validateJob(job, { now = Date.now(), allowUnsignedLocal = false } = {}) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('JOB_OBJECT_REQUIRED');
  if (job.schemaVersion !== JOB_SCHEMA_VERSION) throw new Error('JOB_SCHEMA_UNSUPPORTED');
  if (!TASK_RE.test(String(job.taskId || ''))) throw new Error('TASK_ID_INVALID');
  if (!ALLOWED_REPOSITORIES.has(job.repository)) throw new Error('REPOSITORY_NOT_ALLOWED');
  if (!SHA_RE.test(String(job.exactSha || ''))) throw new Error('EXACT_SHA_REQUIRED');
  if (!ALLOWED_JOB_CLASSES.has(job.jobClass)) throw new Error('JOB_CLASS_NOT_ALLOWED');
  if (job.environment !== 'verification') throw new Error('VERIFICATION_ENVIRONMENT_REQUIRED');
  if (job.productionMutationAllowed !== false) throw new Error('PRODUCTION_MUTATION_MUST_BE_FALSE');
  if (job.networkPolicy !== 'source_and_dependencies_only') throw new Error('NETWORK_POLICY_INVALID');

  const issuedAt = parseTime(job.issuedAt, 'ISSUED_AT');
  const expiresAt = parseTime(job.expiresAt, 'EXPIRES_AT');
  if (expiresAt <= issuedAt) throw new Error('EXPIRY_ORDER_INVALID');
  if (expiresAt - issuedAt > 60 * 60 * 1000) throw new Error('JOB_LIFETIME_TOO_LONG');
  if (issuedAt > now + 5 * 60 * 1000) throw new Error('ISSUED_AT_IN_FUTURE');
  if (expiresAt <= now) throw new Error('JOB_EXPIRED');

  const maxRuntimeSeconds = Number(job.maxRuntimeSeconds);
  if (!Number.isInteger(maxRuntimeSeconds) || maxRuntimeSeconds < 30 || maxRuntimeSeconds > 3600) {
    throw new Error('RUNTIME_BUDGET_INVALID');
  }

  if (!allowUnsignedLocal) {
    if (job.signatureAlgorithm !== 'ed25519') throw new Error('SIGNATURE_ALGORITHM_INVALID');
    if (typeof job.signature !== 'string' || job.signature.length < 40) throw new Error('SIGNATURE_REQUIRED');
  }

  return {
    ...job,
    exactSha: job.exactSha.toLowerCase(),
    maxRuntimeSeconds,
  };
}

export function verifyJobSignature(job, publicKeyPem, options = {}) {
  const validated = validateJob(job, options);
  if (options.allowUnsignedLocal) return { valid: true, job: validated, digest: jobDigest(validated) };
  if (!publicKeyPem || typeof publicKeyPem !== 'string') throw new Error('CONTROL_PUBLIC_KEY_REQUIRED');

  const payload = Buffer.from(canonicalize(unsignedJobPayload(validated)), 'utf8');
  let signature;
  try {
    signature = Buffer.from(validated.signature, 'base64');
  } catch {
    throw new Error('SIGNATURE_ENCODING_INVALID');
  }
  const valid = cryptoVerify(null, payload, publicKeyPem, signature);
  if (!valid) throw new Error('JOB_SIGNATURE_INVALID');
  return { valid: true, job: validated, digest: sha256Hex(payload) };
}

export function createLocalJob({ taskId, exactSha, jobClass, now = Date.now(), maxRuntimeSeconds = 1800 }) {
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();
  return {
    schemaVersion: JOB_SCHEMA_VERSION,
    taskId,
    repository: 'banataosystems/Pandoras-box',
    exactSha: String(exactSha || '').toLowerCase(),
    jobClass,
    environment: 'verification',
    productionMutationAllowed: false,
    networkPolicy: 'source_and_dependencies_only',
    maxRuntimeSeconds,
    issuedAt,
    expiresAt,
    signatureAlgorithm: 'local-trusted',
  };
}
