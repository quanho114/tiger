# Tiger 345 reference-derived SVG kit

Prepared on 2026-10-21 from the user-supplied 2048 × 682 PNG,
`Ảnh ChatGPT 21_08_04 21 thg 10, 2026.png`.

Open `public/brand/tiger345/preview.html` directly, or visit
`/brand/tiger345/preview.html` on the local Tiger Vite server. The preview switches
between two explicitly labeled formats. Each has nine standalone SVG assets:
primary mark, simplified mark, light icon, dark icon, horizontal logo, stacked
logo, wordmark, tagline, and favicon.

## Source-exact SVGs

`public/brand/tiger345/source-exact/` contains lossless PNG crops embedded in SVG
`image` elements. Every crop retains the decoded source pixels and background.
`reference-sheet.svg` embeds the original PNG file bytes without modification.
The favicon places the simplified crop in a 144 × 144 white canvas at integer
coordinates `(0, 5)`.

These files preserve the source artwork at its native resolution. They are
**not editable vector paths**, do not gain detail when enlarged, and do not have
transparent exterior backgrounds. Browser resampling at other sizes can change
the rendered pixels. The source-exact variant is supplied because the requested
100% visual fidelity cannot honestly be promised for a reconstructed vector.

## Editable vector SVGs

`public/brand/tiger345/vector/` contains Bézier paths with no embedded images,
external resources, or font dependencies. Illustrations were traced from their
individual reference variants; typography was traced into solid silhouettes.
The large stacked logo preserves the source offsets. The horizontal vector is
recomposed from the larger mark and lettering for higher source detail, so its
composition differs slightly from the small horizontal reference.

The four palette values printed in the reference are `#1E3A8A`, `#F97316`,
`#4A7C59`, and `#FFF4E6`. The illustration traces also retain intermediate source
shades. Lettering uses the reference's declared navy and orange.

Vector conversion approximates source contours, shading, and small details.
These vectors are not pixel-identical to the PNG, and their detailed traces are
larger than a manually redrawn flat-color production logo. Review the vector tab
before selecting them for the website. `manifest.json` records source crop
coordinates, tracing settings, and format limitations.

## Integration

The site now uses the source-exact artwork to preserve the supplied reference:

- `public/tiger.svg` copies `source-exact/tiger-mark.svg`. Existing consumers in
  the header, footer, authentication, assistant avatars, and image fallbacks use
  the new mark through their existing URL.
- `public/favicon.svg` copies `source-exact/favicon.svg`; the document's favicon
  URL has a version query to refresh the browser's cached icon.
- Admin desktop/mobile navigation uses `source-exact/tiger-icon-dark.svg`.
  The admin login page uses `source-exact/tiger-icon-light.svg`.

These deployed SVG files embed PNG artwork; the editable vector alternatives
remain available in the kit. The ZIP includes both formats, the preview, this
guide, the manifest, and verification evidence. No paid image generation or
provider calls were used. Updating the assistant's avatar is visual branding
only and does not establish real-provider chatbot runtime acceptance.
