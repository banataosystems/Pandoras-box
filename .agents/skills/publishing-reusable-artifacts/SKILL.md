---
name: publishing-reusable-artifacts
description: "Packages and publishes reusable skills, connectors, templates, agents, components, or APIs. Use only after provenance, security, licensing, documentation, compatibility, and customer utility are verified."
---

# Publishing Reusable Artifacts

## Outcome

A versioned artifact that others can safely discover, install, understand, update, and remove without exposing protected code, data, or secrets.

## Use when

- A reusable artifact is ready for internal or external distribution.
- A template or connector will cross project or tenant boundaries.
- Third-party consumption is proposed.

## Workflow

1. Verify source ownership, clean-room policy, licenses, dependencies, secrets, privacy, and customer-data exclusion.
2. Define semantic version, compatibility, permissions, configuration, costs, support, deprecation, and uninstall/rollback.
3. Run security, functional, interoperability, and adversarial evaluations.
4. Publish first to the narrowest authorized audience and capture adoption and failure evidence.
5. Preserve immutable versions and signed or content-addressed manifests.

## Proof required

- License and provenance review.
- Security/evaluation results.
- Versioned package and manifest.
- Authorized publication record.

## Stop conditions

- Protected competitor or customer material is included.
- Permissions, costs, or data flows are unclear.
- Public release lacks owner authorization.

## Outputs

- `reusable-artifact`
- `package-manifest`
- `publication-record`
