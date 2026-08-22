# Pandora Windows Worker v1

Pandora Windows Worker v1 is a **verification-only compute worker** for owner-controlled Windows servers.

It is deliberately not a remote shell, deployment agent, GitHub writer, Supabase administrator, or production release mechanism.

## Trust boundary

Pandora / ProjectOS remains the control plane. The worker may:

- fetch one allowlisted repository;
- check out one exact 40-character Git SHA;
- run one built-in verification job class;
- capture redacted logs;
- hash artifacts and evidence;
- return a deterministic evidence manifest.

It may not:

- accept caller-provided shell commands;
- push, merge, deploy, release, or mutate production;
- write canonical Pandora Memory;
- hold provider admin credentials;
- satisfy its own independent-review gate.

## Built-in job classes

- `node_regression`
- `flutter_mobile_verify`
- `supabase_migration_replay`
- `pandora_skill_evals`

The command sequence for each class is source-controlled in `pandora-worker.mjs`.

## Requirements

- Windows Server or Windows 11
- Node.js 22+
- Git
- Flutter + Android SDK only for `flutter_mobile_verify`
- Python only for `pandora_skill_evals`

## Install

Run PowerShell as Administrator:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\workers\windows\install.ps1
. C:\ProgramData\PandoraWorker\worker.env.ps1
```

The installer places no provider credential on the server.

## Immediate local verification mode

Local mode is intended only for an owner/operator physically controlling the machine while broker enrollment is still inactive.

```powershell
node C:\ProgramData\PandoraWorker\pandora-worker.mjs local-run node_regression <EXACT_40_CHAR_SHA>
```

Evidence is written under:

`C:\ProgramData\PandoraWorker\evidence\<task-id>\result.json`

## Governed remote mode

Remote jobs must be signed with Pandora's Ed25519 control key and are rejected if the signature, repository, SHA, expiry, environment, mutation flag, job class, or runtime budget is invalid.

```powershell
node C:\ProgramData\PandoraWorker\pandora-worker.mjs run C:\path\to\signed-job.json
```

Remote transport/enrollment is intentionally a separate activation gate. Until that broker is production-verified, use local verification mode only.

## Evidence rule

A passing worker result means **tested on this worker for the exact source SHA**. It does not mean merged, deployed, production-verified, independently reviewed, or release-authorized.
