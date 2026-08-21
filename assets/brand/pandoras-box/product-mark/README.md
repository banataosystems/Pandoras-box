# Pandora's Box product mark

`2165-original.jpg` contains the exact owner-supplied artwork. Its attachment
name was `2165.png`, but the bytes are JPEG/JFIF. The repository extension
reflects the real encoding without re-encoding or modifying the artwork.

The `derived/` directory restores only the immutable, content-addressed PNG
objects first preserved at commit
`3e54c53f7189e3c8bf4f4129d271b3acfe1c5742`. That stale branch is not merged
wholesale. Each restored blob is tied to the approved master by the transform,
dimensions, Git blob, and SHA-256 recorded in `manifest.json`.

Run the content-addressed integrity verification from the repository root. It
does not require an image toolchain:

```sh
node scripts/verify-pandora-brand-assets.mjs
```

To recreate every derivative, normalize the historical PNG metadata, and
require exact byte equality, use
`node scripts/verify-pandora-brand-assets.mjs --reproduce` with the exact
ImageMagick version recorded in `manifest.json`. The optional `--write` mode
performs the same reproduction checks and restores only the known outputs after
all expected hashes pass.

The black field is part of the approved treatment. Do not redraw, recolor,
invert, trace, animate, remove the black field, or substitute a generic apple.
In-product rendering must use `contain` with the accessible label
`Pandora's Box`.

The checked Flutter UI copy is declared in `apps/pandora-mobile/pubspec.yaml`,
but Flutter rendering, native launcher wiring, favicon/manifest wiring, and
device verification remain separate proof gates. No transparent Android
notification mark is approved; silently creating one is prohibited.

See `docs/decisions/2026-08-10-pandoras-box-product-mark.md` and issue #11 for
the approved role, placements, proof gates, and rollback.
