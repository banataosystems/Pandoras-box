---
name: designing-simple-and-pro-modes
description: "Designs one governed platform with a simple outcome-first experience and an optional professional control surface. Use when exposing plans, source, environments, costs, logs, approvals, or infrastructure."
---

# Designing Simple and Professional Modes

## Outcome

A product contract where non-technical users see outcomes and decisions while professionals can inspect and control exact technical evidence.

## Use when

- A feature risks exposing infrastructure complexity to normal users.
- Developer or enterprise controls must coexist with simple mode.
- A workflow needs progressive disclosure.

## Workflow

1. Define the primary outcome and minimum information a normal user needs.
2. Place source, branches, migrations, logs, model routing, and policy controls behind an explicit professional layer.
3. Keep the underlying plan, evidence, permissions, and audit model identical across modes.
4. Make risk, cost, changes, blockers, and next action visible in plain language.
5. Test that switching modes never bypasses governance.

## Proof required

- Simple-mode journey and professional-mode control map.
- Shared governance and data model.
- Usability evidence for both audiences.

## Stop conditions

- Simple mode hides a consequential risk or cost.
- Professional mode bypasses approvals or evidence gates.
- The experience forces normal users to operate infrastructure manually.

## Outputs

- `experience-mode-contract`
- `progressive-disclosure-map`
- `governance-parity-tests`
