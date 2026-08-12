# Supabase migration-history recovery evidence

Status: **DOCUMENTED / NON-ACTIVE RECOVERY ARTIFACT**

This directory preserves read-only reconciliation evidence for Supabase project `jcyqixttuebxqqfkjonq`. It is intentionally outside `supabase/migrations` and must not be interpreted as an executable migration stream or deployment approval.

## Contents

- `migration-reconciliation-manifest.json` records all 50 live migration identities, content hashes, provenance limits, version collisions, project-segregation findings, and release hard stops.
- `recorded-payloads/` contains 48 exact provider-recorded SQL payloads encoded as Base64. Base64 whitespace is insignificant; decoding each file reproduces the exact byte count and SHA-256 in the manifest.
- `recorded-sql/` contains 48 inactive replay previews. Each is the corresponding provider payload plus exactly one terminal LF added by the repository patch writer; its normalized hash is recorded separately in the manifest.
- `inactive-source/misstamped/` contains the four exact-content files removed from the active stream because their local timestamps do not equal the live migration identities.
- The two earliest live rows are not materialized because their recorded payloads are non-SQL provenance placeholders.

## Safety boundary

Do not copy these payloads wholesale into `supabase/migrations`, apply them to a provider, repair remote migration history, or infer that the pending AAL1 change is deployed. The historical chain has no recorded rollback or idempotency keys, one foundational source is only an unverified recovery candidate, and one foundational source remains missing.

Four wrong-timestamp files on the feature branch duplicate live SQL under different migration identities. Four additional FlutterFlow/OIDC files belong to the separately recorded `ivmvufhcsezyhczzondn` target overlay and are absent from this project's live history and schema. Both classes must remain out of this project's active repair stream.

For byte evidence, decode and hash `recorded-payloads/*.sql.b64`. Use `recorded-sql/*.sql` only for syntax checks and controlled empty-database replay. Neither directory is active.

The bounded credential-pattern scan found no high-confidence credential material in the 48 payloads. Normal repository secret scanning and all security/release gates remain required.
