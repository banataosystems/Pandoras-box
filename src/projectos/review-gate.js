"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateProjectOSReviewGate = evaluateProjectOSReviewGate;
const FULL_SHA = /^[0-9a-f]{40}$/;
function normalizedVendor(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function validSourceUrl(value) {
    if (typeof value !== "string")
        return false;
    try {
        return new URL(value).protocol === "https:";
    }
    catch {
        return false;
    }
}
function evaluateProjectOSReviewGate(input) {
    const blockers = [];
    const invalidatedEvidence = [];
    const checks = Array.isArray(input.checks) ? input.checks : [];
    const requiredChecks = Array.isArray(input.requiredChecks)
        ? input.requiredChecks
        : [];
    if (!normalizedVendor(input.builderVendor)) {
        blockers.push("builder vendor is required");
    }
    if (!FULL_SHA.test(input.currentHeadSha)) {
        blockers.push("current head must be a lowercase full SHA");
    }
    const reviewerIndependent = Boolean(input.review
        && normalizedVendor(input.review.reviewerVendor)
        && normalizedVendor(input.review.reviewerVendor)
            !== normalizedVendor(input.builderVendor));
    if (!input.review) {
        blockers.push("different-vendor review evidence is required");
    }
    else {
        if (!normalizedVendor(input.review.reviewerVendor)) {
            blockers.push("reviewer vendor is required");
        }
        else if (!reviewerIndependent) {
            blockers.push("reviewer vendor must differ from builder vendor");
        }
        if (!validSourceUrl(input.review.sourceUrl)) {
            blockers.push("review source URL must use HTTPS");
        }
    }
    const reviewCurrent = Boolean(input.review
        && FULL_SHA.test(input.review.reviewedHeadSha)
        && input.review.reviewedHeadSha === input.currentHeadSha);
    if (input.review && !FULL_SHA.test(input.review.reviewedHeadSha)) {
        blockers.push("reviewed head must be a lowercase full SHA");
    }
    else if (input.review && !reviewCurrent) {
        blockers.push("review is stale for the current head");
        invalidatedEvidence.push(`review:${input.review.reviewedHeadSha}`);
    }
    if (input.review && input.review.verdict !== "pass") {
        blockers.push(`review verdict is ${input.review.verdict}`);
    }
    const checksByName = new Map();
    if (!Array.isArray(input.checks)) {
        blockers.push("checks must be an array");
    }
    for (const check of checks) {
        if (!check || typeof check !== "object") {
            blockers.push("check evidence must be an object");
            continue;
        }
        if (typeof check.name !== "string" || !check.name.trim()) {
            blockers.push("check name is required");
            continue;
        }
        if (checksByName.has(check.name)) {
            blockers.push(`duplicate check evidence for ${check.name}`);
            continue;
        }
        checksByName.set(check.name, check);
        if (!FULL_SHA.test(check.headSha)) {
            blockers.push(`${check.name} head must be a lowercase full SHA`);
        }
        if (!validSourceUrl(check.sourceUrl)) {
            blockers.push(`${check.name} source URL must use HTTPS`);
        }
    }
    if (!Array.isArray(input.requiredChecks)) {
        blockers.push("requiredChecks must be an array");
    }
    const validRequiredChecks = requiredChecks.filter((name) => typeof name === "string" && Boolean(name.trim()));
    if (validRequiredChecks.length !== requiredChecks.length) {
        blockers.push("required check names must be non-empty strings");
    }
    const uniqueRequiredChecks = [...new Set(validRequiredChecks)];
    if (uniqueRequiredChecks.length !== validRequiredChecks.length) {
        blockers.push("required checks must be unique");
    }
    for (const name of uniqueRequiredChecks) {
        const check = checksByName.get(name);
        if (!check) {
            blockers.push(`required check ${name} is missing`);
            continue;
        }
        if (check.kind !== "deterministic") {
            blockers.push(`required check ${name} must be deterministic; model output cannot be a required CI check`);
        }
        if (check.headSha !== input.currentHeadSha) {
            blockers.push(`required check ${name} is stale for the current head`);
            invalidatedEvidence.push(`check:${name}:${check.headSha}`);
        }
        if (check.conclusion !== "success") {
            blockers.push(`required check ${name} is ${check.conclusion}`);
        }
    }
    const checksCurrent = uniqueRequiredChecks.length > 0
        && uniqueRequiredChecks.every((name) => {
            const check = checksByName.get(name);
            return Boolean(check
                && check.kind === "deterministic"
                && check.headSha === input.currentHeadSha
                && check.conclusion === "success");
        });
    if (uniqueRequiredChecks.length === 0) {
        blockers.push("at least one deterministic required check is required");
    }
    return {
        ready: blockers.length === 0,
        reviewerIndependent,
        reviewCurrent,
        checksCurrent,
        blockers,
        invalidatedEvidence,
    };
}
//# sourceMappingURL=review-gate.js.map