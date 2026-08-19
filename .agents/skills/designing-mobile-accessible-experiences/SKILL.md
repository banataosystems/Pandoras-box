---
name: designing-mobile-accessible-experiences
description: "Designs and verifies premium mobile-first, accessible product journeys. Use for owner controls, customer apps, dashboards, forms, approvals, and any workflow expected to work from a smartphone."
---

# Designing Mobile-First Accessible Experiences

## Outcome

An understandable, touch-safe, responsive, accessible journey proven on relevant viewports and real-device paths.

## Use when

- A UI or workflow is created or changed.
- The owner must operate it from a smartphone.
- Visual or accessibility proof is part of acceptance.

## Workflow

1. Define the critical phone journey before desktop embellishment.
2. Use clear hierarchy, plain language, large touch targets, resilient loading/error states, and accessible semantics.
3. Avoid requiring terminal, desktop console, or copy-paste when connected actions exist.
4. Test keyboard, screen-reader semantics, contrast, dynamic text, reduced motion, orientation, and narrow viewports as applicable.
5. Capture exact-build visual and interaction evidence without exposing secrets or private data.

## Proof required

- Viewport and real-device test matrix.
- Accessibility checks and interaction results.
- Exact-source screenshots or recordings with privacy review.

## Stop conditions

- The critical journey works only on desktop.
- Evidence includes protected user data or credentials.
- Visual polish masks a broken outcome or authorization path.

## Outputs

- `mobile-journey`
- `accessibility-report`
- `visual-evidence-pack`
