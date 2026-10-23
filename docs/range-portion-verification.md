# Selected portion pricing — verification

Tested locally on 2026-10-22 (Asia/Ho_Chi_Minh).

- Frontend: http://localhost:5173/menu?mode=takeaway
- Backend: http://127.0.0.1:54321/functions/v1/public-api
- PostgreSQL: verified isolated local Tiger database on port 54322.
- Applied migration `20261022000001_range_portion_orders.sql` locally, with migration history recorded. No production deployment.
- Edge runtime mounts the current workspace functions. Actual HTTP `/order-quotes` returned 200, unit price 290000 and subtotal 580000 for two range portions. No HTTP order submission.
- Browser: chose 290000 and quantity 2, added to the cart, verified unit price 290000 and subtotal 580000. Removed the test item afterward. Screenshot: `portion-add.png` and `portion-cart.png` in this chat's visualization directory.
- Dedicated PostgreSQL integration test applies the migration and creates synthetic fixtures/orders inside a transaction, then rolls everything back. It checks missing/out-of-range/off-step prices, changed selected price against a signed quote, persisted unit/line prices, and a catalog change invalidating the quote.
- Server suite: 493 passed. Unit suite: 220 passed before the final additional cart persistence case; targeted final run recorded in chat.
- Architecture checks passed. Frontend/server TypeScript and production build passed. Lint exits successfully with existing warnings, including mixed component/function exports in PortionPicker.

## Separate failing suite

`npm run test:integration -- tests/integration/orders.test.ts` failed: 9 failed, 3 passed while the temporary range case was present. The expected hardcoded menu fixture IDs were absent (the temporary range case could not read its fixture, existing quote cases failed to receive a quote). The temporary case was removed from that suite and replaced by the self-contained range test. No assertions were weakened and no shared seed reset was performed. The existing order suite is not claimed passing.

## Behavior

The selected price is preserved separately in cart storage, quote normalization, signed quotes and idempotency hashes. Distinct portion selections use separate cart notes/lines. Both the quote endpoint and atomic order function validate against current catalog price bounds and the same 10000/5000 step (including the final maximum). Market/unknown prices remain excluded. Dine-in permits adding to a draft cart before selecting a table. Without an active table, the cart remains in dine-in mode and submission stays blocked until a real table session is established. A regression test verifies adding a range portion does not redirect to reservations or invent a table session.
