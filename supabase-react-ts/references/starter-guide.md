# Starter Guide

Use `assets/starter/` when creating a new app or when a user asks for "the Supabase React starter", "MicroSaaS starter", or "the replacement for Day Painter".

## Copying The Starter

From the target project root, copy the starter contents, then rename app-specific text:

```sh
cp -R /Users/ryanhayward/.codex/skills/supabase-react-ts/assets/starter/. .
npm install
```

After copying:

1. Update `package.json` name and scripts if the app label changed.
2. Update `public/config.json` app name and deployment substitution tokens as needed.
3. Update `supabase/config.toml` `project_id` and function names only if the product needs different names.
4. Replace Team Tasks domain examples with the real domain incrementally.
5. Run `npm run lint`, `npm test`, and `npm run build`.

## First Local Run

Use the workflow scripts instead of ad hoc command chains:

```sh
npm run get-going
```

`get-going` should:

- install dependencies when needed
- open/wait for Docker Desktop on macOS
- start the local Supabase stack
- serve Edge Functions locally
- start Vite on `0.0.0.0`
- generate ignored `public/config.local.json`
- print localhost and LAN endpoints

Wind down with:

```sh
npm run all-done
```

## What To Replace First

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

Keep the auth panel, app frame, dialog, list, loader, config, and workflow scripts unless the product has a clear reason to diverge.

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
