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

test('redactor removes common secret forms without storing secret-shaped fixtures in source', () => {
  const bearer = ['Bearer', 'abcdefghijklmnopqrstuvwxyz123456'].join(' ');
  const githubPat = ['ghp', 'abcdefghijklmnopqrstuvwxyz123456'].join('_');
  const supabaseSecret = ['sb', 'secret', 'abcdefghijklmnopqrstuvwxyz'].join('_');

  const sample = [
    `Authorization: ${bearer}`,
    githubPat,
    supabaseSecret,
    'password=hunter2',
  ].join('\n');

  const output = redact(sample);
  assert.equal(output.includes('abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(output.includes(githubPat), false);
  assert.equal(output.includes(supabaseSecret), false);
  assert.equal(output.includes('hunter2'), false);
  assert.match(output, /REDACTED_SECRET/);
});
