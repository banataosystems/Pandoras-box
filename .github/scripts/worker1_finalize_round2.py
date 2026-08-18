from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    target.write_text(text.replace(old, new, 1))


# Repair deterministic duplicated markers emitted by the bounded transformer.
replace_once(
    "src/tools/memory-evidence-intake.js",
    "function safeCorrelationId]);\n\nfunction safeCorrelationId",
    "function safeCorrelationId",
    "safe-correlation marker",
)
replace_once(
    "src/tools/memory-evidence-intake.js",
    "function safeBackendFailurefunction safeBackendFailure",
    "function safeBackendFailure",
    "safe-backend marker",
)
replace_once(
    "src/tools/memory-evidence-intake.js",
    "function submissionFailurefunction submissionFailure",
    "function submissionFailure",
    "submission-failure marker",
)
replace_once(
    "src/projectos-mcp-handler.js",
    "function rpcResultfunction rpcResult",
    "function rpcResult",
    "rpc-result marker",
)
replace_once(
    "test/projectos-memory-supabase-contract-regression.test.js",
    'test("array-valued provider readstest("array-valued provider reads',
    'test("array-valued provider reads',
    "array-test marker",
)

# A safe backend code paired with the wrong HTTP status is contract drift, not
# a truthful downstream 4xx. Surface it as an outer response-contract 502.
replace_once(
    "src/tools/memory-evidence-intake.js",
    "outerStatus: normalizeOuterFailureStatus(response.status),",
    "outerStatus: classified.safeErrorCode === \"response_contract_error\"\n          ? 502\n          : normalizeOuterFailureStatus(response.status),",
    "status/code pairing outer status",
)

legacy = Path("test/memory-evidence-intake.test.js")
legacy_text = legacy.read_text()

old_success = '''function successBody(overrides = {}) {
  return {
    ok: true,
    candidate_id: "11111111-1111-4111-8111-111111111111",
    status: "pending_review",
    idempotency_key: validArgs().idempotencyKey,
    namespace: "real_life",
    project_id: CANONICAL_PROJECT_ID,
    project_key: CANONICAL_PROJECT_KEY,
    proof_stage: "tested",
    deduplicated: false,
    created_at: "2026-08-14T11:00:00Z",
    ...overrides,
  };
}
'''
new_success = '''function successBody(overrides = {}) {
  return {
    ok: true,
    candidate_id: "11111111-1111-4111-8111-111111111111",
    review_item_id: "22222222-2222-4222-8222-222222222222",
    status: "pending_review",
    idempotency_key: validArgs().idempotencyKey,
    namespace: "real_life",
    project_id: CANONICAL_PROJECT_ID,
    project_key: CANONICAL_PROJECT_KEY,
    proof_stage: "tested",
    deduplicated: false,
    created_at: "2026-08-14T11:00:00Z",
    canonical_memory_written: false,
    privacy_policy: "metadata_only_v1",
    ...overrides,
  };
}

function assertResponseContractFailure(error) {
  const failure = JSON.parse(error.message);
  assert.equal(error.status, 502);
  assert.equal(failure.safeErrorCode, "response_contract_error");
  assert.equal(failure.validationCategory, "response_contract");
  assert.equal(failure.retryable, false);
  return true;
}
'''
if legacy_text.count(old_success) != 1:
    raise SystemExit("legacy strict success fixture: expected one match")
legacy_text = legacy_text.replace(old_success, new_success, 1)

old_first_status = '''return new Response(JSON.stringify(successBody()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });'''
new_first_status = '''return new Response(JSON.stringify(successBody()), {
      status: 202,
      headers: { "content-type": "application/json" },
    });'''
if legacy_text.count(old_first_status) != 1:
    raise SystemExit("legacy initial success status: expected one match")
legacy_text = legacy_text.replace(old_first_status, new_first_status, 1)

identity_start = legacy_text.index(
    'test("response identity and proof stage are bound to the submitted candidate"'
)
identity_end = legacy_text.index(
    'test("server-resolved canonical project identity is returned once validated"',
    identity_start,
)
legacy_text = legacy_text[:identity_start] + '''test("response identity and proof stage are bound to the submitted candidate", async () => {
  for (const [name, override] of [
    ["namespace", { namespace: "au" }],
    ["proof stage", { proof_stage: "production_verified" }],
    ["idempotency", { idempotency_key: "different-key-123456789" }],
    ["project key", { project_key: "memory" }],
  ]) {
    await assert.rejects(
      () => submitEvidenceCandidate(validArgs(), config, async () =>
        new Response(JSON.stringify(successBody(override)), { status: 202 })),
      assertResponseContractFailure,
      name,
    );
  }
});

''' + legacy_text[identity_end:]

substituted_start = legacy_text.index(
    'test("substituted or malformed canonical project identity fails closed"'
)
substituted_end = legacy_text.index(
    'test("backend 409 is classified as an explicit idempotency conflict"',
    substituted_start,
)
legacy_text = legacy_text[:substituted_start] + '''test("substituted or malformed canonical project identity fails closed", async () => {
  const withId = { ...validArgs(), projectId: CANONICAL_PROJECT_ID };
  const { projectKey, ...idOnly } = withId;
  for (const [name, args, override] of [
    [
      "substituted project id",
      withId,
      { project_id: "43f619bb-ecc2-4a9a-bd56-424325eb81ac" },
    ],
    [
      "missing canonical project id",
      validArgs(),
      { project_id: null },
    ],
    [
      "malformed canonical project id",
      validArgs(),
      { project_id: "not-a-uuid" },
    ],
    [
      "malformed canonical project key",
      idOnly,
      { project_key: "NOT A KEY" },
    ],
    [
      "missing canonical project key",
      idOnly,
      { project_key: null },
    ],
  ]) {
    await assert.rejects(
      () => submitEvidenceCandidate(args, config, async () =>
        new Response(JSON.stringify(successBody(override)), { status: 202 })),
      assertResponseContractFailure,
      name,
    );
  }
});

''' + legacy_text[substituted_end:]

old_non_pending = '''await assert.rejects(
    () => submitEvidenceCandidate(validArgs(), config, async () =>
      new Response(JSON.stringify({ ok: true, status: "hard_canon" }), { status: 200 })),
    /did not remain pending review/,
  );'''
new_non_pending = '''await assert.rejects(
    () => submitEvidenceCandidate(validArgs(), config, async () =>
      new Response(JSON.stringify({ ok: true, status: "hard_canon" }), { status: 200 })),
    assertResponseContractFailure,
  );'''
if legacy_text.count(old_non_pending) != 1:
    raise SystemExit("legacy non-pending assertion: expected one match")
legacy.write_text(legacy_text.replace(old_non_pending, new_non_pending, 1))

claude = Path("test/projectos-memory-claude-review-regression.test.js")
claude_text = claude.read_text()
old_claude_response = '''function pendingReviewResponse(args) {
  return {
    ok: true,
    candidate_id: "22222222-2222-4222-8222-222222222222",
    status: "pending_review",
    deduplicated: false,
    idempotency_key: args.idempotencyKey,
    namespace: args.namespace,
    project_id: "33333333-3333-4333-8333-333333333333",
    project_key: args.projectKey,
    proof_stage: args.proofStage,
    created_at: "2026-08-19T06:40:00.000Z",
  };
}'''
new_claude_response = '''function pendingReviewResponse(args) {
  return {
    ok: true,
    candidate_id: "22222222-2222-4222-8222-222222222222",
    review_item_id: "44444444-4444-4444-8444-444444444444",
    status: "pending_review",
    deduplicated: false,
    idempotency_key: args.idempotencyKey,
    namespace: args.namespace,
    project_id: "33333333-3333-4333-8333-333333333333",
    project_key: args.projectKey,
    proof_stage: args.proofStage,
    created_at: "2026-08-19T06:40:00.000Z",
    canonical_memory_written: false,
    privacy_policy: "metadata_only_v1",
  };
}'''
if claude_text.count(old_claude_response) != 1:
    raise SystemExit("Claude strict success fixture: expected one match")
claude_text = claude_text.replace(old_claude_response, new_claude_response, 1)
if claude_text.count('assert.equal(failure.safeErrorCode, "evidence_candidate_invalid");') != 1:
    raise SystemExit("Claude body-level safe code: expected one match")
claude_text = claude_text.replace(
    'assert.equal(failure.safeErrorCode, "evidence_candidate_invalid");',
    'assert.equal(failure.safeErrorCode, "response_contract_error");\n'
    '      assert.equal(failure.validationCategory, "response_contract");',
    1,
)
if claude_text.count('{ status: 201 }') != 1:
    raise SystemExit("Claude strict success status: expected one match")
claude.write_text(claude_text.replace('{ status: 201 }', '{ status: 202 }', 1))

strict_test = Path("test/projectos-memory-supabase-contract-regression.test.js")
strict_text = strict_test.read_text()
old_case = '[202, { ...base, project_id: "77777777-7777-4777-8777-777777777777" }],'
new_case = '[202, { ...base, project_id: "not-a-project-uuid" }],'
if strict_text.count(old_case) != 1:
    raise SystemExit("strict project identity case: expected one match")
strict_test.write_text(strict_text.replace(old_case, new_case, 1))
