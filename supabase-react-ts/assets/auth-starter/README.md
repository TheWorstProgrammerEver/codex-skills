# __APP_DISPLAY_NAME__

__APP_DISPLAY_NAME__ is a Supabase-backed React TypeScript app skeleton for __APP_PURPOSE__.

The app currently supports Supabase authentication and a protected home screen that says
`Welcome to __APP_DISPLAY_NAME__`.

It keeps the product surface intentionally small for now: auth, runtime config, Netlify builds, a local Supabase stack, an Edge Function health check, and local/LAN developer ergonomics.

## Get Going

Prerequisites:

- Node.js 22.12.0 or newer, with npm
- Docker Engine with a running daemon on Linux, or Docker Desktop on macOS
- Playwright Chromium plus its OS runtime libraries

The committed Vite/Vitest/Supabase toolchain is pinned in `package.json` and `package-lock.json`. Refresh direct dependency versions and the Node engine floor together when deliberately updating the starter toolchain.

From a fresh clone:

```sh
npm install
npm run preflight
npm run get-going
```

The read-only preflight checks Docker daemon access and launches headless Chromium once. Downloading Chromium with `npx playwright install chromium` does not install Linux shared-library dependencies. On a Linux development host, prepare both layers with `npx playwright install --with-deps chromium`, or install the browser and then run `sudo npx playwright install-deps chromium` as an explicitly authorized host-provisioning step.

If this task is scoped to repository work, report a missing daemon or browser runtime as a host prerequisite. Do not silently install system packages, start services, or otherwise perform privileged host provisioning.

The script installs npm dependencies when needed, opens and waits for Docker Desktop on macOS, starts the local Supabase stack, starts local Edge Functions, validates each enabled function route from `supabase/config.toml`, starts Vite on LAN, writes ignored local developer config to `public/config.local.json`, verifies reachable ports, and prints the localhost and LAN endpoint sheet.

Press `Ctrl+C` to stop dev processes started by the script. Supabase containers keep their local data in Docker volumes; use `npm run all-done` when you want everything wound down.

After adding the first product function, do not treat `app-health` alone as proof that the current branch is ready. If `app-health` is ready but another function route is `404`, or a business route returns `503` after adding shared imports, restart the local stack with `npm run all-done` and `npm run get-going` before running security tests. If Edge Runtime is healthy but Kong reports name-resolution failures, restarting the local Kong container for this Supabase project may be enough.

## Unit Tests

Run `npm test` for the unit suite. Before Vitest starts, the command verifies that every committed `tests/unit/**/*.test.*` file matches the configured include globs, so a new test extension cannot be skipped behind a green result.

## Runtime Config

`public/config.js` is the committed browser loader. It synchronously loads one JSON config file:

- `public/config.local.json` when `#{CONFIG_FILE}#` has not been substituted
- the substituted `#{CONFIG_FILE}#` path when present

`public/config.json` is the committed deployment template and should be substituted by CI/CD. `npm run get-going` generates ignored `public/config.local.json` for the current machine/LAN. Visual tests keep their config under `tests/visual/config.test.json` and route it as `/config.local.json`.

Authentication-method flags are frontend presentation capabilities. They do not authorize or deny account creation: callers can bypass the browser and invoke public Auth directly. Supabase Auth's project-wide and provider-specific signup settings are the authoritative enrolment controls.

Deployment and hosted environment setup lives in `README.ENV.md`. Keep that file current whenever runtime config, Netlify settings, Supabase Auth providers, Edge Functions, migrations, or hosted dashboard settings change. It should contain placeholders only, never real secrets or machine-specific values.

## Security Integration Tests

The ordinary security integration command proves the committed local backend permits a direct public signup, then removes its test user. It has no app-table tests yet because __APP_DISPLAY_NAME__ has no persisted product data:

```sh
npm run get-going
npm run test:security
npm run all-done
```

Add RLS and direct publishable-key tests here when the first persisted __APP_DISPLAY_NAME__ feature lands.

Backend-disabled signup validation is deliberately opt-in because it requires a differently configured Auth process. Use only a disposable local stack:

1. Run `npm run all-done` so Auth is stopped before configuration changes.
2. Set both `auth.enable_signup` and `auth.email.enable_signup` in `supabase/config.toml` to `false`.
3. Run `npm run supabase:start` to restart Auth with the disabled configuration.
4. Run `npm run test:security:signup-disabled`. The direct public request must return `signup_disabled` with neither a user nor a session.
5. Run `npm run supabase:stop`, restore both committed values to `true`, and run `npm run supabase:start` again.
6. Run `npm run test:security` to prove ordinary signup works after restoration, then `npm run all-done` when finished.

Changing the TOML file without restarting Auth does not apply the setting. Hiding account creation in the UI or mocking `signup_disabled` proves presentation/error handling only, not backend enforcement.
