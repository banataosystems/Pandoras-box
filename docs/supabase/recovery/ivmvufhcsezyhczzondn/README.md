# Inactive ivmv target-source evidence

These four files were removed from the shared active migration directory
because they belong to Supabase project `ivmvufhcsezyhczzondn`, not
`jcyqixttuebxqqfkjonq`.

They are evidence only. They do not form a complete ivmv migration stream:
the live target has additional migrations between these operations, and three
of the four source timestamps differ from the applied live identities. Do not
copy or apply this directory wholesale, repair migration history from it, or
infer deployment readiness.

Exact archived-to-live identity, byte-count, and SHA-256 mappings are recorded
in `migration-provenance-manifest.json`. The control-project segregation
record remains in
`../jcyqixttuebxqqfkjonq/migration-reconciliation-manifest.json`.

`inactive-source/remediation-candidates/` contains separately reviewed source
candidates only. The denial-audit repair there is not part of this incomplete
history and is not authorized for provider application.
