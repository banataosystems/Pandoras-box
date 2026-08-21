"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeOwnerIntent = sanitizeOwnerIntent;
exports.projectIdentityFromName = projectIdentityFromName;
exports.buildBuilderIssueBody = buildBuilderIssueBody;
exports.extractPullRequestReference = extractPullRequestReference;

const MAX_INTENT_LENGTH = 20_000;
const MAX_PROJECT_NAME_LENGTH = 160;
const MAX_REPOSITORY_NAME_LENGTH = 100;

function sanitizedText(value, maximum = MAX_INTENT_LENGTH) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, maximum);
}

function sanitizeOwnerIntent(value) {
  let text = sanitizedText(value);
  if (!text) return '';

  text = text.replace(
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/gi,
    '[REDACTED PRIVATE KEY]',
  );
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [REDACTED]');
  text = text.replace(/\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16})\b/g, '[REDACTED CREDENTIAL]');
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED TOKEN]');
  text = text.replace(
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role[_-]?key|client[_-]?secret|private[_-]?key|password|secret|token)\b\s*([:=])\s*["']?([^\s,"'};]{8,})["']?/gi,
    (_match, key, separator) => `${key}${separator}[REDACTED]`,
  );
  return text.slice(0, MAX_INTENT_LENGTH);
}

function projectIdentityFromName(value) {
  const displayName = sanitizedText(value, MAX_PROJECT_NAME_LENGTH).replace(/\s+/g, ' ');
  if (!displayName) throw new Error('Project name is required');
  let repositoryName = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .replace(/[-_]{2,}/g, '-');
  repositoryName = repositoryName.slice(0, MAX_REPOSITORY_NAME_LENGTH).replace(/[._-]+$/g, '');
  if (!repositoryName || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(repositoryName)) {
    throw new Error('Project name cannot be converted to a safe repository name');
  }
  const projectKey = repositoryName.slice(0, 80).replace(/[._-]+$/g, '');
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(projectKey)) {
    throw new Error('Project name cannot be converted to a safe ProjectOS key');
  }
  return { displayName, repositoryName, projectKey };
}

function buildBuilderIssueBody({ projectName, repository, intent }) {
  const sanitizedIntent = sanitizeOwnerIntent(intent);
  if (!sanitizedIntent) throw new Error('A non-empty build intent is required');
  return [
    '# Pandora initial build',
    '',
    `Project: ${sanitizedText(projectName, MAX_PROJECT_NAME_LENGTH)}`,
    `Repository: ${repository}`,
    '',
    '## Owner intent',
    sanitizedIntent,
    '',
    '## Build contract',
    '- Implement the owner intent incrementally on a non-production branch.',
    '- Keep the repository runnable after every meaningful increment.',
    '- Add or update tests that prove the behavior you implement.',
    '- Report meaningful progress and blockers truthfully on this issue.',
    '- Open a pull request when a testable candidate exists and link it here.',
    '- Do not merge the pull request.',
    '- Do not production-deploy, release, spend money, change secrets, or weaken governance.',
    '- If provider access is missing, stop at the exact blocker and report what is required.',
    '',
    'The owner should be able to follow progress from Pandora without understanding GitHub internals.',
  ].join('\n');
}

function extractPullRequestReference(value, repository) {
  const text = String(value ?? '');
  const escaped = String(repository ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = escaped
    ? text.match(new RegExp(`https://github\\.com/${escaped}/pull/(\\d+)`, 'i'))
    : text.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i);
  if (!match) return undefined;
  const number = Number.parseInt(match[1], 10);
  return Number.isInteger(number) && number > 0 ? { number, url: match[0] } : undefined;
}
