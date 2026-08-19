---
name: designing-data-and-authorization
description: "Designs schemas, tenancy, identity, authorization, privacy boundaries, and database invariants. Use before migrations, authenticated workflows, customer data storage, or multi-tenant features."
---

# Designing Data and Authorization

## Outcome

A least-privilege data model with explicit ownership, RLS or equivalent controls, auditability, migrations, and negative authorization tests.

## Use when

- A feature stores or changes data.
- Auth, roles, organizations, or tenant boundaries are introduced.
- A database migration or provider contract is planned.

## Workflow

1. Classify data, owners, retention, sensitivity, and legal basis.
2. Define tenant keys, identities, roles, capabilities, object-level authorization, and service-principal boundaries.
3. Prefer database-enforced invariants and deny-by-default policies.
4. Design deterministic migrations, replay, rollback or forward recovery, and source/provider parity checks.
5. Specify positive and negative authorization tests including cross-tenant denial.

## Proof required

- Schema and authorization matrix.
- Migration and recovery contract.
- RLS/policy/function inventory and negative-test plan.

## Stop conditions

- Tenant isolation cannot be proven.
- A privileged helper is callable without an independent authorization gate.
- Sensitive data lacks a retention or access policy.

## Outputs

- `data-model`
- `authorization-matrix`
- `migration-contract`
- `negative-tests`
