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

# 3. Production build check
npm run build
```

## Agent Guidelines & Boundaries
- See `AGENTS.md` for complete agent contracts and chatbot runtime acceptance requirements.
- Never read, print, hardcode, or commit credentials or credential files.
- Live provider evaluations require explicit approval and must not run in CI or default tests.
