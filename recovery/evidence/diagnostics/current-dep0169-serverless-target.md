# Current DEP0169 diagnostic target — serverless execution surface

This recovery-only evidence note supersedes **use of** `pr171-dep0169-trace.patch` as the current diagnostic target while preserving that content-addressed historical artifact unchanged.

## Current production authority

- Vercel deployment: `dpl_8ZyJBv7oR4gC4krdo2eYfj6DKVMX`
- Exact Git SHA: `6faf1dd25cb12f6ff20aa4f9500658c285d3025f`
- Branch: `main`
- Provider topology: 12 Node.js lambdas + 1 container
- Production container image: `sha256:10c93a3879dee1bc5dab40470924bfc1869ecea952fb22e93de3f0dabc9a48e3`

Provider runtime logs classify DEP0169-affected MCP/operator/OAuth/ProjectOS requests as `source=serverless`. The warning has been observed across nine serverless request paths, so a container-only `--trace-deprecation` change is not sufficient evidence for the current production warning.

## Build-boundary evidence

The exact production build has three distinct dependency surfaces:

1. full builder: 277 packages added / 280 audited / 10 findings;
2. production container: 130 packages added / 133 audited / 0 vulnerabilities;
3. separately compiled Vercel Node-function surface: 279 packages installed with no audit result in the provider build log.

The Vercel Node-function build also reports ESM-to-CommonJS compilation and explicitly names `pandora-memory-smoke.js` in that conversion. This is a build-boundary clue only; it is **not** causal attribution for DEP0169.

## Current governed trace acceptance

Do not modify routing or dependencies speculatively. A valid trace requires all of the following:

1. recover the authentic complete MCPMaster source archive with SHA-256 `dd7a4d1f982698bfe008f376809253011e8436598860bd86600c17e31538af83`;
2. build a safe non-production diagnostic from that exact source;
3. apply `--trace-deprecation` to the exact Vercel Node-function/shared-bootstrap execution surface serving a warning-affected route;
4. invoke an affected route and capture the deprecation stack without secrets;
5. identify the exact package/file/line and verify existing authorization/POS-SEC behavior remains unchanged;
6. do not promote the diagnostic build to production and preserve rollback provenance.

Positive POS-SEC AAL2 execution remains separately owner-authenticated and is not bypassed by this diagnostic plan.
