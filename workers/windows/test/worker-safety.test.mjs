import test from 'node:test';
import assert from 'node:assert/strict';
import { JOB_STEPS, redact } from '../pandora-worker.mjs';

test('worker job registry exposes no shell or arbitrary command field', () => {
  for (const [jobClass, steps] of Object.entries(JOB_STEPS)) {
    assert.ok(steps.length > 0, jobClass);
    for (const step of steps) {
      assert.equal(typeof step.command, 'string');
      assert.ok(Array.isArray(step.args));
      assert.equal('shell' in step, false);
      assert.equal('script' in step, false);
      assert.equal('commandLine' in step, false);
      for (const arg of step.args) assert.equal(typeof arg, 'string');
    }
  }
});

test('worker steps contain no deploy, merge, push, database mutation, or production release command', () => {
  const serialized = JSON.stringify(JOB_STEPS).toLowerCase();
  for (const forbidden of ['git push', 'git merge', 'vercel deploy', 'supabase db push', 'npm publish']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('redactor removes common secret forms', () => {
  const sample = [
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456',
    '[REDACTED]',
    '[REDACTED]',
    'password=hunter2',
  ].join('\n');
  const output = redact(sample);
  assert.equal(output.includes('abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(output.includes('ghp_abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(output.includes('sb_secret_abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(output.includes('hunter2'), false);
  assert.match(output, /REDACTED_SECRET/);
});
