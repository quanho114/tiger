# Code organization

Tiger345 is a modular application with one React frontend and three Supabase HTTP
gateways. Modules follow restaurant capabilities, rather than technical folders
containing unrelated features. Deployments, database migrations, URLs, and wire
contracts remain independent of frontend file placement.

## Where code belongs

```text
src/
  main.tsx                  Browser entrypoint and global stylesheet
  app/
    App.tsx                 Routes, lazy loading, and screen composition
    providers.tsx           Provider initialization and nesting order
    layout/                 Site header and footer
  features/
    account/                Customer profile, addresses, history, and favorites
    admin/                  Staff capabilities, grouped by operational area
      orders/
        api.ts              Order list transport and query construction
        useAdminOrders.ts   Request lifecycle, refresh, and stale-response guard
        AdminOrdersPage.tsx Screen and URL filters
    auth/                   Identity and login flows
    cart/                   Cart types, reducer, persistence, provider, and UI
    catalog/                Menu data, menu screen, and display-model adapter
    concierge/              Assistant session and conversation UI
    ordering/
      checkout/             Checkout orchestration, forms, quotes, and receipts
      delivery/             Delivery quote and order lifecycle
      dine-in/              Table order lifecycle
      claims/               Guest order ownership claims
    reservations/           Booking API and booking screen
    restaurant/             Home, location, and public restaurant information
    table-session/          QR resolution and table visit state
  shared/
    ui/                     Business-independent UI primitives
    hooks/                  Business-independent browser behavior
    lib/                    API transport, Supabase client, and validation

supabase/
  functions/
    public-api/             Public and guest HTTP gateway and route handlers
    customer-api/           Authenticated customer gateway and handlers
    admin-api/              Staff HTTP gateway and route handlers
    _shared/
      contracts/            Portable schemas and transport types
      concierge/            Server-side assistant domain and integrations
      ...                   Shared server authorization and domain services
  migrations/               Ordered, immutable database changes

tests/                      Unit, server, integration, policy, and E2E suites
scripts/architecture/       Dependency boundary and cycle checks
docs/                       Current developer and operational documentation
plans/                      Implementation plans and historical reports
```

Develop and test Concierge directly in the main Tiger website. Keep assistant
business logic in `features/concierge` and configuration in the admin settings.
See `concierge-streaming.md` for the verified SSE transport, recovery, and UI
presentation boundaries.

## Dependency rules

- `app` composes features and shared code. Features never import `app`.
- `shared` never imports a feature or app component, including type imports.
  Shared infrastructure in `shared/lib` never imports shared UI or hooks.
- Features may collaborate explicitly. Prefer the owning feature's API, types,
  or hook; do not copy another feature's storage keys or domain rules.
- Cart consumers use `@/features/cart`; reducer, storage, and context modules
  remain internal. Cart internals import sibling files directly, not their own
  barrel. Screen components can be imported directly for route lazy loading;
  avoid adding every screen to a barrel that loads eagerly.
- Frontend code can import `@contracts`, never backend runtime modules. Contracts
  depend only on other contracts and Zod, so they work in both browser and server.
- HTTP handlers never import gateway `index.ts` files. Dependency types live in
  `context.ts`, so importing a handler cannot start an HTTP server.
- Runtime import cycles are rejected. Type-only dependencies are allowed when
  they respect the layer rules.

`npm run check:architecture` checks resolved imports, re-exports, literal dynamic
imports, and type imports. CI also runs `npm run test:architecture` to verify that
the checker detects invalid boundaries. TypeScript handles missing modules and
type compatibility. These checks complement code review; they cannot determine
whether every cross-feature business dependency is appropriate.

## Adding or changing a capability

1. Find its owner in `features`. Keep a small feature flat; introduce subfolders
   only when several files share a clear responsibility.
2. Put HTTP details in `api.ts`; keep request lifecycle and coordination in a
   feature hook when the screen has substantial behavior. Keep rendering and
   interactions in components. Avoid generic service/repository abstractions
   that merely forward a single call.
3. For backend routes, keep authentication, rate limiting, error translation,
   and dispatch in the gateway. Place endpoint work in the corresponding
   `*-handlers.ts`. Handlers return `null` when they do not match; preserve route
   ordering. Reusable domain operations belong in server domain modules, and
   atomic database invariants stay in SQL functions and migrations.
4. Add or update the test at the behavior's boundary. Pure frontend and component
   tests may live beside an existing feature test or in `tests/unit`; database
   and browser tests stay in their dedicated suites. Do not move working tests
   solely for cosmetic symmetry.
5. Run architecture checks, relevant tests, both TypeScript checks, lint, and
   the production build. Database integration tests require the disposable test
   environment; real-provider evaluations remain an explicit opt-in.

## Compatibility and remaining consolidation

`catalog/legacyMenuItem.ts` is an explicit adapter for existing display/cart
consumers. The catalog API model remains in `catalog/types.ts`; new transport
code should use it. Replace the adapter's consumers together when changing this
model, rather than creating a third menu type. Unused static sample menus were
removed from the adapter.

`ordering/checkout/useCheckout.ts` owns checkout state and coordination. The
drawer composes separate delivery/dine-in quote and receipt components plus the
delivery form. Browser focus trapping is isolated in `shared/hooks/useDrawerFocus`.

The production concierge has one runtime in
`supabase/functions/_shared/concierge/runtime.ts` and one public handler in
`supabase/functions/public-api/concierge-handlers.ts`. Retired chat components,
runtime modules, and their inactive tests have been removed. The admin content
handler still contains sizeable domain workflows.

`concierge-v2` is the HTTP protocol identifier for this one runtime. It lets
the gateway reject outdated clients; it does not select a second implementation.

Concierge uses one production session backend: Supabase PostgreSQL through
`session-store-postgres.ts`. The in-memory backend in `session-store.ts` is a
test fixture; no Redis service or configuration is required.

Admin-approved concierge knowledge is stored in `public.concierge_knowledge`.
`knowledge-repository.ts` loads a per-request snapshot over the initial seed and
persists admin edits with audit logs in one transaction. Serving, taste, and
allergen metadata for menu items is stored separately in
`public.menu_item_ai_profiles` and served through the Menu Domain
(`supabase/functions/_shared/concierge/menu/`); the hardcoded
`SERVING_PROFILES`/`ALLERGEN_PROFILES` in `knowledge.ts` are development
seeds only. The public read-tool
loop uses this snapshot for restaurant facts, serving sizes, and allergy checks.
Meal suggestions are priced from the current catalog and enter the draft only
after an explicit customer action.

Retired conversation, proposal, and event tables remain in historical database
migrations. No active route writes to them. Their existing data needs a separate
retention decision before the tables can be removed.

Historical paths under `plans/` describe the implementation at that time. Use
this document and the current source tree for new work.
