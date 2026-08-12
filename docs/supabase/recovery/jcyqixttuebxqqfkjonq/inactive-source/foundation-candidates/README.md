# Foundation recovery candidates

Status: **DOCUMENTED / INACTIVE / LIVE EQUIVALENCE UNVERIFIED**

`20260724010000_control_plane_foundation.sql` is an authentic executable candidate recovered from immutable canonical Git evidence. It is not an active migration and must not be presented as the exact SQL applied to the live project.

Provenance:

- canonical commit `cb811a30cc325567ce1ecbbc01cbf03a5715085c`
- path `recovery/mcpmaster-source.part-02`
- Git blob `dbc9b03511423e2eba4defe7b6d2fd051dab9cda`
- ZIP local-header offset `2129`
- embedded path `source/supabase/migrations/20260724010000_control_plane_foundation.sql`
- deflate payload `4548` bytes; decoded payload `27160` bytes
- CRC32 `90b2694f`, verified
- decoded SHA-256 `15733a9714e81fb0689438b8c92eec1490310c7476a45d5144902c09c9ec3fd5`
- decoded Git-blob SHA-1 `fe15cc45125984b388ec47d5a4c0bf5f0bed2b4c`

The complete local header, filename, compressed stream, and checksum are wholly contained inside that one immutable Git blob. The live migration row retained only the 64-byte provenance placeholder `applied verbatim from repository main in transaction-safe chunks`, so exact live equivalence cannot be proven from current evidence.

No executable source for `20260724030000_meta_remote_mcp_persistence` was found in canonical repository/provider evidence. Do not synthesize it. The remaining content-addressed external candidate is documented in the parent manifest and cannot be read from this conversation.

Do not copy, apply, replay, or repair migration history from this directory without an approved baseline design, isolated replay, exact schema comparison, rollback evidence, and governed provider authorization.
