---
name: managing-secrets-and-config
description: "Manages credentials, environment variables, provider configuration, and workload identity safely. Use whenever systems need secrets, environment-specific settings, rotation, or access grants."
---

# Managing Secrets and Configuration

## Outcome

Least-privilege configuration with no secret exposure, explicit environment scope, rotation/rollback, and verified access boundaries.

## Use when

- A provider credential or service principal is introduced or changed.
- Environment configuration is missing or drifting.
- A preview or deployment may receive production-powerful secrets.

## Workflow

1. Inventory required capabilities without collecting credential values in chat or source.
2. Use approved Vault or platform secret storage and narrow service-principal grants.
3. Separate development, preview, staging, and production scopes.
4. Rotate atomically with preflight, post-readback, rollback retention, and no plaintext evidence.
5. Scan source, logs, screenshots, analytics, and Memory payloads for secret-shaped material.

## Proof required

- Secret-name and scope inventory without values.
- Provider access readback and wrong-scope denial.
- Rotation and rollback evidence.

## Stop conditions

- A secret value would need to be pasted into public or durable text.
- Environment scope cannot be determined.
- Rotation would destroy the only working credential without rollback.

## Outputs

- `configuration-contract`
- `least-privilege-grant`
- `rotation-evidence`
