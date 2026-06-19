---
name: supabase-react-ts
description: Build, scaffold, or refactor Supabase-backed React TypeScript apps in Ryan Hayward's MicroSaaS style. Use when Codex is asked to create a Vite React TSX app with Supabase Auth, Supabase Edge Functions, Row Level Security, local/LAN Supabase development, Netlify runtime config, command/query dispatch, semantic app UI, security integration tests, or to replace the older Day Painter React starter with a Supabase-backed starter.
---

# Supabase React TS

Use this skill to build small MicroSaaS-style apps with a React TSX client, Supabase Auth/Postgres/Edge Functions, strict RLS, local/LAN developer ergonomics, and pragmatic test coverage.

Reference starter: `assets/starter/`

## Core Workflow

1. Inspect the target repo first. If it is empty, copy `assets/starter/` into the project root.
2. Read `references/project-style.md` before making structure, UI, dependency, or testing choices.
3. If using the starter, read `references/starter-guide.md` before renaming or wiring config.
4. For data boundaries, Edge Functions, or request handling, read `references/architecture.md`.
5. For schema, RLS, direct-table access, or security tests, read `references/supabase-security.md`.
6. For runtime config, Netlify builds, or local/LAN scripts, read `references/config-and-deploy.md`.
7. Implement the usable app first, not a marketing page. Keep files small and concerns separated.
8. Verify with the narrowest meaningful set: `npm run lint`, `npm test`, `npm run build`, Playwright for UI flows, and `npm run test:security` for RLS/function changes.

## Default Shape

- Client: Vite, React, TypeScript, React Router, SCSS modules.
- Backend: Supabase Auth, Postgres migrations, Edge Functions, RLS as a mandatory safety net.
- Boundary style: command/query request types, shared identifiers/types in `common`, client-side function invoker handlers, function-side dispatcher handlers.
- Runtime config: committed `public/config.js` loader, committed substitutable `public/config.json`, ignored `public/config.local.json`, test config under `tests/visual`.
- Developer workflow: `npm run get-going` starts dependencies, Docker/Supabase/functions/Vite, writes local config, exposes LAN URLs, and prints endpoints. `npm run all-done` winds everything down.
- Tests: unit tests for pure domain/state, visual tests for core UI, local Supabase security tests for both Edge Functions and direct publishable-key table access.

## Guardrails

- Treat dependencies with skepticism. Prefer official/high-reputation packages already implied by the stack.
- Keep Supabase as an implementation detail behind data/dispatch boundaries in the client.
- Do not rely on Edge Functions alone for security. Malicious users can call tables directly with the publishable key; RLS must be correct.
- Prefer semantic HTML, native controls, and reusable layout primitives from `lib/ui`.
- Avoid large global stores. Prefer composed hooks, view models, and pure state update helpers.
- Mutating commands should return minimal affected DTOs; explicit queries load explicit state.
- Keep local-only generated files ignored. Do not commit machine-specific LAN config.
