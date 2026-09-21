# CLAUDE.md — Tiger345 Instructions for Claude Code

## Project Overview
Tiger345 restaurant web application (React 19, TypeScript, Vite 8, Tailwind CSS v4, Vitest, Supabase).

## Verification & Testing Commands

Always run verification before claiming work is finished:

```sh
# 1. Typecheck & Lint
npm run typecheck
npm run lint

# 2. Unit & Component tests (fast, Vitest, 107 tests)
npm run test:unit

# 3. Jev offline regression tests (16 tests, headless Chrome, zero API cost)
npm run test:jev

# 4. Production build check
npm run build

# 5. Jev live browser evaluation (only when user explicitly requests live browser testing)
# Automatically retrieves authorized credentials from OS Keyring (tiger-jev service):
npm run jev:eval:keyring
```

## Agent Guidelines & Boundaries
- See `AGENTS.md` and `scripts/jev/AGENTS.md` for complete agent contracts.
- **Never** read, print, hardcode, or commit credentials (`.env`, `TYPESAFE_API_KEY`, `TEXT_MODEL_API_KEY`, etc.).
- Jev runs in an isolated sandbox (`scripts/jev/run.mjs`). All external network traffic is blocked; all mutations are forbidden.
- Never put `jev:eval` into CI or default test runs.
