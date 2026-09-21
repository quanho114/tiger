# AGENTS.md — Tiger345 Developer & Testing Guide for Coding Agents

This file provides instructions for AI coding agents (Claude Code, OpenAI Codex, Cursor, etc.) working in this repository.

## 1. Project Overview
Tiger345 is a Vietnamese restaurant web application built with:
- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router 7.
- **Backend / Services**: Supabase (PostgreSQL, Auth, Edge Functions).
- **Testing**: Vitest (unit/component), Playwright (E2E), Node test runner + Jev (isolated AI browser evaluation).

---

## 2. Common Development & Verification Commands

### Standard Quality Checks (Offline, zero cost)
```sh
npm run typecheck          # TypeScript check without emitting files
npm run lint               # Fast linting via Oxlint
npm run test:unit          # Unit & component tests via Vitest (107 tests)
npm run build              # Production build (tsc + vite build)
```

### Jev Browser Automation & Testing
Jev (`jev-ultrafast`) tests UI interaction using TypeSafe and multimodal browser observation.

```sh
# 1. Check prerequisites without calling any API:
npm run jev:check

# 2. Offline regression tests (16 tests, real headless Chrome, zero API cost):
npm run test:jev
# Or explicitly pointing to Chrome:
JEV_OFFLINE_CHROME=/usr/bin/google-chrome npm run test:jev

# 3. Live browser evaluation using Jev + TypeSafe:
# Automatically loads credentials from local OS Keyring (tiger-jev service):
npm run jev:eval:keyring

# Alternatively, if providing credentials via environment variables:
TYPESAFE_API_KEY="..." TEXT_MODEL_API_KEY="..." npm run jev:eval
```

---

## 3. Safety Boundaries for Coding Agents

1. **Zero Secret Leakage**:
   - Never print, log, hardcode, or commit API keys (`TYPESAFE_API_KEY`, `TEXT_MODEL_API_KEY`, Supabase keys).
   - Do not write secrets into `.env` files or commit `.env*`.
   - The runner accepts credentials via process environment or system keyring only.

2. **Sandbox Isolation**:
   - `npm run jev:eval` and `npm run jev:eval:keyring` run against an owned local Vite server and an in-memory synthetic fixture.
   - External network traffic, WebSockets, and service workers are blocked by CDP security guards.
   - All mutations (orders, reservations, payments, auth) return `403 Forbidden` in the fixture.
   - Independent DOM assertions on the browser tab are required for success (`status: "PASSED"`). A `DONE` model decision alone is never sufficient.

3. **No Automatic Live Evals in CI**:
   - Never put `jev:eval` or `jev:eval:keyring` in default `test`, CI, or pre-commit hooks. Live evaluations incur API costs and require explicit user opt-in.
