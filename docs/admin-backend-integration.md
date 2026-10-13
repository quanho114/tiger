# Admin backend integration

## Implemented

- Dashboard reads occupied visits separately from enabled tables, counts confirmed reservations for the Vietnam calendar day, and displays actual paid receipts. API errors no longer become invented bookings or sample invoices.
- `GET /invoices` returns paid orders, stored item snapshots, payment method, payment time and the recorded cashier. The UI loads the selected date range, filters records and downloads actual CSV contents.
- `GET /reports` aggregates the payment ledger. Received payments add revenue; refunds and corrections subtract it on the event date. Daily rows and totals share one database snapshot. Dates use Asia/Ho_Chi_Minh.
- `POST /orders` is authenticated admin order creation using the existing transactional `create_order` engine, live price/availability checks, open visits, delivery zones and opening hours. The UI retains the original request and idempotency key across uncertain responses and reloads. Admin creation is audited.
- Admin account list/create/lock/unlock uses Supabase Auth and `admin_profiles`. All admins have the same existing backend authority; the fictional owner/cashier role switch is removed. Self-lockout is rejected; account updates serialize and recheck the caller before writing. Changes are audited without passwords.
- Table payloads now expose the fields consumed by the UI. Closing uses the visit ID and visit version. Order details expose stored item prices/names and snapshots. Internal notes call the real note endpoint.
- Settings use the complete versioned handler instead of the duplicate handler that discarded most submitted fields. Hours and closures send the version parameter expected by the backend. Reservation mutations reload complete records instead of treating partial RPC receipts as complete reservations.
- Receipt previews read restaurant settings and actual payment state. Printing uses a separate document containing only the receipt. Sample address, phone, Wi-Fi details and automatic paid labels are removed.
- Authentication ignores stale initialization/profile responses after a newer session event or logout. Login does not redirect while its own profile verification is still pending.

## Verification

- `npm run test:unit`: 135 tests passed, including stale authentication response regressions.
- `npm run test:integration -- tests/integration/admin-real-data.test.ts`: 9 tests passed against isolated PostgreSQL. Covers actual invoice items, payment corrections, authorization, date boundaries, table/order payloads, versioned settings, and idempotent order creation.
- `npm run test:e2e:admin -- --workers=1 --reporter=line`: 8 tests passed across desktop Chromium and mobile Chromium. Uses real Vite, Supabase Auth, Edge HTTP and PostgreSQL; no request mocks.
- `npm run test:e2e:real -- --grep 'Real Admin (Login|Security)' --workers=1 --reporter=line`: 6 additional browser tests passed for login, disabled admin rejection and incorrect passwords on desktop/mobile.
- Browser scenarios: financial data and CSV download; Auth account creation and persisted lock/unlock; internal note, payment, completion, receipt preview and visit closure; creating a dine-in order through the admin form.
- Frontend/server TypeScript checks and production build passed. Lint completed with warnings, including existing warnings and effect-state warnings in admin loading flows.
- Database tests verify the disposable test isolation marker. Integration fixtures roll back; browser fixtures use unique IDs and scoped cleanup. No database reset or production writes.

## Deployment scope

These are local implementation and acceptance results. Deploy the admin Edge function before the frontend because the frontend requires the new endpoints. No production deployment was performed.

Invoices here are stored order payment receipts. The report measures recorded payments, refunds and corrections; it does not infer customer headcounts, staffing utilization or other measurements absent from the database. Physical printer output and live delivery administration still need operational acceptance; the new browser creation test covers dine-in.
