# Pandora Mobile

Canonical Flutter operator client for MCPMaster / Pandora.

## Runtime authority

- Source: `banataosystems/Pandoras-box`
- Owner/operator API: `https://mcpmaster.vercel.app/api/operator`
- Auth project: `https://jcyqixttuebxqqfkjonq.supabase.co`
- Pandora Memory: `https://pandorasbox-memory.vercel.app`

The app embeds only the public Supabase publishable key already present in the canonical server public configuration. It must never contain service-role keys, GitHub tokens, Vercel tokens, private KYC material, or any other server secret.

## Supported owner surfaces

`GET /home`, `/projects`, `/projects/:id`, `/connections`, `/approvals`, `/activity`, `/safety`, `/actions`; `POST /ask`, `/actions/:id/run`, `/approvals/:id/decide`.

Authentication uses the current Supabase user session JWT. Organization context uses the canonical organization ID by default and can be overridden with `--dart-define=PANDORA_ORGANIZATION_ID=...` for an authorized environment.

## Security behavior

The UI has no unauthenticated operational routes. It never weakens ProjectOS authorization. Approval decisions are submitted to the canonical backend and fail closed when the server requires stronger authentication or refuses the operation.

## Build

The repository CI creates disposable Android/Web platform scaffolding around this source and runs `flutter pub get`, `flutter analyze`, `flutter test`, `flutter build web --release`, and `flutter build apk --debug`.

A passing build is not production verification. Native authenticated journeys, API authorization behavior, deployment identity, and rollback proof remain separate release gates.
