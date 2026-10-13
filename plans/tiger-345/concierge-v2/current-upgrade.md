# Tiger Concierge: current system upgrade

Status: implementation in progress, 2026-09-23. This upgrades the existing concierge runtime and concierge-v2 protocol, not a second guest or account bot. Deployment and paid model evaluation have not run.

Implemented in the current runtime: model-authored greetings and short replies, page and viewed-item context, typed food/meal/service cards, multi-turn party and budget state, a bounded read-tool loop, live SSE activity and guarded provider text for simple conversation, on-demand authenticated recent-order and saved-address reads, and a one-time guest-session claim with capability rotation. The browser stores only a five-minute claim ticket for redirects; it stores neither the session capability nor transcript. The current separate-origin API cannot issue a reliable first-party HttpOnly cookie, so the cookie design below remains a transport upgrade. The PostgreSQL claim migration and isolated database integration test must pass before release.

Remaining work: text streaming for tool-grounded answers, guaranteed reservation confirmation, detailed order/reorder preview and checkout address handoff, optional saved history, browser accessibility review, and live model evaluation with explicit cost approval. Booking capacity is now configurable per table; slots are still requests pending restaurant confirmation.

Current booking limit: migration `20260924000002_reservation_table_capacity.sql` adds optional capacity and atomic assignment for newly submitted requests. Existing unassigned bookings, unconfigured tables, and open visits produce an unverified result; the agent never promises a confirmed booking. Deploy this migration before the updated Edge functions and enter real capacities in Admin > Tables. Account tools currently return only the requesting user's recent order summaries or saved address cards; reorder and checkout still use the existing account/cart flows. Takeaway orders show their true type, but the account reorder control remains unavailable for that type until its preview/cart path supports it.

## 1. Product contract

Tiger Concierge is a restaurant assistant that helps a guest understand the menu, choose a meal, and complete an explicit cart or reservation flow. Guest access is first class. Authentication adds authorized customer context and convenience; it is never required to ask about food or book a table.

- The LLM interprets ordinary language, chooses read tools, asks useful follow-up questions, and composes the response. Greetings, identity questions, and restaurant questions pass through the same model path as food requests. A provider outage produces an honest error state.
- Restaurant APIs and approved knowledge are the source of truth for menu items, prices, stock, allergens, delivery terms, booking availability, customer records, and transaction outcomes. The model cannot assert those facts without evidence.
- The model may propose an action; the server decides whether it is available, binds it to the session and current state, and requires the customer's explicit confirmation for cart, booking, and order changes. Payment and order submission remain in existing checkout services.
- UI renders a versioned set of typed components. The model never returns HTML or a raw cart/booking write.
- Personal memory is used when it helps a user request, not in unsolicited opening copy. Guest conversation state is temporary. Authenticated preference memory and saved chat history are separate user controls.

## 2. Evidence from the current code

| Priority | Area | Current behavior | Upgrade |
| --- | --- | --- | --- |
| High | Agent | `orchestrator.ts` calls the model for tool routing but assigns `result.message` from server branches; `context.ts` asks the model to return tools only. `turn-intent.ts` answers some language without the model. | Replace the response path with model-authored, evidence-bound output. Keep deterministic policy and validation. |
| High | Identity | `useConcierge.ts` clears the conversation on auth identity changes; V2 explicitly disallows guest-to-account transfer. | Add a one-time session claim with capability rotation. Preserve only the active ephemeral conversation by default. |
| High | Context | `ConciergeV2TurnRequestSchema` has a message/action but no page or viewed-item context; `useConcierge.ts` sends only the text and session reference. | Add a small allowlisted page/context snapshot and server validation. |
| High | Response contract | `ConciergeV2CompletionPayloadSchema` accepts cards as `z.unknown()`, while the frontend assumes a small set of card shapes. | Define a shared discriminated component/action schema and reject unsupported output. |
| Medium | Booking | `reservations-handlers.ts` exposes booking creation, but no separate read-only availability endpoint. | Build availability/expiry semantics before showing a live slot card. |
| Medium | Streaming | `concierge-handlers.ts` can send SSE, but emits only a final `complete` event. | Add real status, validated content, component, and completion events. |
| Medium | UI | `ContactHub.tsx` uses a fixed 420px desktop chat and a mobile floating dialog. `ConciergeChatView.tsx` renders assistant bubble text and a few card types. | Redesign the surface and component registry around the UX states below. |
| Reuse | Services | PostgreSQL session/CAS, menu retrieval, allergen checks, priced meal plans, draft/cart handoff, order quotes, customer orders/addresses/favorites, and memory controls already exist. | Adapt these services behind new tool contracts instead of duplicating restaurant logic. |

The previous V2 plan and reports document historical constraints. In particular, its login-reset rule is intentionally superseded only after the session claim protocol and privacy tests pass. Existing migrations stay immutable.

## 3. UX architecture to approve first

Represent four independent dimensions instead of one giant chat state: `surface` (closed, normal, expanded, mobile full screen), `turn` (idle, working, streaming, awaiting confirmation, error), `task` (discovery, meal, draft, reservation, checkout handoff), and `identity` (guest, claiming, authenticated). The backend owns task and mutation state; the frontend owns presentation state.

| Screen/state | What the guest sees | Primary transition |
| --- | --- | --- |
| Collapsed | 52-56px Tiger button with accessible label; no fake online status. | Open concierge. |
| Welcome | Small header, short context-aware model opening, up to three capability shortcuts, spacious composer. No menu cards until requested. | Send free text or a shortcut as a normal user intent. |
| Conversation | User text in a light bubble; assistant text on the canvas; cards only when they help decide. | Ask, clarify, or choose a contextual action. |
| Working | One live status such as checking menu or prices, then a compact completion summary. No chain of thought or ornamental delay. | Stream validated answer/components. |
| Recommendation | One focused food collection or one meal plan with item imagery, role, current price, total, caveats, and next actions. | Adjust constraints or select items/set. |
| Draft/cart | Compact draft summary; editable quantities and notes; exact subtotal; review before handoff. | Confirm draft transfer to existing cart, then use normal checkout. |
| Reservation | Extracted date/time/party size, available slot timestamp and expiry, contact form or account prefill. | Explicit booking confirmation; show receipt only after service success. |
| Identity transition | Existing chat remains visible while the user signs in or enters guest contact details. | One-time claim/rotation after login; never silently promote preferences to durable memory. |
| Authenticated | Same conversation surface; customer tools become available on demand. | Lookup prior order/address only when the request requires it. |
| Error/recovery | Clear distinction between model, menu, session, booking, and checkout errors; retry action where safe. | Retry with the same request ID or continue manually. |
| Mobile | Full-screen sheet, safe-area-aware sticky composer, horizontal food cards, focused confirmation sheets. | Return focus to the launcher on close. |

Desktop normal width: 440-480px. User-controlled expanded width: 620-720px. Never auto-expand without consent. Header stays compact in Tiger blue/off-white; orange is a restrained action accent. Motion conveys actual work and respects reduced-motion settings. No nested card stacks, neon, or purple gradients. The composer placeholder reflects verified mode (`browsing`, `dine_in`, `delivery`) and current task.

Opening context is advisory, not a claim about the user: menu page, selected item, cart count and verified mode may shape the opening. Do not greet with prior orders, name, addresses, or inferred preferences. On a route change, update context for the next turn; avoid interrupting the customer with an unsolicited message.

The initial component registry is `Text`, `FoodCard`, `FoodCollection`, `ComboRecommendation`, `CartSummary`, `ReservationCard`, `OrderStatus`, and `Confirmation`. Each non-text component takes server-verified IDs/data, a bounded item count, and only actions valid for the current task. `OrderStatus` can render only after the authenticated order tool exists in Phase 4; `ReservationCard` requires the Phase 3 availability source. The first food card should show image, name, role, current price, a one-sentence reason, and a single clear action.

### Example journeys for the UX prototype

1. Guest opens menu -> asks for dinner for four under 800k -> sees a priced plan -> asks for less spice -> selects the plan -> reviews the draft -> hands it to the existing cart.
2. Guest scans a valid table QR -> asks about a displayed dish with "cay khong?" -> gets verified details for that item -> selects food in dine-in mode; the table capability never enters model context.
3. Guest asks for tomorrow at 19:00 for four -> sees a recently checked slot -> enters contact or signs in -> confirms -> sees a receipt only after the booking service succeeds.
4. Guest begins a draft, signs in during the same browser journey -> returns to the same ephemeral chat/draft with a rotated capability -> asks for last week's order -> receives an authorized order card and an explicit reorder action.
5. Model/menu/booking service fails at each step -> the UI states what cannot be verified, retains valid draft state, and offers a safe retry or manual path.

## 4. Target agent design

```
UI context + user turn
        -> server validates context and session/actor
        -> LLM chooses answer or typed read tools
        -> server executes authorized tools with limits
        -> LLM observes verified results and composes typed response
        -> server validates evidence, component IDs, actions and state version
        -> UI streams safe text and renders components
        -> explicit user action -> server revalidates -> existing domain service
```

Use one bounded agent loop. Keep tool arguments and outputs schema-checked, authorized, timed out, idempotent where needed, and tagged with evidence IDs. A requested item ID must be looked up server-side. The server code-gates operational claims: if the model skips a required data lookup, the server performs the read or returns an explicit cannot-verify result before response composition. Model output references approved IDs; the server fills prices, availability, totals, dates, and action tokens from authoritative results. Free-form operational claims need evidence references and a conservative fallback when verification fails. Citation presence alone does not prove a claim true, so adversarial and live quality evaluation remain necessary.

The context builder receives identity rules, current session facts, relevant history, a compact authorized restaurant snapshot, and only tools available to this actor/task. Do not pass the full menu, address book, raw auth tokens, table visit capability, or irrelevant order history. Corrections in the current turn override older session and preference facts. Model/tool output cannot be promoted to durable memory without a separate user-authorized admission rule.

Initial read tools: `search_menu`, `get_item_details`, `get_restaurant_info`, `recommend_meal`, `get_draft`, `get_cart_summary`, `check_booking_availability`. `get_cart_summary` uses a server-revalidated item/quantity snapshot; browser-supplied prices are never trusted. `check_booking_availability` is enabled only after its read API exists in Phase 3. Add `get_order_history`, `get_order_detail`, `get_saved_addresses`, and `get_preferences` for authenticated requests later. Reuse existing menu, quote, customer, and reservation services; do not expose their database functions directly as model tools. Loyalty tools wait for a real loyalty source.

Write operations are server-owned proposals: `add/update/remove draft item`, `apply draft to cart`, `create reservation`, and later `reorder`. Each proposal has a stable ID, exact parameters, expiry, actor/session binding, current state version, idempotency key, and confirmation policy. The UI sends the proposal ID after a customer action; the server rechecks price, safety, availability, and ownership before committing. The LLM never decides whether a write succeeded.

## 5. Contracts and identity transition

Extend `concierge-v2` on the current public handler with additive request and response fields. Keep one runtime and one feature flag; do not create separate guest/account agents. Reject unsupported client behavior explicitly when a breaking change is unavoidable.

- Request: `request_id`, session reference, state version, an `open`/`message`/`action` event, and an allowlisted `page_context` (`home`, `menu`, `menu_item`, `cart`, `reservation`, `order`, `account`, `other`; optional item ID). Include coarse `mode_hint` and cart item IDs/quantities only when useful. Derive auth from the verified token. Treat browser-supplied page/cart data as hints until checked against server sources. The current router has no `/menu/:id` page, so Phase 1 must add a stable item route or a selected-item context source before claiming item-level awareness.
- Response: one versioned envelope with text blocks, typed components, contextual actions, activity summary, authoritative state version, warnings, and optional pending confirmation. Component schemas are discriminated unions; cap item/card counts. UI labels may be model-proposed, but their underlying action must be allowlisted and server-bound.
- Stream: `status`, `content_delta`, `component`, `confirmation_required`, `complete`, `error`. Never stream unverified menu prices or booking claims. Buffer fact-bearing model output until its evidence and schema pass; send validated sections as available, without artificial delays.
- Guest-to-login: before a redirect or inline login, the server issues a short-lived, single-use claim ticket in a same-site HttpOnly cookie. Bind it to a browser nonce and validate origin/CSRF. After auth, claim the guest session atomically, rotate its capability, revoke the old capability, bind it to the verified user, and retain its TTL. Keep the transcript/draft ephemeral. Guest cart follows its existing merge policy independently. On expired/foreign/used ticket, show a recoverable failure; logout/account switch starts a new isolated chat. Never place the ticket or session capability in a URL or model context.
- Durable history: authenticated users can opt in to saved conversation history as a separate feature from preference memory. Default is no durable transcript until retention, deletion, export, and settings UX are approved. The current 45-minute idle/4-hour absolute guest session limits remain the baseline; changing them requires a privacy/storage decision.

## 6. Delivery sequence and release gates

Each phase is a reviewable set of small changes with a passing vertical conversation. Do not mark a phase complete from UI mocks alone.

| Phase | Deliverable | Depends on / exit gate |
| --- | --- | --- |
| 0. Product and UX | Approve state map, desktop/mobile prototype, copy rules, guest/login privacy, component inventory, and updated contract examples. Record baseline conversations and current failure cases. | Product decisions below; no code rollout. |
| 1. Agent foundation | New typed envelope, page/context bridge, one evidence-bound LLM loop, real working/stream events, session claim on login, guest welcome and conversation UI. | Guest and login journeys work with a fake provider and isolated DB; no unsupported operational claim or chat reset. |
| 2. Food and commerce | Item details, food collection, improved meal planning, contextual adjustments, server-bound draft actions, cart handoff, dine-in/delivery context and quote integration. | Price/allergy/mode revalidation; no duplicate cart addition; current checkout stays authoritative. |
| 3. Reservation | Read-only availability endpoint with timestamp/expiry, reservation card, contact capture/prefill, explicit confirmation through existing booking service. | Race/expiry/idempotency tests; no "booked" message before receipt. |
| 4. Account intelligence | On-demand order/address/favorite tools, reorder preview, preference controls, optional saved-history feature with separate consent. | Ownership tests, correction/deletion tests, no creepy opening or cross-account data. |
| 5. Quality and rollout | Scenario evaluations, accessibility/browser review, latency/cost dashboards, feature-flag pilot and rollback. | Real-provider evaluation after explicit opt-in; zero critical privacy/mutation/safety failures before production. |

Phase 1 should land before extensive visual polish: it replaces the behavior that currently makes ordinary conversation feel scripted. The UX prototype and typed component system still come first, so the agent has a stable way to express results. Reservation availability and account intelligence need separate domain work; a prompt cannot create those capabilities.

## 7. Acceptance matrix

- "Chao ban", "ban la ai", and a nuanced restaurant question receive short, relevant model-composed replies; none triggers menu cards without a food request. Mixed or ambiguous requests lead to one useful clarification.
- A menu-item page plus "cay khong?" resolves the displayed item ID and answers only from verified item details. A different page cannot reuse stale item context.
- "4 nguoi", then "khoang 1 trieu", then "co be 6 tuoi", then "doi ca thanh bo" updates one session plan; the child is counted within the stated party unless the user says they are additional, and the agent clarifies if that remains ambiguous. Totals and portions are recalculated from live data.
- A guest can use food, cart, and reservation flows without login. Logging in mid-flow preserves the active chat/draft, rotates credentials, and does not persist the transcript as profile memory.
- A user asks for a previous order: only that authenticated actor's records are read. A proposed reorder revalidates item availability/prices and needs explicit selection.
- Unknown allergens never become "safe" claims. Stale prices, unavailable items, expired slots, and repeated clicks cannot silently commit a write.
- Provider, menu, booking, session, and stream interruption each have a distinct recoverable UI path; no synthetic success or half-applied action.
- Desktop and mobile keyboard, focus, reduced-motion, screen reader announcements, and 320px-width layouts pass browser checks.

Measure recommendation-to-cart, chat-to-booking, turns-to-action, correction rate, task abandonment, tool success, factual-grounding violations, p50/p95 latency, and cost per completed task. Offline tests cover contracts, fake-provider adversarial behavior, session concurrency, and browser flows. Real-provider language quality remains unverified until a separately authorized evaluation with a cost ceiling.

## 8. Decisions to lock before implementation

1. Keep guest session TTL at the current 45-minute idle/4-hour absolute limit for the upgraded release; review longer retention only with a privacy/storage requirement.
2. Preserve guest conversation through login inside the active browser journey using a one-time claim; never copy it into durable account history automatically.
3. Offer saved authenticated chat history as a separate opt-in, initially off. Decide retention and deletion UX before building it.
4. Keep order submission/payment in checkout. Chat can prepare and review a cart or booking, then ask for an explicit final action.
5. Ship text input first. Voice input, loyalty rewards, and proactive messages wait until their data sources and accessibility behavior are defined.

## 9. Implementation map

- Contracts: `supabase/functions/_shared/contracts/concierge-v2.ts` becomes a updated current contract during migration.
- Agent: evolve `context.ts`, `orchestrator.ts`, `tool-registry.ts`, `llm.ts`, `runtime.ts`, and session/knowledge repositories under `supabase/functions/_shared/concierge/`.
- HTTP: extend `supabase/functions/public-api/concierge-handlers.ts`; new booking availability belongs in a reservation handler, not the gateway `index.ts`.
- Frontend: evolve `src/features/concierge/` with a typed component registry, context collector, stream adapter, and responsive surface. Read cart through `@/features/cart` and table context through the owning feature.
- Tests: add server contract/tool/adversarial tests, isolated PostgreSQL session/booking tests, and desktop/mobile browser journeys. Run architecture checks after module-boundary changes. Keep paid/live model evaluation outside CI.

Start by reviewing Section 3 as clickable desktop/mobile prototypes and Section 5 as example JSON/SSE transcripts. Once those are accepted, implement Phase 1 in small vertical slices.
