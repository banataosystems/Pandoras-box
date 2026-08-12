"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditProjectOSMergedPullRequest = auditProjectOSMergedPullRequest;
const review_gate_1 = require("./review-gate");
const FULL_SHA = /^[0-9a-f]{40}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
function normalizedVendor(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function compareReviewRecency(left, right) {
    return right.submittedAt.localeCompare(left.submittedAt)
        || right.sourceUrl.localeCompare(left.sourceUrl);
}
function reviewerKey(review) {
    const login = typeof review.reviewerLogin === "string"
        ? review.reviewerLogin.trim().toLowerCase()
        : "";
    if (login)
        return `login:${login}`;
    return `vendor:${normalizedVendor(review.reviewerVendor)}|source:${review.sourceUrl}`;
}
function latestReviewPerReviewer(reviews) {
    const seen = new Set();
    return [...reviews]
        .sort(compareReviewRecency)
        .filter((review) => {
        const key = reviewerKey(review);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function selectReview(input) {
    const reviews = Array.isArray(input.reviews)
        ? latestReviewPerReviewer(input.reviews)
        : [];
    const builderVendor = normalizedVendor(input.builderVendor);
    return reviews.find((review) => (review.reviewedHeadSha === input.currentHeadSha
        && normalizedVendor(review.reviewerVendor)
        && normalizedVendor(review.reviewerVendor) !== builderVendor
        && review.verdict === "pass")) ?? reviews.find((review) => (review.reviewedHeadSha === input.currentHeadSha
        && normalizedVendor(review.reviewerVendor)
        && normalizedVendor(review.reviewerVendor) !== builderVendor)) ?? reviews[0];
}
function validateMetadata(input) {
    const blockers = [];
    if (typeof input.repository !== "string" || !input.repository.trim()) {
        blockers.push("repository is required");
    }
    if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) {
        blockers.push("pull request number must be a positive integer");
    }
    if (!FULL_SHA.test(input.currentHeadSha)) {
        blockers.push("current head must be a lowercase full SHA");
    }
    if (input.landed) {
        if (!input.mergeCommitSha || !FULL_SHA.test(input.mergeCommitSha)) {
            blockers.push("merged pull request requires a lowercase full merge commit SHA");
        }
        if (!input.mergedAt || !ISO_TIMESTAMP.test(input.mergedAt)) {
            blockers.push("merged pull request requires an ISO UTC mergedAt timestamp");
        }
    }
    return blockers;
}
function breachId(input) {
    const repository = input.repository.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    const head = FULL_SHA.test(input.currentHeadSha)
        ? input.currentHeadSha.slice(0, 12)
        : "invalid-head";
    return `GOV-${repository}-PR-${input.pullRequestNumber}-${head}`;
}
function auditProjectOSMergedPullRequest(input) {
    const selectedReview = selectReview(input);
    const gate = (0, review_gate_1.evaluateProjectOSReviewGate)({
        builderVendor: input.builderVendor,
        currentHeadSha: input.currentHeadSha,
        review: selectedReview,
        checks: input.checks,
        requiredChecks: input.requiredChecks,
    });
    const metadataBlockers = validateMetadata(input);
    const reasons = [...metadataBlockers, ...gate.blockers];
    const compliant = reasons.length === 0;
    const landingState = input.landed ? "merged" : "candidate";
    return {
        compliant,
        landingState,
        selectedReview,
        gate: metadataBlockers.length === 0
            ? gate
            : {
                ...gate,
                ready: false,
                blockers: reasons,
            },
        breach: input.landed && !compliant
            ? {
                id: breachId(input),
                repository: input.repository,
                pullRequestNumber: input.pullRequestNumber,
                mergedHeadSha: input.currentHeadSha,
                mergeCommitSha: input.mergeCommitSha || "",
                mergedAt: input.mergedAt || "",
                reasons,
                status: "open",
            }
            : undefined,
    };
}
//# sourceMappingURL=merge-compliance.js.map