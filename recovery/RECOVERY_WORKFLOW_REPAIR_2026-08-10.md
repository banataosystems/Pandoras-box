# Canonical source recovery workflow repair — 2026-08-10

The canonical source recovery workflow previously attempted to push the recovered MCPMaster source directly to `main` from `github-actions[bot]`.

The repaired workflow now publishes each verified recovery run to a unique `recovery/canonical-source-restored-<run>-<attempt>` branch. The recovered source can then pass normal protected-branch review and merge gates before becoming canonical.

This changes recovery mechanics only. It does not alter MCPMaster runtime behavior, credentials, Supabase state, or Vercel production state.
