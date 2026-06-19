# Team Tasks Starter

Team Tasks is a deliberately small Supabase-backed React TSX app for extracting starter patterns.

It demonstrates auth, workspace membership, invitations, task CRUD, Row Level Security, Edge Function command/query handling, runtime config, Netlify builds, and local/LAN developer ergonomics without carrying product-specific complexity.

## Get Going

Prerequisites:

- Node.js and npm
- Docker Desktop

From a fresh clone:

```sh
npm run get-going
```

The script installs npm dependencies when needed, opens and waits for Docker Desktop on macOS, starts the local Supabase stack, starts local Edge Functions, starts Vite on LAN, writes ignored local developer config to `public/config.local.json`, verifies reachable ports, and prints the localhost and LAN endpoint sheet.

Press `Ctrl+C` to stop dev processes started by the script. Supabase containers keep their local data in Docker volumes; use `npm run all-done` when you want everything wound down.

## Runtime Config

`public/config.js` is the committed browser loader. It synchronously loads one JSON config file:

- `public/config.local.json` when `#{CONFIG_FILE}#` has not been substituted
- the substituted `#{CONFIG_FILE}#` path when present

`public/config.json` is the committed deployment template and should be substituted by CI/CD. `npm run get-going` generates ignored `public/config.local.json` for the current machine/LAN. Visual tests keep their config under `tests/visual/config.test.json` and route it as `/config.local.json`.

## Security Integration Tests

The security integration suite runs against the local Supabase stack and exercises both Edge Function access and direct publishable-key table access:

```sh
npm run get-going
npm run test:security
npm run all-done
```

The tests create isolated local auth users and app rows, then clean them up with the local service-role key.
