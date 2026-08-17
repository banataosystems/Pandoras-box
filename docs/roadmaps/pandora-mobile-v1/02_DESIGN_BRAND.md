# 02 — Design System, Brand, Motion & Accessibility

## Visual direction

Pandora should be calm, premium, quiet, and highly legible.

Themes:
- **Porcelain** — light
- **Graphite** — dark

Use `ThemeMode.system`; remove forced dark mode.

Semantic colors:
- blue/violet: ordinary primary action
- green: verified success
- amber: attention
- red: destructive/critical
- identity red: reserved for separately approved ownership identity, not universal button color

## Typography

Use platform-native Flutter typography unless testing proves a better choice.

Hierarchy:
Display/page title · Section title · Card title · Body · Supporting body · Metadata · Technical/code.

Monospace only for hashes, code, IDs, payloads, diagnostics.

## Spacing and layout

Documented spacing scale:
`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`

Prefer whitespace and semantic grouping over nested card-on-card UI. Typical card padding: 16–24 logical pixels. Major sections: 24–32.

Respect edge-to-edge Android system bars, gesture areas, cutouts, safe areas, keyboard insets, and fold/large-screen constraints.

## Shape and elevation

Use restrained radii with hierarchy. Avoid making every object a large pill. Elevation is subtle and mostly tonal; shadows are rare and soft.

## Motion

Motion communicates state:
- list/detail transition
- refresh crossfade
- new Needs You emphasis
- plan creation confirmation
- approval result
- sheet transitions

Avoid looping ornament, particles, excessive scale bounce, glowing panels, or decorative 3D. Respect reduced-motion preferences.

## Haptics

Use sparingly for selection, success, warning, and destructive confirmation. Haptics never replace visible feedback.

## Product mark

Use the exact approved monochrome spiral apple from PR #12. Its black field and
white artwork are part of the approved source; identity red is not a product-mark
recolor instruction.

Required deterministic derivatives:
- Android adaptive launcher foreground/background
- splash mark
- sign-in mark
- small product/about mark
- Android monochrome notification mark only after a transparent derivative is approved
- web favicon/manifest derivatives if supported

For every derivative record source SHA-256, transform method/version, output dimensions, output SHA-256.

Do not silently redraw, recolor, crop, or reinterpret the approved source.

## Ownership mark

Pandora product mark is primary. Banatao Systems / Red Apple ownership is subordinate in About, legal, settings, and optionally restrained secondary splash credit.

## Accessibility release gates

Required:
- semantic labels
- logical screen-reader order
- dynamic text / large text
- no critical clipping
- color-independent status cues
- contrast review
- touch-target review
- reduced motion
- keyboard/focus behavior on web/large screen
- meaningful modal/sheet focus

Testing:
- Flutter semantics tests
- largest text-scale goldens
- TalkBack manual pass on owner’s Android device
- contrast audit
- touch-target audit

## Adaptive layout

Phone first.

Large screen:
- navigation rail
- list-detail Projects
- queue-detail Approvals
- filters + timeline/detail Activity
- two-column Owner Briefing where useful

Do not stretch phone cards to tablet width.

Landscape must preserve all critical flows without horizontal clipping.
