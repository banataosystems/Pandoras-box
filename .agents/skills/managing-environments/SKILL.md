---
name: managing-environments
description: "Defines and verifies development, preview, staging, production, and isolated test environments. Use before provider testing, deployments, migrations, secret assignment, or release."
---

# Managing Environments

## Outcome

An environment matrix with exact resources, data classes, credentials, routing, protection, cost, and promotion boundaries.

## Use when

- A candidate needs preview or staging.
- Environment variables or databases may be shared.
- A provider READY status needs context.

## Workflow

1. Inventory exact provider team/account, project, branch, database, domain, environment target, and credential scopes.
2. Separate production-powerful secrets and customer data from untrusted preview code.
3. Define promotion, alias, migration, rollback, and teardown paths.
4. Read provider configuration back rather than inferring from names or URLs.
5. Record cost and require authorization before creating billable isolated resources.

## Proof required

- Environment matrix and exact identifiers.
- Secret/data-scope readback.
- Promotion and recovery boundaries.

## Stop conditions

- Preview privilege is unknown.
- Environment creation incurs unapproved cost.
- Staging and production cannot be distinguished at the provider.

## Outputs

- `environment-matrix`
- `provider-binding-evidence`
- `promotion-boundary`
