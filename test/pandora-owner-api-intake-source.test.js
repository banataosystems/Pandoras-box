const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ownerApiSource = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'pandora-owner-api', 'index.ts'),
  'utf8',
);

const ALLOWED_INTAKE_SOURCES = new Set([
  'operator',
  'chatgpt',
  'github',
  'slack',
  'email',
  'api',
  'system',
]);

test('Pandora owner API uses a canonical ProjectOS intake source', () => {
  const sources = [...ownerApiSource.matchAll(/p_source:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );

  assert.deepEqual(sources, ['api']);
  assert.ok(sources.every((source) => ALLOWED_INTAKE_SOURCES.has(source)));
  assert.doesNotMatch(ownerApiSource, /flutterflow_owner_app/);
});

test('Real Route Integration: pipeline is wired and invoked', () => {
  assert.match(ownerApiSource, /import \{ executeOwnerCommand \} from ["']\.\.\/\.\.\/src\/projectos\/owner-command-pipeline\.ts["']/, 'Must import pipeline natively');
  assert.match(ownerApiSource, /executeOwnerCommand\s*\(/, 'Must invoke executeOwnerCommand');
  assert.match(ownerApiSource, /idempotencyKey:\s*providedKey/, 'Must pass idempotencyKey to execution');
});
