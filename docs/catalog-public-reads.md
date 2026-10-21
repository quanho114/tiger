# Public menu browsing with an invalid stored session

Verified locally on 2026-10-21 against the running Tiger frontend at both
`http://localhost:5173/menu` and `http://127.0.0.1:5173/menu`, using the actual
backend at `http://127.0.0.1:54321`.

## Cause and change

The API client attached the browser's stored session to every request. An invalid
stored token caused `/public-api/menu` and `/public-api/settings` to return
`401 AUTH_REQUIRED`, even though these reads are available to guests. The public
gateway correctly rejects a supplied invalid token; that guard remains unchanged.

Catalog reads now explicitly use `auth: 'none'`, skipping automatic session
attachment. Other requests retain the default session behavior. The change does
not clear sessions, modify carts, or retry authenticated mutations as guests.

## Verification

- Before the fix: a fresh browser context with a synthetic invalid stored session
  reproduced the reported error on both hostnames. Menu/settings requests carried
  authorization and received `401 AUTH_REQUIRED`.
- After the fix: the same scenario returned HTTP 200 for menu/settings, with no
  session token attached. The real backend supplied 98 menu items, the error panel
  disappeared, and the first meal cards were visible on the 390 × 844 viewport.
- No request interception, provider substitution, or menu fixtures replaced the
  real API during browser verification. The existing user's browser session and
  cart were not modified. Authenticated favorites can still reject the deliberately
  invalid test session; this does not prevent browsing the public menu.
- Four unit regressions exercise the real catalog and API-client implementations
  against controlled auth/fetch boundaries. The two catalog tests failed before
  implementation and passed afterward. Customer requests and public mutations
  still surface authentication failures instead of falling back to guest calls.
- Passed: `npm run typecheck`, `npm run typecheck:server`,
  `npm run check:architecture`, `npm run lint`, `npm run test:unit` (215 tests),
  `npm run test:server` (492 tests), and `npm run build`.
  Lint reports existing warnings outside this fix.

Sanitized HTTP results and before/after screenshots are retained locally in the
ignored `test-results/catalog-auth/` directory. No tokens or credentials appear
in those result files.
