const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const test = require('node:test');

const execFileAsync = promisify(execFile);

test('canonical and public Control Tower assets are byte synchronized', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/verify-frontend-mirrors.mjs']);
  assert.match(stdout, /mirrors synchronized/);
});

test('all browser JavaScript passes syntax checks', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/check-browser-syntax.mjs']);
  assert.match(stdout, /Browser syntax checks passed/);
});
