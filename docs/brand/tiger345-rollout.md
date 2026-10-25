# Tiger 345 icon rollout — 2026-10-21

The shared site mark and favicon now use the reference-preserving SVG variants.
These embed lossless PNG artwork; the path-only alternatives remain in the kit.
Admin sidebar branding uses the dark icon, and admin login uses the light icon.
The favicon URL is versioned to refresh cached browser icons. Existing shared
logo URLs continue to serve the new artwork, including customer authentication,
header/footer, assistant avatars, and dish image fallbacks.

## Environment and browser evidence

- Frontend checked: `http://127.0.0.1:5173`, running this workspace's Vite source.
- Backend destination: `http://127.0.0.1:54321`; backend code was not changed.
- Browser: actual headless Chrome, fresh isolated context, no request interception
  or substituted backend/provider. Existing developer sessions and carts were
  not used. The existing development test account was used for admin brand checks.
- Verified at 1440 px and 390 px: shared mark/favicons match the selected assets;
  customer header/footer, login, mobile menu, assistant empty state/contact card,
  admin login, expanded/collapsed desktop sidebar and mobile sidebar show the new
  icons. No browser exceptions occurred in the successful flow.
- Machine-readable evidence:
  `public/brand/tiger345/integration-verification.json`.
- Local visual evidence: `test-results/brand-rollout/` (ignored test artifacts).

## Automated checks

`npm run typecheck`, `npm run typecheck:server`, `npm run check:architecture`,
`npm run lint`, `npm run test:unit`, `npm run test:server`, and `npm run build`
passed. Unit/component tests: 211 tests across 35 files. Server tests: 492 tests
across 37 files. Lint still reports existing warnings outside this change.

No new behavioral tests were added for this visual asset replacement. Browser
checks exercised the actual integration and navigation with the existing app.

## Chatbot acceptance boundary

**Runtime chatbot: CHƯA KIỂM ĐỊNH.** Only avatar/contact-card rendering was checked;
no messages were submitted, no paid provider calls were authorized or performed,
and provider configuration/schema/runtime acceptance was not established. This
icon rollout makes no claim that chatbot responses work. Real-provider acceptance
remains pending explicit approval and confirmation of the intended test target
and its effective provider configuration. No order, payment, reservation, address,
cart handoff, or durable-memory operation was performed.
