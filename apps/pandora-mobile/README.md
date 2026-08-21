# Pandora Mobile

Canonical Flutter owner and admin control center for MCPMaster / Pandora.

## Runtime authority

- Source: `banataosystems/Pandoras-box`
- Owner/operator API: the contract-proven Supabase `pandora-owner-api` Edge Function
- Auth project: `https://jcyqixttuebxqqfkjonq.supabase.co`
- Pandora Memory: `https://pandorasbox-memory.vercel.app`

The app embeds only the public Supabase publishable key already present in the canonical server public configuration. It must never contain service-role keys, GitHub tokens, Vercel tokens, private KYC material, or any other server secret.

## Supported owner surfaces

`GET /home`, `/projects`, `/projects/:id`, `/connections`, `/approvals`, `/activity`, `/safety`, `/actions`; `POST /ask`, `/actions/:id/run`, `/approvals/:id/decide`.

Authentication uses the current Supabase user session JWT. Organization context uses the canonical organization ID by default and can be overridden with `--dart-define=PANDORA_ORGANIZATION_ID=...` for an authorized environment.

## Security behavior

The UI has no unauthenticated operational routes. It never weakens ProjectOS authorization. Approval decisions use the wire values `approve` and `reject`, only record a decision, and never execute the protected change. Mutations are not automatically retried after an ambiguous network outcome. The Vercel operator route is not used as a fallback because it exposes a different contract.

The mobile integration workflow is read-only (`contents: read`) and cannot push source. Its literal private-key scan is owned by the app at `tool/check_private_key_literals.sh`; W5 does not modify the repository-wide recovery or ProjectOS security workflows. Formatter/evidence workflows for this lane must also remain read-only and must never commit or push source.

## Build

The repository CI uses pinned Flutter 3.47.0, creates disposable Android/Web platform scaffolding around the complete app package, verifies deterministic brand assets, formats, analyzes, tests, compares reviewed goldens, captures actual owner-screen evidence, checks Android package permissions, and creates release-mode Web plus debug Android artifacts.

A passing build is not production verification. Native authenticated journeys, API authorization behavior, deployment identity, independent exact-head review, and rollback proof remain separate release gates.
