---
name: pandora-ui-ux
description: "Design and review interfaces — information architecture, interaction design, responsive layout, accessibility, design systems, onboarding, and the empty/loading/error states. Load when building or reviewing UI, when a screen needs designing, when accessibility is in question, or when an interface exposes technical complexity users should not have to understand. Aims at premium quality that hides infrastructure."
---

# Pandora UI/UX

Pandora's promise is *intent → working result*. The interface is where that promise is kept or broken. A user should never need to understand deployments, migrations, proof gates, or provider state to get what they came for.

## Hide the machinery

Surface **outcomes**, not infrastructure. "Your booking page is live" — not "deployment dpl_x is READY, bound to SHA abc123".

The technical state still exists and still matters; it belongs in an operator or evidence view, available on demand, never in the default path. When something goes wrong, the user gets what happened and what to do — not a stack trace or a provider error code.

The exception is the operator surface: someone running the platform needs exact SHAs and IDs. Design those views for precision, and keep them separate from user-facing ones.

## The states people skip

Every view that loads data has four states, and three of them are routinely unbuilt:

**Empty** — first-run and no-results are different. First-run teaches what this is and offers the first action. No-results says nothing matched and offers a way back. A blank panel is a bug.

**Loading** — show structure (skeletons) rather than a spinner where the layout is predictable; it reduces perceived wait and prevents layout shift. Optimistic updates where the action almost always succeeds and can be reversed cleanly.

**Error** — say what happened, whether it was the user's doing, and what to do next. Preserve their input; losing a filled form to a failed submit is the most avoidable frustration in software. Offer retry where retry is safe.

**Partial** — some data loaded, some failed. Show what you have, mark what is missing. Failing the whole view because one widget's data is unavailable is a design choice, and usually the wrong one.

## Information architecture

Structure by the user's task, not by the system's data model. The most common thing gets the shortest path. Navigation should let someone answer "where am I, what can I do, how do I get back" without thinking.

Progressive disclosure: essentials first, advanced behind an affordance. Do not make an interface feel simple by hiding things people need; make it simple by ordering things by frequency.

## Responsive, mobile-first

Design the small viewport first. Verify at real device widths — content reflows rather than scrolling horizontally, touch targets are 44–48px with adequate spacing, the keyboard-open state keeps the active field visible, and wide content (tables, code, diagrams) scrolls inside its own container rather than pushing the page sideways.

## Accessibility

Not optional, and mostly cheap when done from the start:

Semantic HTML — real buttons, real headings in order, real labels tied to inputs. Keyboard operability for everything, with a visible focus indicator. Contrast at 4.5:1 for body text and 3:1 for large text and UI boundaries. Never color as the sole carrier of meaning. Alt text that conveys purpose, empty alt for decoration. Respect `prefers-reduced-motion`. Announce dynamic changes to assistive technology.

Test with a keyboard alone, and check contrast with a tool rather than by eye.

## Design systems

Tokens for color, spacing, type, radius, and shadow — defined once and referenced everywhere. Components own their variants and states, including disabled, loading, and error.

Support light and dark deliberately: define the full palette as tokens, and give every surface an explicit background rather than relying on inheritance.

Consistency is a feature. An interface where similar things look and behave similarly is one users can predict.

## Onboarding

The first run should produce a real outcome quickly. Ask for the minimum needed to get there, defer the rest, and show progress toward something that matters rather than a tour of features.

## Visual QA

Check: alignment on a consistent grid · consistent spacing from the scale · type hierarchy that survives long real content · no layout shift as content loads · long strings, long names, and missing images handled · both themes · all four data states.

Real content, not lorem ipsum. Most layout defects appear only with real names, real lengths, and real edge cases.

## Output

```
SCOPE         <what was designed or reviewed>
IA            <structure and why>
STATES        empty · loading · error · partial — <handled?>
RESPONSIVE    <viewports verified>
ACCESSIBILITY <keyboard, contrast, semantics, motion — with results>
SYSTEM        <tokens and components used or added>
FINDINGS      <issues, by severity>
```

## Handoff

Mobile specifics → `pandora-mobile-flutter`. Rendering performance → `pandora-performance`.
Implementation → `pandora-implementation`.
