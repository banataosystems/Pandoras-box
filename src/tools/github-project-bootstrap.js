"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubProjectBootstrapTools = void 0;
exports.executeGitHubProjectBootstrapTool = executeGitHubProjectBootstrapTool;

const project_bootstrap_js_1 = require("../projectos/project-bootstrap.js");

function githubHeaders(config) {
  return {
    Authorization: `token ${config.token}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Pandora-ProjectOS",
    "Content-Type": "application/json",
  };
}

async function readJson(response, label) {
  const text = await response.text();
  let value;
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
  if (!response.ok) {
    const detail = value && typeof value.message === "string" ? `: ${value.message}` : "";
    throw new Error(`${label} failed with ${response.status}${detail}`);
  }
  return value;
}

function normalizeLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function assertConfiguredOwner(config, owner) {
  const configured = typeof config.login === "string" ? config.login.trim() : "";
  if (!configured || configured.toLowerCase() !== String(owner || "").trim().toLowerCase()) {
    throw new Error("GitHub repository creation is limited to the configured account login");
  }
}

async function createRepository(config, owner, name, description) {
  assertConfiguredOwner(config, owner);
  const response = await fetch(`${config.baseUrl}/user/repos`, {
    method: "POST",
    headers: githubHeaders(config),
    body: JSON.stringify({ name, description, private: true, auto_init: true }),
  });
  const repository = await readJson(response, "GitHub repository creation");
  if (repository?.owner?.login !== owner || repository?.full_name !== `${owner}/${name}`) {
    throw new Error("GitHub returned an unexpected repository identity");
  }
  if (repository.private !== true) {
    throw new Error("GitHub repository bootstrap did not create a private repository");
  }
  return repository;
}

async function ensureLabel(config, owner, repo, name) {
  const encoded = encodeURIComponent(name);
  const existing = await fetch(`${config.baseUrl}/repos/${owner}/${repo}/labels/${encoded}`, {
    headers: githubHeaders(config),
  });
  if (existing.ok) return readJson(existing, "GitHub label lookup");
  if (existing.status !== 404) return readJson(existing, "GitHub label lookup");
  const created = await fetch(`${config.baseUrl}/repos/${owner}/${repo}/labels`, {
    method: "POST",
    headers: githubHeaders(config),
    body: JSON.stringify({ name, color: "ededed" }),
  });
  if (created.status === 422) return { name };
  return readJson(created, "GitHub label creation");
}

async function createBuilderIssue(config, owner, repo, projectName, intent) {
  const response = await fetch(`${config.baseUrl}/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: githubHeaders(config),
    body: JSON.stringify({
      title: `Pandora initial build — ${projectName}`,
      body: (0, project_bootstrap_js_1.buildBuilderIssueBody)({
        projectName,
        repository: `${owner}/${repo}`,
        intent,
      }),
      labels: ["jules"],
    }),
  });
  return readJson(response, "GitHub builder issue creation");
}

async function listIssueComments(config, owner, repo, issueNumber, perPage) {
  const limit = normalizeLimit(perPage);
  const response = await fetch(
    `${config.baseUrl}/repos/${owner}/${repo}/issues/${Number(issueNumber)}/comments?per_page=${limit}`,
    { headers: githubHeaders(config) },
  );
  const comments = await readJson(response, "GitHub issue comment listing");
  if (!Array.isArray(comments)) throw new Error("GitHub issue comments response is invalid");
  return comments.slice(0, limit).map((comment) => ({
    id: comment.id,
    body: String(comment.body ?? ""),
    html_url: comment.html_url,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    user: comment.user?.login ? { login: comment.user.login } : undefined,
  }));
}

exports.githubProjectBootstrapTools = {
  "github.create-repository": {
    description: "Create a private GitHub repository for a new ProjectOS project and optionally dispatch its initial build",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        name: { type: "string" },
        projectKey: { type: "string" },
        projectName: { type: "string" },
        intent: { type: "string" },
        description: { type: "string" },
        startBuild: { type: "boolean" },
        confirmation: { type: "string" },
      },
      required: ["owner", "name", "projectKey", "projectName", "confirmation"],
    },
  },
  "github.list-issue-comments": {
    description: "List bounded GitHub issue comments for live ProjectOS build progress",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issueNumber: { type: "number" },
        perPage: { type: "number" },
      },
      required: ["owner", "repo", "issueNumber"],
    },
  },
};

async function executeGitHubProjectBootstrapTool(tool, args, config) {
  switch (tool) {
    case "github.list-issue-comments":
      return listIssueComments(config, args.owner, args.repo, args.issueNumber, args.perPage);
    case "github.create-repository": {
      if (typeof config.registerRepository !== "function") {
        throw new Error("GitHub repository creation requires the Pandora durable repository registrar");
      }
      assertConfiguredOwner(config, args.owner);
      const sanitizedIntent = (0, project_bootstrap_js_1.sanitizeOwnerIntent)(args.intent);
      const repository = await createRepository(config, args.owner, args.name, args.description);
      let registration;
      try {
        registration = await config.registerRepository({
          stage: "created",
          owner: args.owner,
          repo: args.name,
          repositoryId: String(repository.id),
          repositoryUrl: repository.html_url,
          projectKey: args.projectKey,
          projectName: args.projectName,
          intent: sanitizedIntent,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown registration error";
        throw new Error(`PARTIAL_SIDE_EFFECT: GitHub repository ${repository.full_name} was created but ProjectOS registration failed: ${detail}. Reconcile provider state before retrying.`);
      }

      if (args.startBuild !== true || !sanitizedIntent) {
        return { repository, registration, builder: { status: "not_dispatched" } };
      }

      try {
        await ensureLabel(config, args.owner, args.name, "jules");
        const issue = await createBuilderIssue(config, args.owner, args.name, args.projectName, sanitizedIntent);
        try {
          const dispatched = await config.registerRepository({
            stage: "builder_dispatched",
            owner: args.owner,
            repo: args.name,
            repositoryId: String(repository.id),
            repositoryUrl: repository.html_url,
            projectKey: args.projectKey,
            projectName: args.projectName,
            intent: sanitizedIntent,
            builderIssueNumber: issue.number,
            builderIssueUrl: issue.html_url,
          });
          return {
            repository,
            registration: dispatched || registration,
            builder: { status: "dispatched", isssueNumber: issue.number, issueUrl: issue.html_url },
          };
        } catch (error) {
          return {
            repository,
            registration,
            builder: {
              status: "dispatched_registration_warning",
              issueNumber: issue.number,
              issueUrl: issue.html_url,
              warning: error instanceof Error ? error.message : "Builder task state could not be recorded",
            },
          };
        }
      } catch (error) {
        return {
          repository,
          registration,
          builder: {
            status: "dispatch_failed",
            warning: error instanceof Error ? error.message : "Builder dispatch failed",
          },
        };
      }
    }
    default:
      throw new Error(`Unknown GitHub project-bootstrap tool: ${tool}`);
  }
}
