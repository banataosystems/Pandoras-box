"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PandoraPlanMemoryContextProvider,
  hashPlanMemoryContextEnvelope,
} = require('../src/runtime/plan-memory-context.js');
const {
  CONTRACT_PATH,
  EXPECTED_CONTEXT_SECTIONS,
  SEARCH_PATH,
  validateMemoryCapabilityContract,
} = require('../src/runtime/memory-capability-contract.js');

function contract() {
  return {
    schema_version: '1.0.0',
    contract_id: 'pandora-projectos-memory-puzzle',
    contract_version: '1.0.0',
    authority: {
      repository: 'banataosystems/pandoras-box-memory',
      service_origin: 'https://pandorasbox-memory.vercel.app',
      role: 'durable_context_evidence_learning_continuity_plane',
    },
    consumer: {
      repository: 'banataosystems/Pandoras-box',
      role: 'governed_execution_control_plane',
    },
    compatibility: {
      supported_consumer_major_versions: [1],
      unknown_required_capability: 'fail_closed',
      missing_required_context_section: 'degrade_and_require_provider_verification',
      hash_algorithm: 'sha256',
    },
    endpoints: {
      contract: { method: 'GET', path: CONTRACT_PATH, authentication: 'public_non_secret_metadata' },
      health: { method: 'GET', path: '/api/projectos/health', authentication: 'vercel_oidc', required: true },
      search: { method: 'POST', path: SEARCH_PATH, authentication: 'vercel_oidc', required: true },
      evidence_candidates: {
        method: 'POST',
        path: '/api/projectos/memory/evidence-candidates',
        authentication: 'vercel_oidc',
        required: false,
        review_gate: 'human_review_required',
      },
    },
    capabilities: [
      { id: 'memory.health', required: true, safe_read: true, canonical_write: false },
      {
        id: 'memory.full_context_search',
        required: true,
        safe_read: true,
        canonical_write: false,
        response_sections: [...EXPECTED_CONTEXT_SECTIONS],
      },
      {
        id: 'memory.evidence_candidate_submission',
        required: false,
        safe_read: false,
        canonical_write: false,
        review_gate: 'human_review_required',
        automatic_promotion: false,
      },
    ],
    context_sections: EXPECTED_CONTEXT_SECTIONS.map((field) => ({
      field,
      required: true,
      consumer_duty: 'consume_or_record_explicit_empty',
    })),
    privacy: {
      persist_raw_provider_arguments: false,
      persist_raw_provider_results: false,
      persist_raw_errors: false,
      persist_secrets_or_credentials: false,
      persist_direct_sensitive_identifiers: false,
      evidence_candidate_policy: 'metadata_only_v2_fail_closed',
    },
    promotion_policy: {
      automatic_canonical_promotion: false,
      human_review_required: true,
      history_is_superseded_not_overwritten: true,
    },
  };
}

function fullSearch() {
  const response = {
    ok: true,
    namespace: 'real_life',
    current_task: 'Prepare a governed plan',
    approved_record_count: 1,
    requested_canon_statuses: ['approved'],
    retrieval_mode: 'hybrid',
    retrieval_reasoning_summary: 'Combined all governed context classes.',
    warnings: [],
  };
  for (const field of [
    'adaptive_profile', 'style_profile', 'project_context', 'people_context',
    'risk_warnings', 'open_loops', 'recent_events', 'semantic_matches',
    'canonical_records',
  ]) response[field] = [{ title: field, summary: `${field} summary`, next_action: `${field} next` }];
  response.latest_context_pack = { title: 'Latest', summary: 'Latest context pack.' };
  response.daily_context_pack = { title: 'Daily', summary: 'Daily context pack.' };
  return response;
}

function response(value, status = 200) {
  const text = JSON.stringify(value);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(Buffer.byteLength(text)) : null },
    body: null,
    text: async () => text,
  };
}

function providerFor(contractValue, searchValue, calls) {
  return new PandoraPlanMemoryContextProvider({
    baseUrl: 'https://pandorasbox-memory.vercel.app',
    now: () => new Date('2026-08-17T12:00:00.000Z'),
    fetchFn: async (url, options) => {
      const path = new URL(url).pathname;
      calls.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
      if (path === CONTRACT_PATH) return response(contractValue);
      if (path === SEARCH_PATH) return response(searchValue);
      return response({ ok: false }, 404);
    },
  });
}

test('rejects unknown required Memory context sections', () => {
  const value = contract();
  value.capabilities[1].response_sections.push('unknown_required_section');
  value.context_sections.push({ field: 'unknown_required_section', required: true, consumer_duty: 'consume' });
  assert.throws(() => validateMemoryCapabilityContract(value), /response sections mismatch/);
});

test('consumes the complete safe Memory contract before a durable plan', async () => {
  const calls = [];
  const result = await providerFor(contract(), fullSearch(), calls).hydrate('o'.repeat(80), {
    tool: 'github.create-pull-request',
    args: { owner: 'banataosystems', repo: 'Pandoras-box', secret: 'must-not-persist' },
  });
  assert.deepEqual(calls.map((call) => [call.method, call.path]), [['GET', CONTRACT_PATH], ['POST', SEARCH_PATH]]);
  assert.equal(calls[1].body.include_profiles, true);
  assert.equal(calls[1].body.include_semantic, true);
  assert.equal(calls[1].body.include_recent, true);
  assert.equal(calls[1].body.include_open_loops, true);
  assert.deepEqual(calls[1].body.canon_statuses, ['approved']);
  assert.equal(result.envelope.schemaVersion, '2.0.0');
  assert.equal(result.envelope.status, 'available');
  assert.equal(result.envelope.capabilityContract.compatible, true);
  assert.equal(result.envelope.capabilityContract.utilizationPercentage, 100);
  assert.deepEqual(result.envelope.capabilityContract.missingRequiredSections, []);
  assert.deepEqual(new Set(result.envelope.capabilityContract.observedSections), new Set(EXPECTED_CONTEXT_SECTIONS));
  assert.equal(result.envelope.counts.adaptiveProfile, 1);
  assert.equal(result.envelope.counts.peopleContext, 1);
  assert.equal(result.envelope.counts.dailyContextPack, 1);
  assert.equal(result.envelope.counts.canonicalRecords, 1);
  assert.equal(result.envelope.retrieval.mode, 'hybrid');
  assert.equal(result.envelope.fallbackRequired, false);
  assert.equal(result.envelope.queryBasis.identifiers.secret, undefined);
  assert.equal(result.contextHash, hashPlanMemoryContextEnvelope(result.envelope));
});

test('requires provider fallback when Memory omits a required section', async () => {
  const search = fullSearch();
  delete search.daily_context_pack;
  const result = await providerFor(contract(), search, []).hydrate('o'.repeat(80), {
    tool: 'github.get-repository',
    args: { owner: 'banataosystems', repo: 'Pandoras-box' },
  });
  assert.equal(result.envelope.status, 'unavailable');
  assert.equal(result.envelope.fallbackRequired, true);
  assert.equal(result.envelope.capabilityContract.compatible, false);
  assert.equal(result.envelope.failure.code, 'MEMORY_SEARCH_REQUIRED_SECTION_MISSING');
});
