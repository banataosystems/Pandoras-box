const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const workflowDirectory = path.join(__dirname, '..', '.github', 'workflows');
const immutableRevision = /^[0-9a-f]{40}$/;

test('every external GitHub Action is pinned to an immutable commit', () => {
  const failures = [];
  for (const filename of fs.readdirSync(workflowDirectory).sort()) {
    if (!/\.ya?ml$/.test(filename)) continue;
    const source = fs.readFileSync(path.join(workflowDirectory, filename), 'utf8');
    for (const [index, line] of source.split('\n').entries()) {
      const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/);
      if (!match || match[1].startsWith('./')) continue;
      const separator = match[1].lastIndexOf('@');
      const revision = separator < 0 ? '' : match[1].slice(separator + 1);
      if (!immutableRevision.test(revision)) {
        failures.push(`${filename}:${index + 1} ${match[1]}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});

test('security regression runs whenever any workflow changes', () => {
  const securityWorkflow = fs.readFileSync(
    path.join(workflowDirectory, 'projectos-security.yml'),
    'utf8',
  );

  // The gate is always-on: it triggers on every pull request and every push to
  // main with no path filter at all, so a workflow or patch change can never
  // route around it. This asserts that policy rather than the earlier
  // path-glob mechanism, which enumerated the covered directories and could
  // silently omit one.
  const triggers = securityWorkflow.slice(
    securityWorkflow.indexOf('\non:'),
    securityWorkflow.indexOf('\npermissions:'),
  );

  assert.match(triggers, /^\s*pull_request:\s*$/m);
  assert.match(triggers, /^\s*push:\s*$/m);
  assert.match(triggers, /^\s*branches:\s*\[main\]\s*$/m);
  assert.doesNotMatch(
    triggers,
    /^\s*paths:\s*$/m,
    'A path filter would let changes outside the listed globs skip the gate.',
  );
});

test('exceptional recovery publishers cannot run automatically', () => {
  for (const filename of [
    'recover-canonical-source.yml',
    'recover-operational-core.yml',
    'recovery-actions-write-probe.yml',
  ]) {
    const source = fs.readFileSync(path.join(workflowDirectory, filename), 'utf8');
    assert.match(source, /^\s*workflow_dispatch:\s*$/m, filename);
    assert.doesNotMatch(source, /^\s*push:\s*$/m, filename);
    assert.doesNotMatch(source, /^\s*pull_request:\s*$/m, filename);
  }
});

test('broken operational transport remains quarantined and read-only', () => {
  const source = fs.readFileSync(
    path.join(workflowDirectory, 'recover-operational-core.yml'),
    'utf8',
  );

  assert.match(source, /^permissions:\n\s+contents: read$/m);
  assert.doesNotMatch(source, /contents: write/);
  assert.doesNotMatch(source, /git (?:commit|push)/);
  assert.doesNotMatch(source, /base64 -d|tar -x/);
  assert.match(
    source,
    /Legacy operational transport is incomplete and quarantined/,
  );
  assert.equal(
    source.match(/bash scripts\/check-private-key-literals\.sh/g)?.length,
    1,
  );
  for (const requiredPath of [
    'vercel-entrypoint.js',
    'vercel.json',
    'src',
    'packages',
    'supabase',
  ]) {
    assert.match(source, new RegExp(`(?:^|\\s)${requiredPath.replace('.', '\\.')}(?:\\s|$)`));
  }
});

test('private-key marker scan fails closed', () => {
  const fixture = fs.mkdtempSync(path.join(__dirname, 'private-key-scan-'));
  const scanner = path.join(
    __dirname,
    '..',
    'scripts',
    'check-private-key-literals.sh',
  );
  try {
    const safeFile = path.join(fixture, 'safe.txt');
    fs.writeFileSync(safeFile, 'ordinary source\n');
    assert.equal(spawnSync('bash', [scanner, fixture]).status, 0);

    for (const [index, label] of ['', 'RSA ', 'EC ', 'OPENSSH '].entries()) {
      const unsafeFile = path.join(fixture, `unsafe-${index}.txt`);
      fs.writeFileSync(
        unsafeFile,
        `-----BEGIN ${label}PRIVATE KEY-----\nfixture\n`,
      );
      assert.equal(spawnSync('bash', [scanner, fixture]).status, 1);
      fs.rmSync(unsafeFile);
    }

    assert.notEqual(
      spawnSync('bash', [scanner, path.join(fixture, 'missing')]).status,
      0,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
