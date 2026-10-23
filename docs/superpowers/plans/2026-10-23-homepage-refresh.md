# Homepage refresh implementation plan

**Goal:** Preserve the approved first screen and shorten the rest of the homepage to a food rail, atmosphere section, visit information, and compact footer.

**Architecture:** Keep content in the restaurant feature; use the current catalog, image adapter, and restaurant settings. Give the app footer an optional compact presentation for `/` only. No backend, cart, assistant, or hero changes.

**Design approved in chat:** Cream/navy/orange; manual horizontal dish rail on mobile, four columns on desktop; one wide photograph and short story; navy visit section with booking and directions. About two additional mobile viewports. Existing atmosphere photography is illustrative, so label it explicitly until restaurant photography is supplied.

**Constraints:** Work inline without subagents. Preserve existing work in the dirty checkout. No dependencies or live provider calls. Do not invent contact information, prices, hours, or restaurant photography.

## Tasks

- [x] Add focused UI checks for catalog price modes, settings-driven visit information, missing-data states, and the compact footer.
- [x] Replace the repeated sections in `src/features/restaurant/HomePage.tsx`; add scoped `HomePage.css`. Reuse `DishImage` and the catalog adapter for missing/broken dish images.
- [x] Add compact rendering to `src/app/layout/Footer.tsx`, selected by `PublicShell` in `src/app/App.tsx` for `/` only.
- [x] Run unit tests, architecture checks, frontend/server typechecks, lint, and build. Check the live local page at narrow/mobile/desktop widths, manual rail scrolling, links, errors, total page length, and unchanged hero.

## Review focus

- Fixed, range, market, and unknown prices must keep their actual meaning.
- Loading or failed catalog data must not leave an unexplained blank strip.
- Missing settings must not reintroduce old hardcoded business facts.
- The horizontal rail must not overflow the document or move automatically.
- All changes must be scoped away from the approved hero and other routes' footer.

## Verification and handoff

- Frontend: http://localhost:5173/, existing local backend and current catalog/settings; no request interception or provider calls.
- `npm run test:unit`: 40 files, 238 tests passed. Focused homepage tests: 4 passed again after the final footer spacing adjustment.
- `npm run check:architecture`: passed (264 source files).
- `npm run typecheck:server`: passed. Frontend TypeScript passed as part of `npm run build`; production build passed.
- `npm run lint`: exit 0, existing warnings elsewhere; none in the changed homepage/footer files.
- Browser: 320, 360, 390, 430, 768, 1440px widths; no document overflow or page exceptions. Keyboard focus reaches the final dish card. Menu and reservation links and back-to-top work. Directions uses the configured map URL, or the location page when absent.
- The hero source/styles were untouched during this refresh. At 390×844, hero height stays 780px; the new content plus footer takes approximately 1.65 more viewports.
- Existing illustration photograph retained with an explicit label. Restaurant photography remains a content replacement, not a claimed real image of Tiger.
- Screenshots: `/tmp/tiger-home-below-hero.png`, `/tmp/tiger-home-content-desktop.png`.

## Self-review

Accuracy 4/5: prices and contact data are verified, but atmosphere photography is still illustrative.
Completeness 4/5: approved layout and interactions are delivered; genuine restaurant photography was not available.
Clarity 4/5: hierarchy is reduced to three sections; the compact footer keeps a separate back-to-top row on mobile.
Actionability 5/5: changes are running locally with automated and browser checks completed.
Conciseness 4/5: removed over 400 lines of repeated homepage content; no new dependencies.
Overall: 4.2/5. The remaining improvement is to replace the labelled stock photograph with an approved real restaurant photo. No subagents used.
