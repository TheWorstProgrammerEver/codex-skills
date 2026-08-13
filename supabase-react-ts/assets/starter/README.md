# Team Tasks Starter

Team Tasks is a deliberately small Supabase-backed React TSX app for extracting starter patterns.

It demonstrates auth, workspace membership, invitations, task CRUD, Row Level Security, Edge Function command/query handling, runtime config, Netlify builds, and local/LAN developer ergonomics without carrying product-specific complexity.

## Get Going

Prerequisites:

- Node.js and npm
- Docker Engine with a running daemon on Linux, or Docker Desktop on macOS
- Playwright Chromium plus its OS runtime libraries

From a fresh clone:

```sh
npm install
npm run preflight
npm run get-going
```

The read-only preflight checks Docker daemon access and launches headless Chromium once. Downloading Chromium with `npx playwright install chromium` does not install Linux shared-library dependencies. On a Linux development host, prepare both layers with `npx playwright install --with-deps chromium`, or install the browser and then run `sudo npx playwright install-deps chromium` as an explicitly authorized host-provisioning step.

If this task is scoped to repository work, report a missing daemon or browser runtime as a host prerequisite. Do not silently install system packages, start services, or otherwise perform privileged host provisioning.

The script installs npm dependencies when needed, opens and waits for Docker Desktop on macOS, starts the local Supabase stack, starts local Edge Functions, validates each enabled function route from `supabase/config.toml`, starts Vite on LAN, writes ignored local developer config to `public/config.local.json`, verifies reachable ports, and prints the localhost and LAN endpoint sheet.

Press `Ctrl+C` to stop dev processes started by the script. Supabase containers keep their local data in Docker volumes; use `npm run all-done` when you want everything wound down. Lifecycle cleanup signals only this project's freshly revalidated `get-going` owner and waits for its isolated process groups; it never kills by shared port or command match. If an unowned listener or stale/ambiguous runtime remains, cleanup exits nonzero with recovery guidance.

If `app-health` is ready but another function route is `404`, or a business route returns `503` after adding shared imports, restart the local stack with `npm run all-done` and `npm run get-going` before running security tests. If Edge Runtime is healthy but Kong reports name-resolution failures, restarting the local Kong container for this Supabase project may be enough.

## Unit Tests

Run `npm test` for the unit suite. Before Vitest starts, the command verifies that every committed `tests/unit/**/*.test.*` file matches the configured include globs, so a new test extension cannot be skipped behind a green result.

## Runtime Config

`public/config.js` is the committed browser loader. It synchronously loads one JSON config file:

- `public/config.local.json` when `#{CONFIG_FILE}#` has not been substituted
- the substituted `#{CONFIG_FILE}#` path when present

`public/config.json` is the committed deployment template and should be substituted by CI/CD. `npm run get-going` generates ignored `public/config.local.json` for the current machine/LAN. Visual tests keep their config under `tests/visual/config.test.json` and route it as `/config.local.json`.

Deployment and hosted environment setup lives in `README.ENV.md`. Keep that file current whenever runtime config, Netlify settings, Supabase Auth providers, Edge Functions, migrations, or hosted dashboard settings change. It should contain placeholders only, never real secrets or machine-specific values.

## Security Integration Tests

The security integration suite runs against the local Supabase stack and exercises both Edge Function access and direct publishable-key table access:

```sh
npm run get-going
npm run test:security
npm run all-done
```

The tests create isolated local auth users and app rows, then clean them up with the local service-role key.
