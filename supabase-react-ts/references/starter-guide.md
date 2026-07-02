# Starter Guide

Use the auth-only starter for new products by default. Use the Team Tasks starter only when the user explicitly wants a worked example with workspace/task app data, RLS policies, Edge Function command/query handlers, and security tests.

## Auth-Only Starter

Use this path when the prompt says "skeleton", "just enough to authenticate", "welcome screen", "we will define features later", or otherwise does not specify persisted product data.

From the target project root, run the scaffold script from this skill folder:

```sh
node /path/to/supabase-react-ts/scripts/scaffold.mjs --name "Spotter" --target . --purpose "a bodybuilding journey product"
```

Common options:

```sh
node /path/to/supabase-react-ts/scripts/scaffold.mjs \
  --name "Spotter" \
  --target . \
  --package-name spotter \
  --project-id spotter \
  --purpose "a bodybuilding journey product" \
  --welcome-copy "Your workspace is ready. Product features will take shape here."
```

After scaffolding:

1. Run `npm install`.
2. Run `rg -n "Team Tasks|team tasks|teamTasks|team_tasks|team-tasks|__APP_" . --glob '!node_modules/**' --glob '!dist/**'`.
3. Fix every unintended match. Do not leave starter/example names in app titles, package metadata, tests, scripts, fallback UI strings, Supabase config, or README files.
4. Run `npm run lint`, `npm test`, and `npm run build`.

The auth-only starter intentionally has no product tables, no app-data Edge Function, and no RLS policies yet. It uses Supabase Auth metadata for the displayed account rather than requiring a `profiles` table. Add migrations, RLS, and security tests with the first persisted product feature.

## Team Tasks Worked Example

Use `assets/starter/` when a user asks for the full worked example, a data-backed starter, or concrete RLS/function patterns.

From the target project root, copy the starter contents, then rename app-specific text:

```sh
cp -R "$HOME/.codex/skills/supabase-react-ts/assets/starter/." .
npm install
```

After copying the Team Tasks example:

1. Update `package.json` name and scripts if the app label changed.
2. Update `public/config.json` app name and deployment substitution tokens as needed.
3. Update `supabase/config.toml` `project_id` and function names only if the product needs different names.
4. Replace Team Tasks domain examples with the real domain incrementally, or keep them only if the user intentionally wants the worked example.
5. Run the same placeholder/name sweep used for auth-only scaffolds.
6. Run `npm run lint`, `npm test`, and `npm run build`.

## First Local Run

Use the workflow scripts instead of ad hoc command chains:

```sh
npm run get-going
```

`get-going` should:

- install dependencies when needed
- open/wait for Docker Desktop on macOS
- start the local Supabase stack
- disable Docker auto-restart for this project's Supabase containers
- serve Edge Functions locally
- start Vite on `0.0.0.0`
- generate ignored `public/config.local.json`
- print localhost and LAN endpoints

Wind down with:

```sh
npm run all-done
```

The workflow scripts should derive the Supabase project id from `supabase/config.toml` and set matching containers to Docker `--restart=no`, so one starter cannot quietly relaunch itself every time Docker Desktop opens.

## Replacing The Worked Example

The starter's example domain is deliberately small: workspaces, invitations, members, and tasks.

Replace in this order:

1. Domain DTOs and request identifiers in `common`.
2. Pure app types/rules in `src/domain`.
3. Client request types in `src/data/app/requests.ts`.
4. Server handlers under `supabase/functions/app/handlers`.
5. SQL schema/RLS in `supabase/migrations`.
6. State update helpers in `src/state`.
7. Screens and app-specific components.
8. Tests.

Keep the auth panel, app frame, dialog, action-role controls, responsive icon content, list, loader, config, and workflow scripts unless the product has a clear reason to diverge.

## Verification Baseline

Use these after meaningful changes:

```sh
npm run lint
npm test
npm run build
npm run test:visual
npm run get-going
npm run test:security
npm run all-done
```

Run only the relevant subset for small edits, but always run security tests after RLS, migration, Edge Function, or direct table access changes.
