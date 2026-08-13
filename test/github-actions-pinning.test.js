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
  const workflowGlobOccurrences = securityWorkflow.match(
    /- '\.github\/workflows\/\*\*'/g,
  );

  assert.equal(workflowGlobOccurrences?.length, 2);
  const patchGlobOccurrences = securityWorkflow.match(/- 'patches\/\*\*'/g);
  assert.equal(patchGlobOccurrences?.length, 2);
});

test('exceptional recovery publishers cannot run automatically', () => {
  for (const filename of [
    'recover-canonical-source.yml',
    'recovery-actions-write-probe.yml',
  ]) {
    const source = fs.readFileSync(path.join(workflowDirectory, filename), 'utf8');
    assert.match(source, /^\s*workflow_dispatch:\s*$/m, filename);
    assert.doesNotMatch(source, /^\s*push:\s*$/m, filename);
    assert.doesNotMatch(source, /^\s*pull_request:\s*$/m, filename);
  }
});

test('operational recovery separates PR validation from trusted publication', () => {
  const source = fs.readFileSync(
    path.join(workflowDirectory, 'recover-operational-core.yml'),
    'utf8',
  );

  assert.match(source, /validate-core:[\s\S]*?permissions:\n\s+contents: read/);
  assert.match(
    source,
    /publish-core:[\s\S]*?github\.event_name == 'workflow_dispatch'[\s\S]*?github\.ref == 'refs\/heads\/main'[\s\S]*?permissions:\n\s+contents: write/,
  );
  assert.match(
    source,
    /outputs:\n\s+validated_sha: \$\{\{ steps\.validated_source\.outputs\.sha \}\}/,
  );
  assert.match(
    source,
    /publish-core:[\s\S]*?ref: \$\{\{ needs\.validate-core\.outputs\.validated_sha \}\}/,
  );
  assert.doesNotMatch(
    source,
    /publish-core:[\s\S]*?ref: recovery\/materialize-source/,
  );
  assert.doesNotMatch(source, /git push origin HEAD:recovery\/materialize-source/);
  assert.match(
    source,
    /branch="recovery\/materialize-source-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/,
  );
  assert.match(source, /- 'patches\/\*\*'/);
  assert.match(source, /- 'scripts\/check-private-key-literals\.sh'/);
  assert.equal(
    source.match(/bash scripts\/check-private-key-literals\.sh/g)?.length,
    2,
  );
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

    fs.writeFileSync(
      path.join(fixture, 'unsafe.txt'),
      '-----BEGIN PRIVATE KEY-----\nfixture\n',
    );
    assert.equal(spawnSync('bash', [scanner, fixture]).status, 1);

    assert.notEqual(
      spawnSync('bash', [scanner, path.join(fixture, 'missing')]).status,
      0,
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
