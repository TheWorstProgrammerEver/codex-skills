---
name: supabase-react-ts
description: Build, scaffold, or refactor Supabase-backed React TypeScript apps in Ryan Hayward's MicroSaaS style. Use when Codex is asked to create a Vite React TSX app with Supabase Auth, Supabase Edge Functions, Row Level Security, local/LAN Supabase development, Netlify runtime config, command/query dispatch, semantic app UI, security integration tests, or to replace the older Day Painter React starter with a Supabase-backed starter.
---

# Supabase React TS

Use this skill to build small MicroSaaS-style apps with a React TSX client, Supabase Auth/Postgres/Edge Functions, strict RLS, local/LAN developer ergonomics, and pragmatic test coverage.

Reference starters:

- `assets/auth-starter/`: default auth-only skeleton for new MicroSaaS products.
- `assets/starter/`: Team Tasks worked example for richer app-data, RLS, and command/query patterns.

## Core Workflow

1. Inspect the target repo first. If it is empty, scaffold from `assets/auth-starter/` unless the user explicitly asks for the Team Tasks worked example.
2. Read `references/project-style.md` before making structure, UI, dependency, or testing choices.
3. Read `references/starter-guide.md` before scaffolding, choosing starter mode, renaming, or wiring config.
4. For auth-only skeletons, run `scripts/scaffold.mjs` and skip app-data references until a persisted feature is requested.
5. For data boundaries, Edge Functions, or request handling, read `references/architecture.md`.
6. For schema, RLS, direct-table access, or security tests, read `references/supabase-security.md`.
7. For runtime config, Netlify builds, or local/LAN scripts, read `references/config-and-deploy.md`.
8. Implement the usable app first, not a marketing page. Keep files small and concerns separated.
9. Verify with the narrowest meaningful set: `npm run lint`, `npm test`, `npm run build`, Playwright for UI flows, and `npm run test:security` for RLS/function changes.

## Default Shape

- Client: Vite, React, TypeScript, React Router, SCSS modules.
- Backend: Supabase Auth first; add Postgres migrations, Edge Functions, and RLS as mandatory safety nets when app data is introduced.
- Boundary style: command/query request types, shared identifiers/types in `common`, client-side function invoker handlers, and function-side dispatcher handlers once product data crosses the client/function boundary.
- Runtime config: committed `public/config.js` loader, committed substitutable `public/config.json`, ignored `public/config.local.json`, test config under `tests/visual`.
- Developer workflow: `npm run get-going` starts dependencies, Docker/Supabase/functions/Vite, writes local config, exposes LAN URLs, and prints endpoints. `npm run all-done` winds everything down.
- Tests: unit tests for pure domain/state, visual tests for core UI, and local Supabase security tests for both Edge Functions and direct publishable-key table access once app tables exist.

## Guardrails

- Treat dependencies with skepticism. Prefer official/high-reputation packages already implied by the stack.
- Keep Supabase as an implementation detail behind data/dispatch boundaries in the client.
- Do not rely on Edge Functions alone for security. Malicious users can call tables directly with the publishable key; RLS must be correct.
- Prefer semantic HTML, native controls, and reusable layout primitives from `lib/ui`.
- Use the starter action hierarchy: one clear primary action, quiet supporting actions, destructive intent styling, Lucide icons, and responsive icon/text content.
- Avoid large global stores. Prefer composed hooks, view models, and pure state update helpers.
- Mutating commands should return minimal affected DTOs; explicit queries load explicit state.
- Keep local-only generated files ignored. Do not commit machine-specific LAN config.
- After scaffolding, run a placeholder/name sweep for `Team Tasks|teamTasks|team_tasks|team-tasks|__APP_` and fix any unintended matches before finishing.
