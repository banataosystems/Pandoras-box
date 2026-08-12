import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);

const expectedTargets = {
  "mcpmaster-supabase-control": {
    projectRef: "jcyqixttuebxqqfkjonq",
    verifyJwt: false,
  },
  "pandora-owner-api": {
    projectRef: "jcyqixttuebxqqfkjonq",
    verifyJwt: true,
  },
  "flutterflow-credential-handoff": {
    projectRef: "ivmvufhcsezyhczzondn",
    verifyJwt: true,
  },
  "flutterflow-github-oidc-broker": {
    projectRef: "ivmvufhcsezyhczzondn",
    verifyJwt: false,
  },
};

test("every Supabase function records its exact canonical project and JWT boundary", () => {
  const targets = JSON.parse(
    readFileSync(new URL("supabase/TARGETS.json", root), "utf8"),
  );
  const directories = readdirSync(new URL("supabase/functions/", root), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const declared = Object.keys(targets.functions).sort();

  assert.equal(targets.bulkDeployAllowed, false);
  assert.deepEqual(declared, directories);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries<any>(targets.functions).map(([slug, target]) => [
        slug,
        { projectRef: target.projectRef, verifyJwt: target.verifyJwt },
      ]),
    ),
    expectedTargets,
  );
  for (const [slug, target] of Object.entries<any>(targets.functions)) {
    assert.match(slug, /^[a-z0-9-]+$/);
    assert.match(target.projectRef, /^[a-z]{20}$/);
    assert.equal(typeof target.verifyJwt, "boolean");
  }

  const config = readFileSync(new URL("supabase/config.toml", root), "utf8");
  assert.doesNotMatch(config, /^project_id\s*=/m);
  for (const [slug, target] of Object.entries<any>(targets.functions)) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const section = config.match(
      new RegExp(`\\[functions\\.${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
    );
    assert.ok(section, `config.toml has no function section for ${slug}`);
    assert.match(
      section[1],
      new RegExp(`verify_jwt\\s*=\\s*${target.verifyJwt}`),
    );
  }
});

test("repository automation has no implicit Supabase bulk deployment or history repair", () => {
  const workflowRoot = new URL(".github/workflows/", root);
  for (const entry of readdirSync(workflowRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    const workflow = readFileSync(new URL(entry.name, workflowRoot), "utf8");
    assert.doesNotMatch(
      workflow,
      /\bsupabase\s+functions\s+deploy(?:\s*(?:\\\r?\n\s*)?(?:--|$))/m,
      `${entry.name} contains an implicit bulk function deployment`,
    );
    assert.doesNotMatch(
      workflow,
      /\bsupabase\s+(?:db\s+push|migration\s+repair)\b/,
      `${entry.name} contains an unauthorized migration-history mutation`,
    );
  }
});
