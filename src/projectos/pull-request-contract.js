"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProjectOSPullRequest = validateProjectOSPullRequest;
const FULL_SHA = /^[0-9a-f]{40}$/;
const REQUIRED_LABEL_CATEGORIES = [
    "state:",
    "class:",
    "builder:",
    "reviewer:",
    "risk:",
    "product:",
    "gate:",
];
function validateProjectOSPullRequest(input) {
    const errors = [];
    if (!input.builderVendor?.trim())
        errors.push("builderVendor is required");
    if (!input.reviewerVendor?.trim())
        errors.push("reviewerVendor is required");
    if (!FULL_SHA.test(input.baseSha))
        errors.push("baseSha must be a lowercase 40-character commit SHA");
    if (!FULL_SHA.test(input.headSha))
        errors.push("headSha must be a lowercase 40-character commit SHA");
    if (input.builderVendor?.trim().toLowerCase() === input.reviewerVendor?.trim().toLowerCase()) {
        errors.push("reviewerVendor must differ from builderVendor");
    }
    for (const prefix of REQUIRED_LABEL_CATEGORIES) {
        if (!input.labels.some((label) => label.startsWith(prefix))) {
            errors.push(`labels must include category ${prefix.slice(0, -1)}`);
        }
    }
    const reviewCurrent = Boolean(input.reviewedHeadSha &&
        FULL_SHA.test(input.reviewedHeadSha) &&
        input.reviewedHeadSha === input.headSha);
    return {
        valid: errors.length === 0,
        errors,
        reviewCurrent,
    };
}
//# sourceMappingURL=pull-request-contract.js.map