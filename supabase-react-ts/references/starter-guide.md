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

1. Confirm Node.js is at least the auth starter's `package.json` `engines.node` floor.
2. Run `npm install`.
3. Run `npm run preflight` before promising local Supabase, security, or visual validation. It is read-only and checks Docker daemon access plus a real Playwright Chromium launch.
4. Confirm `README.ENV.md` describes the app's actual runtime config, Netlify build settings, hosted Supabase Auth settings, Edge Functions, migration expectations, and production smoke checks using placeholders only.
5. Run `rg -n "Team Tasks|team tasks|teamTasks|team_tasks|team-tasks|__APP_" . --glob '!node_modules/**' --glob '!dist/**'`.
6. Fix every unintended match. Do not leave starter/example names in app titles, package metadata, tests, scripts, fallback UI strings, Supabase config, or README files.
7. Run `npm run lint`, `npm test`, and `npm run build`.

The auth starter's ordinary `npm run test:security` command makes one direct local public signup assertion and removes the created user. Its backend-disabled variant is intentionally opt-in because it requires restarting the local Auth service with both signup controls disabled. Follow the exact stop/change/restart/test/restore/restart sequence in the scaffolded `README.md`; never treat frontend visibility or a browser mock as proof of backend enforcement.

The auth starter commits exact direct dependency versions and a lockfile. When refreshing the starter toolchain, update the direct dependency pins, lockfile, and Node engine floor in the same change, then validate a fresh scaffold under that Node version.

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
3. Confirm `README.ENV.md` reflects the actual Netlify build command, publish directory, runtime variables, Supabase Auth dashboard settings, Edge Function names/JWT settings, migration workflow, and production smoke checks.
4. Update `supabase/config.toml` `project_id` and function names only if the product needs different names.
5. Replace Team Tasks domain examples with the real domain incrementally, or keep them only if the user intentionally wants the worked example.
6. Run the same placeholder/name sweep used for auth-only scaffolds.
7. Run `npm run lint`, `npm test`, and `npm run build`.

## First Local Run

Local Supabase needs Docker Engine with a running daemon on Linux or Docker Desktop on macOS. Playwright needs both its browser bundle and the platform runtime libraries. `npx playwright install chromium` installs only the browser; on Linux use `npx playwright install --with-deps chromium`, or follow it with `sudo npx playwright install-deps chromium` when privileged host provisioning is explicitly authorized.

After `npm install`, run the read-only prerequisite check before committing to the full local sweep:

```sh
npm run preflight
```

If repository work is the only authorized scope, report failed host prerequisites rather than silently installing system packages or starting services.

Use the workflow scripts instead of ad hoc command chains:

```sh
npm run get-going
```

`get-going` should:

- install dependencies when needed
- open/wait for Docker Desktop on macOS; require an already running Docker Engine or compatible daemon on Linux
- start the local Supabase stack
- disable Docker auto-restart for this project's Supabase containers
- serve Edge Functions locally
- validate every enabled `[functions.*]` route from `supabase/config.toml`
- start Vite on `0.0.0.0`
- generate ignored `public/config.local.json`
- print localhost and LAN endpoints

Starting services is not a schema-conformance check. The local database backup
can retain applied migrations from a previously checked-out branch. After a
branch or worktree change across migration-bearing history, run the read-only
gate before schema or security integration tests:

```sh
npm run supabase:check-migrations
```

`npm run test:security` invokes the same gate automatically. If it reports
drift and all local data is disposable, explicitly confirm that destructive
assumption, run `npm run supabase:reset`, rerun the gate, and then run the
security suite. If any local data must survive, do not reset or mutate migration
history without operator approval; preserve the reported version sets and ask
the operator to choose reconciliation, export/rebuild, or an isolated stack.
See `supabase-security.md` for the complete decision boundary.

Do not rely on `app-health` alone before running security tests. It can still
return OK while a newly configured business function returns `404`, or while an
existing business function returns `503` after importing a new shared file that
the already-running Edge Runtime did not mount. In that case, wind down with
`npm run all-done`, then run `npm run get-going` so the local stack starts from
the current branch. If Edge Runtime is healthy but Kong reports name-resolution
failures, restarting only the local Kong container for the Supabase project may
be enough; no app code change is implied.

Wind down with:

```sh
npm run all-done
```

`get-going` owns a project-local runtime generation and keeps its launched Vite
and Edge Function process groups attached to that owner. `all-done` signals only
that freshly revalidated owner, awaits its bounded group cleanup, and retains a
stable member snapshot when a launched group leader exits before its remaining
descendants. Normal owner self-release after signaling is reconciled separately
from a replacement generation, which remains untouched. Generation exclusion
stays held while the workflow stops the project-labelled Supabase stack, so a
replacement cannot claim between owner reconciliation and those stop effects.
If managed-child cleanup fails, the owner records that result before exiting.
A later `all-done` or `get-going` retains the failed generation and exits
nonzero; a terminal owner with only an active record is likewise indeterminate,
not proof that its descendants stopped. Follow the bounded diagnostic to
reconcile exact project-owned processes before removing that state.
It reports success only after runtime state and advertised endpoints are
terminal. It never treats a listener on the
shared Vite port or a host-wide command match as permission to signal. If the
runtime record is malformed, stale, cross-project, failed, indeterminate, or replaced during shutdown,
follow the bounded diagnostic and stop the identified process explicitly before
retrying.

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
npm run preflight
npm run test:visual
npm run get-going
npm run supabase:check-migrations
npm run test:security
npm run test:security:signup-disabled # only in the documented disabled-stack mode
npm run all-done
```

Run only the relevant subset for small edits, but always run security tests after RLS, migration, Edge Function, or direct table access changes.
After adding or renaming a function route, or after making an existing function
import a new shared file, rerun `get-going` and confirm its configured function
route checks pass before treating security-test failures as app logic failures.
The starter's normal `npm test` command first verifies that every committed
`tests/unit/**/*.test.*` file matches the configured Vitest include globs. Keep
that discovery contract and both starter configurations aligned when adding a
unit-test extension.
