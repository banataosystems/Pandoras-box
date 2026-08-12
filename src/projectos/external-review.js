"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProjectOSExternalReviewIssue = parseProjectOSExternalReviewIssue;
exports.findTrustedJulesReportReference = findTrustedJulesReportReference;
exports.evaluateJulesExternalReview = evaluateJulesExternalReview;
const FULL_SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REVIEW_PATH = /^docs\/reviews\/[A-Za-z0-9_.-]+\.md$/;
const JULES_LOGIN = 'google-labs-jules';
function normalizedLogin(value) {
    return typeof value === 'string'
        ? value.trim().toLowerCase().replace(/\[bot\]$/, '')
        : '';
}
function reportLink(body) {
    const matches = [...String(body || '').matchAll(/https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)/g)];
    if (matches.length !== 1)
        return undefined;
    const repository = matches[0]?.[1] || '';
    const number = Number(matches[0]?.[2] || 0);
    if (!REPOSITORY.test(repository) || !Number.isInteger(number) || number <= 0)
        return undefined;
    return { repository, number };
}
function exactVerdict(content) {
    const matches = [...content.matchAll(/^\s*projectos-verdict\s*:\s*(pass|changes-requested|blocked)\s*$/gim)];
    if (matches.length !== 1)
        return undefined;
    return matches[0]?.[1]?.toLowerCase();
}
function parseProjectOSExternalReviewIssue(pullRequestBody) {
    const source = typeof pullRequestBody === 'string' ? pullRequestBody : '';
    const matches = [...source.matchAll(/<!--\s*projectos-external-review-issue\s*:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)\s*-->/gi)];
    if (matches.length !== 1)
        return undefined;
    const repository = matches[0]?.[1] || '';
    const issueNumber = Number(matches[0]?.[2] || 0);
    if (!REPOSITORY.test(repository) || !Number.isInteger(issueNumber) || issueNumber <= 0) {
        return undefined;
    }
    return { repository, issueNumber };
}
function findTrustedJulesReportReference(comments) {
    const readyComments = comments
        .filter((comment) => normalizedLogin(comment.authorLogin) === JULES_LOGIN)
        .map((comment) => ({ comment, link: reportLink(comment.body) }))
        .filter((entry) => entry.link)
        .sort((left, right) => right.comment.createdAt.localeCompare(left.comment.createdAt));
    const entry = readyComments[0];
    if (!entry?.link)
        return undefined;
    return {
        repository: entry.link.repository,
        number: entry.link.number,
        trustedComment: entry.comment,
    };
}
function evaluateJulesExternalReview(input) {
    if (!REPOSITORY.test(input.targetRepository)
        || !Number.isInteger(input.targetPullRequestNumber)
        || input.targetPullRequestNumber <= 0
        || !FULL_SHA.test(input.currentHeadSha)) {
        return undefined;
    }
    const allowed = new Set(input.allowedReviewRepositories
        .filter((repository) => REPOSITORY.test(repository))
        .map((repository) => repository.toLowerCase()));
    if (!allowed.has(input.issue.repository.toLowerCase()))
        return undefined;
    if (input.report.repository.toLowerCase() !== input.issue.repository.toLowerCase())
        return undefined;
    if (!FULL_SHA.test(input.report.headSha)
        || normalizedLogin(input.report.headAuthorLogin) !== JULES_LOGIN
        || normalizedLogin(input.report.headCommitterLogin) !== JULES_LOGIN) {
        return undefined;
    }
    const reference = findTrustedJulesReportReference(input.comments);
    if (!reference
        || reference.repository.toLowerCase() !== input.report.repository.toLowerCase()
        || reference.number !== input.report.number) {
        return undefined;
    }
    if (input.report.files.length !== 1)
        return undefined;
    const file = input.report.files[0];
    if (!file || !REVIEW_PATH.test(file.path))
        return undefined;
    const content = file.content;
    const exactTarget = `${input.targetRepository}#${input.targetPullRequestNumber}`;
    if (!content.includes(exactTarget)
        || !content.includes(input.currentHeadSha)
        || !/Google\s+Jules|Jules\s*\/\s*Gemini/i.test(content)) {
        return undefined;
    }
    const verdict = exactVerdict(content);
    if (!verdict)
        return undefined;
    return {
        reviewerVendor: 'Google',
        reviewerLogin: 'google-labs-jules[bot]',
        reviewedHeadSha: input.currentHeadSha,
        verdict,
        sourceUrl: input.report.url,
        submittedAt: reference.trustedComment.createdAt || input.report.updatedAt,
    };
}
//# sourceMappingURL=external-review.js.map