# Table connection guidance — 2026-10-23

Latest user direction: customers who do not want to scan QR must be able to enter a table number. Implementing that flow is still pending; the user asked to commit/push the current work first and continue tomorrow. The QR-only guidance change below does not fulfill this clarified requirement.

The current public API resolves a QR token hash, then verifies the QR, table and open visit before issuing a visit capability. It does not resolve plain table numbers. The menu incorrectly invited users to enter a table number and submitted `2` as a QR token.

Changed only the menu guidance and client validation: the action now says “Quét QR bàn”, numeric-only input receives an explanation before any resolve request, errors are associated with the input and clear when edited. Existing backend authorization and QR resolution remain unchanged. Plain-number connection has not been implemented.

Regression tests first reproduced the old invalid-QR error for `2`, then passed after the fix. Tests also exercise the real table-session provider with a mocked transport response to verify URL token extraction and applying the authenticated table context. This is automated synthetic evidence, not a live QR-session acceptance test.

On the actual Tiger site at http://localhost:5173/menu, approximately 22:56 Asia/Ho_Chi_Minh, a separate browser tab showed the updated action and instructions. Submitting `2` showed the new field error, without connecting to a table or changing the existing cart. Screenshot: [qr-number-guidance.jpg](qr-number-guidance.jpg).

Verification results:

- Frontend typecheck: PASS.
- Server typecheck: PASS.
- Architecture check: PASS, 264 source files.
- Unit tests: PASS, 40 files / 240 tests.
- Lint: exit 0, 42 warnings across the working tree.
- Production build: PASS.
- git diff --check: PASS.
- No database, backend deployment, order or payment changes.

Self-evaluation: accuracy 4/5 (plain numbers are explicitly still unsupported); completeness 4/5 (misleading UI and invalid-token submission fixed, no new number-authentication flow); clarity 5/5 (the supported input and numeric error are explicit); actionability 4/5 (QR remains required); conciseness 4/5 (changes are confined to the existing component and tests). Average 4.2/5. A request to support plain table numbers would need a separate decision about table authorization.
