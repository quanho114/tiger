# Menu navigation

Status: in progress

## Goal

Make the restaurant menu easier to browse on mobile: continuously grouped dishes, sticky category navigation, full-menu search and compact service context. Keep the existing paper, indigo and orange palette, typography and ordering contracts. No new dependency, category picker, advanced filters, theme or shared abstraction.

## Implementation

- [ ] Group service-eligible dishes in catalog category order; preserve unmatched dishes and show search matches across categories.
- [ ] Replace category filtering with section navigation and scroll-synchronized active state; reveal the active category horizontally without moving the page vertically.
- [ ] Compact the service context and retain table/address/cart actions, confirmation dialogs, favorites, truthful pricing, availability and existing recommendations.
- [ ] Refine mobile spacing, typography, touch targets and accessible labels using existing Tailwind tokens.
- [ ] Add behavior regressions and update existing browser assertions that describe the replaced filters.

## Verification

- Baseline: catalog unit tests passed, 3 files / 13 tests.
- Run focused menu navigation, pricing, mode and catalog tests, then typecheck, lint, full unit suite, offline Jev regressions and production build as required by CLAUDE.md.
- Review only this change; preserve unrelated work already present in the checkout. No commits or pushes.
- Runtime visual acceptance remains separate: sticky geometry, tap/scroll synchronization, touch scrolling and layout at 390px and desktop need an explicitly authorized browser run. Unit DOM assertions do not prove visual layout.
