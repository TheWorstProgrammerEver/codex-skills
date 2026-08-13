# Supabase

The starter uses Supabase for auth, persistence, RLS, and Edge Functions. The React app talks to a small Edge Function API for business actions, while direct table access remains protected by Row Level Security.

## Local Commands

Run the stack:

```sh
npm run supabase:start
```

Inspect local URLs and keys:

```sh
npm run supabase:status
```

Check that the live local migration history matches this checkout:

```sh
npm run supabase:check-migrations
```

This read-only check is separate from service startup because persistent local
database state can come from another branch.

Reset a confirmed-disposable local database from migrations and seed:

```sh
npm run supabase:reset
```

Generate a migration from changes made in the local Supabase UI:

```sh
npm run supabase:migration -- add_some_change
```

This runs `supabase db diff --local --file add_some_change` and writes a timestamped migration under `supabase/migrations`.

Serve Edge Functions locally:

```sh
npm run supabase:functions:serve
```

The `app-health` function is public locally and should respond at:

```txt
http://127.0.0.1:54321/functions/v1/app-health
```

Use it as a cheap runtime smoke check only. `npm run get-going` also validates
every enabled `[functions.*]` route in `supabase/config.toml` so a stale Edge
Runtime cannot hide a missing new business function behind a passing health
check. If a business route is `404`, or `503` after adding shared imports,
restart the local Supabase stack before running security tests. If Kong reports
name-resolution failures while Edge Runtime is healthy, restarting the local
Kong container for this Supabase project may be enough.

Stop the stack:

```sh
npm run supabase:stop
```

## Shape

Current split:

- Database migrations define durable app tables and RLS policy helpers.
- The `app` Edge Function owns workspace, invitation, and task commands.
- The function uses the caller's JWT when querying Supabase, so table RLS remains the final access-control layer.
- Mutations return minimal DTOs such as the created/updated row or deleted id.
- Service-role grants exist for local/test administration and cleanup, not browser access.
- Browser runtime configuration is loaded by `public/config.js` from JSON payloads. Local development uses generated, ignored `public/config.local.json`; deploys should substitute committed `public/config.json`.

## Environment Promotion

The React bundle should continue using runtime config rather than Vite build-time env vars:

- `#{SUPABASE_URL}#`
- `#{SUPABASE_PUBLISHABLE_KEY}#`
- `#{ENVIRONMENT}#`
- `#{BUILD_VERSION}#`
- `#{AUTH_EMAIL_PASSWORD_ENABLED}#`
- `#{AUTH_OTP_ENABLED}#`
- `#{AUTH_MAGIC_LINK_ENABLED}#`
- optionally `#{CONFIG_FILE}#` in `public/config.js` if a deploy needs to load a non-default JSON config path

That gives test and production the same build artifact with environment-specific values replaced at deployment time.
