const actorLogin = (value) => value?.login ?? value?.user?.login ?? null;
const timestamp = (value) => {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};
const has = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));

function actorLists(allowances) {
  if (!allowances || typeof allowances !== "object") return null;
  const values = [allowances.users, allowances.teams, allowances.apps];
  if (!values.every(Array.isArray)) return null;
  return values;
}

export function evaluateNormalMergePath(input) {
  const errors = [];
  const pr = input.pull_request ?? {};
  const headSha = pr.head?.sha ?? pr.head_sha ?? null;
  const baseSha = pr.base?.sha ?? pr.base_sha ?? null;
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "")) errors.push("pull request head SHA is invalid");
  if (input.expected_base_sha && baseSha !== input.expected_base_sha) errors.push("pull request base is not current");
  if (pr.draft === true) errors.push("pull request is draft");
  if (pr.mergeable === false || ["dirty", "blocked"].includes(pr.mergeable_state)) errors.push("pull request is not mergeable");

  const protection = input.protection ?? {};
  const reviewsPolicy = protection.required_pull_request_reviews ?? {};
  const allowances = reviewsPolicy.bypass_pull_request_allowances;
  if (!has(reviewsPolicy, "bypass_pull_request_allowances")) errors.push("bypass_pull_request_allowances is absent");
  const lists = actorLists(allowances);
  if (!lists) errors.push("bypass_pull_request_allowances is malformed");
  else if (lists.some((list) => list.length > 0)) errors.push("normal merge path depends on bypass allowances");
  if (protection.enforce_admins !== true && protection.enforce_admins?.enabled !== true) errors.push("administrator enforcement is disabled");
  if (protection.required_conversation_resolution !== true && protection.required_conversation_resolution?.enabled !== true) {
    errors.push("conversation resolution is not enforced");
  }
  if (reviewsPolicy.dismiss_stale_reviews !== true) errors.push("stale approval dismissal is disabled");
  if (reviewsPolicy.require_last_push_approval !== true) errors.push("latest-push approval is disabled");

  const expectedCheck = input.required_check ?? {};
  const qualifyingCheck = (input.check_runs ?? []).find((check) =>
    check.name === expectedCheck.context &&
    check.head_sha === headSha &&
    check.app?.id === expectedCheck.app_id &&
    check.status === "completed" &&
    check.conclusion === "success",
  );
  if (!qualifyingCheck) errors.push("required exact-head app-bound check is absent");

  const author = pr.user?.login ?? pr.author_login ?? null;
  const latestPush = input.latest_push ?? {};
  const latestPusher = actorLogin(latestPush);
  const latestPushAt = timestamp(latestPush.pushed_at ?? latestPush.authored_at ?? latestPush.committed_at);
  if (!latestPusher) errors.push("latest pusher identity is absent");
  if (latestPushAt === null) errors.push("latest push timestamp is invalid");
  const eligible = new Set(input.eligible_reviewer_logins ?? []);
  const qualifyingApproval = (input.reviews ?? []).find((review) => {
    const reviewer = actorLogin(review);
    const submittedAt = timestamp(review.submitted_at);
    return review.state === "APPROVED" &&
      review.commit_id === headSha &&
      reviewer && reviewer !== author && reviewer !== latestPusher &&
      eligible.has(reviewer) && submittedAt !== null && latestPushAt !== null && submittedAt >= latestPushAt;
  });
  if (!qualifyingApproval) errors.push("qualifying independent current-head post-push approval is absent");
  if ((input.unresolved_conversation_count ?? 0) !== 0) errors.push("review conversations remain unresolved");
  return { ok: errors.length === 0, errors, qualifying_approval: qualifyingApproval ?? null, qualifying_check: qualifyingCheck ?? null };
}
