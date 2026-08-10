# Decision: Official Pandora's Box Product Mark

- **Decision ID:** `PB-BRAND-2026-08-10-01`
- **Product key:** `mcpmaster-pandoras-box`
- **Status:** Approved
- **Decision date:** 2026-08-10 (Asia/Manila)
- **Owner:** Mark Johnson Banatao
- **Source:** Direct owner instruction with supplied image attachment
- **Related issue:** #11

## Decision

The user-supplied monochrome spiral-apple artwork is the official Pandora's Box product mark for the FlutterFlow control center and related Pandora's Box product surfaces.

Use the exact approved artwork. Do not redraw, trace, regenerate, recolor, invert, distort, animate, or substitute it. In particular, do not turn the apple red or replace it with the separate Banatao Systems ownership mark.

## Source identity

- Original attachment filename: `2165.png`
- Repository provenance master: `assets/brand/pandoras-box/product-mark/2165-original.jpg`
- SHA-256: `d6f055b88b962b4dbae4ac67bc30f5e31b6c3a90997dfd5fddf9a0be23aa5970`
- Byte size: 98,032
- Canvas: 1536 × 1536
- Actual encoding: JPEG/JFIF despite the uploaded `.png` filename
- Color: grayscale, fully opaque
- Background: black field
- Approximate meaningful artwork bounds: 731 × 891 at source offset +386+268

The renamed repository master preserves the original bytes while aligning the filename with its actual encoding. The original attachment name remains recorded for provenance.

## Product and ownership roles

This artwork is the primary Pandora's Box product mark. Any separate Banatao Systems or Red Apple ownership treatment remains subordinate, must use its own canon-approved asset, and must not replace this product mark.

## Application rules

- Preserve the black field in light and dark themes.
- Use `contain`, never `cover`.
- Never clip the leaf, stem, outer apple silhouette, or spiral.
- Do not use the detailed mark as a 20–24 px navigation glyph.
- Use it intentionally in the navigation identity, mobile app bar, sign-in/reconnect, splash, favicon/PWA, launcher, and About surfaces.
- Generate only deterministic crops and size derivatives from the provenance master.
- Do not remove the black field or create transparent, inverted, recolored, simplified, or vector alternatives without a later owner-approved decision.

## Consequences

The current production control tower still references a historical Red Apple favicon. That is evidence of the presently deployed state, not approval to keep the old mark as the Pandora's Box product identity. Source integration, FlutterFlow integration, rendered verification, merge, deployment, and production verification remain separate future gates.

## Acceptance evidence

- Source and derivative checksums.
- Phone and desktop rendered screenshots.
- Favicon, pinned icon, manifest, PWA, and launcher inspection.
- Smallest-size recognition and safe-area check.
- Light/dark contrast check.
- Confirmation that no fallback, placeholder, recolored, or regenerated logo renders.

## Rollback

Remove only the new display references and restore the preceding product identity. Preserve this decision, source asset, checksum, and supersession history as recovery evidence.

