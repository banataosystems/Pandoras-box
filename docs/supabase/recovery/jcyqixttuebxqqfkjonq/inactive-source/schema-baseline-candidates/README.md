# Inactive schema-baseline candidates

These files recover the two non-replayable foundation identities in the live
`supabase_migrations.schema_migrations` ledger for project
`jcyqixttuebxqqfkjonq`. They are evidence and review candidates, not active
migrations.

## Evidence classification

- `20260724010000_control_plane_foundation.recovered.sql` is an executable
  source candidate extracted from recovery container
  `recovery/mcpmaster-source.part-02` at commit
  `cb811a30cc325567ce1ecbbc01cbf03a5715085c` (container blob
  `dbc9b03511423e2eba4defe7b6d2fd051dab9cda`). That blob is the archive part,
  not the direct SQL blob. The candidate preserves the recovered archive
  member exactly; byte and schema equivalence to the live applied migration
  remain unproven.
- `20260724030000_meta_remote_mcp_persistence.reconstructed.sql` is a
  schema-only reconstruction from the live PostgreSQL catalog and canonical
  application consumers. The original migration bytes are unavailable, so
  this file must never be described as an original or byte-equivalent source.
  Its resulting `webhook_events` uniqueness constraint is catalog-proven; the
  old auto-generated constraint name used in the drop statement is inferred
  from the recovered first foundation.
- `schema-baseline-manifest.json` binds both candidates to hashes, live ledger
  markers, catalog objects, and the remaining validation gates.

The live catalog inspection was read-only. At capture time, `meta_drafts`,
`meta_webhook_health`, and `webhook_events` each contained zero rows. No
production schema, data, credential, deployment, or network configuration was
changed.

## Historical offline replay attestation

The reconstruction work reported a successful replay on PostgreSQL 18.3 via
PGlite 0.5.4 with only Supabase's auth roles/schema and `pgcrypto` supplied. It
also reported that the resulting Meta table column counts, indexes, policies,
RLS flags, ACLs, and function properties matched the captured live contract,
including these PostgreSQL-normalized function hashes:

- `claim_meta_webhook_delivery`:
  `b6ac6f8de7d9dc73b5710eed0e8a795148d23c422b7ba44ff780e30358f171a0`
- `record_meta_webhook_health`:
  `8819fcb068647307172b91717561279e559bf953e7ea2653f5feaf878a5d4444`

The reconstruction work further reported an extension-stubbed portability run
that applied all 48 exact later SQL previews preserved at PR #8 head
`f73c477d6eb2e287c59c895bc1c5017ab4b17980`, followed by AAL1 candidate
`20260812034825`.

This branch does not commit the replay runner, a machine-readable catalog diff,
or replay result logs. The statements above are therefore historical
attestations, not reproducible proof supplied by this candidate. Even after
reproduction, the stubbed full-chain run would show only SQL ordering and
dependency closure, not Supabase-provider equivalence: `http`, Vault,
`pg_net`, `pg_cron`, and auth runtime behavior used non-networking test stubs.

The historical chain also assumes data that is not created by the migration
stream. The files under `replay-fixtures/` make those prerequisites explicit:
an owner/organization after the foundations and an FXPass product-registry row
after migration `20260731122011`.

## Promotion gates

Keep both SQL files outside `supabase/migrations` until all of the following
are true:

1. Repeat the full ordered replay on a new isolated no-production Supabase
   database with real provider extensions, using the explicit test fixtures.
2. Diff tables, types, columns, defaults, constraints, indexes, functions,
   triggers, RLS policies, ACLs, extensions, and ownership against the live
   catalog contract.
3. Pass the pgTAP approval suite and rollback matrix without credential
   literals or production traffic.
4. Obtain review from a qualified reviewer from a different vendor.
5. Record exact replay artifacts and hashes in the durable Pandora task before
   any separately authorized release action.

The candidate is intentionally not idempotent: it models the historical
ordering after the recovered control-plane foundation and should fail if
applied against an unexpected schema.

Current catalog state cannot prove that the live function bodies were never
changed out of band. It also cannot recover original formatting, transaction
boundaries, statement order, or historical grant wording where later
migrations changed effective ACLs.
