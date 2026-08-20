#!/usr/bin/env node
// Read-only post-release readback for the governed GitHub runtime path.
// Requires no secrets and mutates nothing.
//
// IMPORTANT — what this can and cannot prove.
//
// An unauthenticated caller is rejected before buildGitHubConfiguration ever
// runs, so this script CANNOT exercise the Vault/OIDC precedence repair. It
// establishes preconditions only. Measured against production on 2026-08-20
// while the governed github_* tool path was still failing, every check below
// passed — so treating a green run here as "the fix works" would be exactly
// the vacuous proof this release is trying to avoid.
//
// Exit codes:
//   0  preconditions met AND an authenticated probe result was supplied and passed
//   2  preconditions met, fix UNVERIFIED (no authenticated probe supplied)
//   1  a precondition failed — do not proceed with the release

const args = process.argv.slice(2);
const readFlag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const origin = readFlag('--origin', process.env.PROJECTOS_MCP_RESOURCE_ORIGIN || 'https://mcpmaster.vercel.app');
const timeoutMs = Number(readFlag('--timeout-ms', '15000'));
// Supply the observed outcome of an authenticated governed call, e.g.
//   --authenticated-get-me ok        (github.get-me returned an identity)
//   --authenticated-get-me error     (it did not)
// and the observed mutation policy for the governed account:
//   --mutation-policy allowed | denied
const authenticatedGetMe = readFlag('--authenticated-get-me', null);
const mutationPolicy = readFlag('--mutation-policy', null);

async function probe(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(new URL(path, origin), { ...init, signal: controller.signal, redirect: 'manual' });
    await response.text().catch(() => '');
    return { status: response.status, ms: Date.now() - startedAt };
  } catch (error) {
    return { status: null, ms: Date.now() - startedAt, error: error?.name === 'AbortError' ? 'timeout' : String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

const preconditions = [];
const proofs = [];
const add = (list, name, state, detail) => list.push({ name, state, detail });

const mcp = await probe('/mcp', {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});

if (mcp.status === 401) {
  add(preconditions, 'mcp_auth_boundary', 'PASS', 'HTTP 401 — the function booted and refused an unauthenticated caller');
} else if (mcp.status === 200) {
  add(preconditions, 'mcp_auth_boundary', 'FAIL', 'HTTP 200 to an unauthenticated caller — auth boundary is NOT intact; roll back');
} else if (mcp.status === null || mcp.status >= 500) {
  add(preconditions, 'mcp_auth_boundary', 'FAIL', `origin produced no usable response (${mcp.status ?? mcp.error})`);
} else {
  add(preconditions, 'mcp_auth_boundary', 'FAIL', `unexpected HTTP ${mcp.status}`);
}

const health = await probe('/health');
add(preconditions, 'origin_reachable',
  health.status !== null && health.status < 500 ? 'PASS' : 'FAIL',
  health.status === null ? `unreachable (${health.error})` : `HTTP ${health.status} in ${health.ms}ms`);

// The actual release proof. Neither can be obtained unauthenticated.
if (authenticatedGetMe === 'ok') {
  add(proofs, 'governed_get_me', 'PASS', 'authenticated github.get-me returned an identity through the governed path');
} else if (authenticatedGetMe === 'error') {
  add(proofs, 'governed_get_me', 'FAIL', 'authenticated github.get-me did not return an identity — the repair did not take effect');
} else {
  add(proofs, 'governed_get_me', 'UNVERIFIED', 'no --authenticated-get-me result supplied; run an authenticated governed call and pass ok|error');
}

if (mutationPolicy === 'allowed') {
  add(proofs, 'mutation_policy_reconciled', 'PASS', 'governed account reports mutations allowed, matching the Supabase catalog');
} else if (mutationPolicy === 'denied') {
  add(proofs, 'mutation_policy_reconciled', 'FAIL', 'governed account still reports mutations denied — the split-brain persists');
} else {
  add(proofs, 'mutation_policy_reconciled', 'UNVERIFIED', 'no --mutation-policy result supplied; read it back and pass allowed|denied');
}

const render = (title, list) => {
  console.log(title);
  const width = Math.max(...list.map((entry) => entry.name.length));
  for (const entry of list) console.log(`  ${entry.state.padEnd(10)} ${entry.name.padEnd(width)}  ${entry.detail}`);
  console.log('');
};

render('PRECONDITIONS (unauthenticated, provable here)', preconditions);
render('RELEASE PROOF (authenticated, NOT provable here)', proofs);

if (preconditions.some((entry) => entry.state === 'FAIL')) {
  console.log('RESULT: precondition failed — do not proceed.');
  process.exit(1);
}
if (proofs.some((entry) => entry.state === 'FAIL')) {
  console.log('RESULT: release proof FAILED — roll back to the recorded rollback target.');
  process.exit(1);
}
if (proofs.some((entry) => entry.state === 'UNVERIFIED')) {
  console.log('RESULT: preconditions met, release UNVERIFIED. This is not success.');
  process.exit(2);
}
console.log('RESULT: preconditions met and release proof satisfied.');
process.exit(0);
