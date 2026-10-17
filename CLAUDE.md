# CLAUDE.md — Tiger345 Instructions for Claude Code

## Project Overview
Tiger345 restaurant web application (React 19, TypeScript, Vite 8, Tailwind CSS v4, Vitest, Supabase).

## Verification & Testing Commands

Always run verification before claiming work is finished:

```sh
# 1. Typecheck & Lint
npm run typecheck
npm run typecheck:server
npm run lint

# 2. Architecture checks
npm run check:architecture
npm run test:architecture

# 3. Unit, Component & Server tests
npm run test:unit
npm run test:server

# 4. Production build check
npm run build
```

Database and browser suites have additional prerequisites; see `AGENTS.md` and
`docs/contributing.md`. Real-provider browser testing requires explicit approval.

## Agent Guidelines & Boundaries
- See `AGENTS.md` for complete agent contracts.
- **Never** read, print, hardcode, or commit credentials (`.env`, API keys, etc.).
- Never run paid provider evaluations in CI or default test runs.
