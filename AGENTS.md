# AGENTS.md — Tiger345 Developer & Testing Guide for Coding Agents

This file provides instructions for AI coding agents (Claude Code, OpenAI Codex, Cursor, etc.) working in this repository.

## 1. Project Overview
Tiger345 is a Vietnamese restaurant web application built with:
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router 7.
- **Backend / Services**: Supabase (PostgreSQL, Auth, Edge Functions).
- **Testing**: Vitest (unit/component), Playwright (E2E), Node test runner (offline tooling tests).

---

## Code Ownership And Dependencies

- Follow `docs/architecture.md` when placing new files.
- `src/app` composes routes, layouts, and providers; `src/features` owns business
  capabilities; `src/shared` contains business-independent UI and infrastructure.
- Shared code must not import features or app code. Features must not import app.
- Frontend/server sharing is limited to `@contracts`; never import server runtime
  modules into frontend code. Access cart through `@/features/cart`.
- Keep Supabase gateway `index.ts` files focused on request guards and dispatch;
  add endpoint logic to the corresponding handler. Import dependency types from
  `context.ts`, not from the HTTP entrypoint.
- Run `npm run check:architecture` after changing module dependencies, and
  `npm run test:architecture` when changing architecture rules.

## 2. Common Development & Verification Commands

### Standard Quality Checks (Offline, zero cost)
```sh
npm run typecheck          # TypeScript check without emitting files
npm run lint               # Fast linting via Oxlint
npm run test:unit          # Unit & component tests via Vitest (107 tests)
npm run build              # Production build (tsc + vite build)
```

## 3. Safety Boundaries for Coding Agents

- Never print, log, hardcode, or commit API keys or Supabase credentials.
- Do not write secrets into `.env` files or commit `.env*`.
- Live provider evaluations incur API costs and require explicit user opt-in.
- Never add paid live evaluations to default tests, CI, or pre-commit hooks.

---

## 4. Mandatory Chatbot Runtime Acceptance Gate

**Từ nay, không được chốt “chatbot đã xong/hoạt động” chỉ vì tests, typecheck hoặc build xanh. Bot phải được nghiệm thu trên website Tiger đang chạy với backend và cấu hình provider thực tế của môi trường được bàn giao.**

Apply this gate to changes affecting Concierge UI, streaming, contracts, routing,
grounding, tools, sessions, memory, provider configuration, and their runtime
integration. Preserve Concierge v2 and the normal cart/order/payment boundaries.

### Before Claiming Completion

1. **Check the actual target environment first.** Confirm the frontend URL,
   backend destination, running source/version, database schema, feature flags,
   and effective provider configuration. Check URL validation, allowlist and
   required credential presence without printing secrets. A saved admin
   configuration is not proof that the runtime accepts it. Do not silently
   substitute a stub, injected adapter, different provider, test backend, or
   weaker security policy to make acceptance pass.

2. **Run the relevant automated checks.** For chatbot changes, run
   `npm run typecheck`, `npm run typecheck:server`, `npm run lint`,
   `npm run test:server`, `npm run test:unit`, and `npm run build`.
   Also run the relevant PostgreSQL/browser integration tests; for streaming
   changes, include:
   ```sh
   npm run test:integration -- tests/integration/concierge-streaming.test.ts tests/integration/concierge-browser.test.ts tests/integration/concierge-v2-persistence.test.ts
   ```
   Follow the architecture checks above when changing dependencies. Report
   failures honestly; do not weaken assertions or change unrelated business
   logic just to make the suite green.

3. **Perform a real browser smoke test on Tiger, not a separate chatbot UI.**
   Use a fresh guest/test session, synthetic messages, and an approved test
   environment. Do not change the developer's existing conversation or cart.
   No request interception, injected orchestrator, synthetic provider, or
   canned response may stand in for this runtime acceptance test. Verify:
   - Open the chatbot, send a greeting, and receive a nonempty completed reply.
   - Send a second message in the same session; the input must remain usable.
   - Ask for a restaurant fact and a menu price; answers must match current
     authoritative data, or explicitly abstain when that data is missing.
   - Request a meal recommendation, accept it into the guarded draft, and
     adjust quantity; displayed items/totals must match server state. Use
     draft-only operations; test handoff only in an isolated test cart.
   - For streaming changes, verify processing status, visible text,
     completion, stable bubbles, and desktop/mobile presentation. Verify
     Stop/retry/disconnection invariants with the automated failure tests;
     never equate a stopped connection with a rolled-back mutation.
   - There must be no unexplained “Dịch vụ trợ lý tạm thời không khả dụng”,
     stuck loading, permanently disabled input, duplicate completion, or
     unhandled browser exception in the successful smoke flow.

4. **Respect live-call and data safety boundaries.** Real-provider smoke tests
   can incur costs and need explicit user approval; this acceptance rule is
   not that approval. Do not automatically run paid provider evaluations, submit
   orders/payments/reservations, edit real addresses, or enable durable memory.
   If provider access, approval, or the target environment is missing, state
   that runtime acceptance is pending and request the missing prerequisite.
   Mock tests are still useful, but do not label them real-provider evidence.

5. **Attach evidence to the handoff.** Record the tested frontend/backend
   environment and time, commands/results, exercised scenarios, and observed
   browser behavior. Distinguish synthetic/injected tests from actual provider
   smoke tests. For failures, capture sanitized HTTP/SSE error codes and request
   IDs where available; never include keys, capabilities, tokens, full private
   conversations, or raw secret-bearing logs. State whether the changed backend
   is actually running/deployed rather than inferring it from a frontend build.

### Completion Rule

- If the actual chatbot still shows the reported failure, the chatbot task is
  **not accepted**. Continue diagnosing within scope; never hide the error
  banner, fabricate a successful answer, bypass provider destination checks,
  or declare success based solely on unit tests.
- If code checks pass but real runtime acceptance cannot be performed, report
  **“Code đã kiểm định; chatbot thực tế chưa nghiệm thu”**, explain the exact
  remaining prerequisite, and do not claim the chatbot is working or
  production-ready. If this gate exposes an unrelated/environment issue,
  report it separately and seek approval for changes outside the task's scope.
- The final report for chatbot work must explicitly include:
  **Runtime chatbot: PASS / FAIL / CHƯA KIỂM ĐỊNH**, supporting evidence, and
  any unresolved failures. PASS requires the real runtime smoke test above;
  offline/synthetic tests alone cannot satisfy it.
