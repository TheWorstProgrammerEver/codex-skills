# Team Tasks Environment Setup

Use this checklist when deploying Team Tasks to Netlify and a hosted Supabase project. Keep placeholder values in this file; do not commit real secrets, credential values, private hostnames, local IP addresses, or device-specific identifiers.

## Frontend Runtime Config

The browser loads runtime config through `public/config.js`.

- Local development: `npm run get-going` writes ignored `public/config.local.json`.
- Production: `npm run build:netlify` renders `dist/config.js` so it loads `/config.json`, substitutes `public/config.json` tokens into `dist/config.json`, and parses the rendered JSON.
- Netlify build command: `npm run build:netlify`.
- Netlify publish directory: `dist`.
- SPA redirects: keep `public/_redirects` deployed with `/* /index.html 200`.

Set these Netlify environment variables for production:

| Variable | Example placeholder | Notes |
| --- | --- | --- |
| `BUILD_VERSION` | `<git-sha-or-release>` | Display/debug version. |
| `ENVIRONMENT` | `production` | Runtime environment label. |
| `AUTH_EMAIL_PASSWORD_ENABLED` | `true` | JSON boolean, not a quoted string. |
| `AUTH_PASSKEY_ENABLED` | `true` | JSON boolean. Disable if hosted WebAuthn is not configured. |
| `AUTH_OTP_ENABLED` | `true` | JSON boolean. |
| `AUTH_MAGIC_LINK_ENABLED` | `true` | JSON boolean. |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Hosted Supabase project API URL. |
| `SUPABASE_PUBLISHABLE_KEY` | `<publishable-key>` | Public browser key. This is not a service role key. |

If a deploy uses a non-default config path, update the deploy-time `#{CONFIG_FILE}#` substitution in `public/config.js` and document the path here.

## Netlify Site Settings

- Build command: `npm run build:netlify`.
- Publish directory: `dist`.
- Node version: use the repository-supported version for the app toolchain.
- Confirm deploy logs show `Rendered dist/config.js` and `Rendered dist/config.json`.
- Confirm GitHub integration triggers a fresh Netlify build after changes to runtime config, scripts, redirects, migrations that affect client behavior, or Supabase client code.

Netlify or repo Node settings do not control the Supabase hosted Edge Runtime. Changing `.nvmrc`, `engines.node`, or Netlify `NODE_VERSION` does not change the Deno-based runtime used by hosted Edge Functions.

## Supabase Hosted Auth Settings

Configure these in the hosted Supabase dashboard for the production project. The local `supabase/config.toml` helps local development but does not replace hosted dashboard settings.

- Site URL: `https://<production-domain>`.
- Redirect URLs: include exact production callback and app URLs, for example `https://<production-domain>/**` only if wildcard redirects are intentionally accepted.
- Email/password: match the product decision for confirmations, password requirements, signup availability, and SMTP sender settings.
- OTP or magic link: enable only when the UI exposes it; configure email templates, sender identity, rate limits, and provider settings.
- Passkeys/WebAuthn, when enabled:
  - RP ID: `<production-domain-without-scheme>`.
  - RP origins: `https://<production-domain>` and any intentionally supported preview/staging origins.
  - RP display name: `Team Tasks`.
- OAuth/SMS providers, when enabled: configure provider credentials in Supabase dashboard or Supabase-managed secrets, not in this repository.

## Supabase Edge Functions

Configured functions in `supabase/config.toml`:

| Function | JWT verification | Entrypoint | Deploy expectation |
| --- | --- | --- | --- |
| `app-health` | `verify_jwt = false` | `./functions/app-health/index.ts` | Public health check; deploy with `npm run supabase:functions:deploy -- app-health` or an equivalent CI step. |
| `app` | `verify_jwt = false` | `./functions/app/index.ts` | App command/query endpoint. It allows unauthenticated platform requests so the function can return app-level auth errors; handlers still require a valid user where needed. Deploy with `npm run supabase:functions:deploy -- app` or an equivalent CI step. |

Edge Function npm imports should be pinned exactly or managed through a function-specific `deno.json`. Avoid floating imports such as `npm:@supabase/supabase-js@2` because hosted functions resolve npm imports independently from `package-lock.json`. For public functions that only need simple Supabase REST reads, consider direct `fetch` to PostgREST with service-role auth stored as a Supabase function secret instead of importing the full Supabase JS client.

After deployment, invoke each function once and inspect hosted function logs for import-time dependency warnings. Repo/build Node versions are separate from hosted Edge Runtime versions.

## Database

Team Tasks includes SQL migrations under `supabase/migrations`.

- Apply migrations to production with `supabase db push`, a reviewed migration pipeline, or the team's hosted Supabase deployment workflow before exposing client routes that depend on them.
- Confirm RLS policies are enabled for app tables.
- Confirm security tests cover both Edge Function access and direct publishable-key table access before changing migration behavior.
- Document required seed data, one-time backfills, or GitHub/Supabase integration redeploy behavior here when added.

## Production Smoke Checks

Run these after every production deploy:

- Open the production app and confirm the browser successfully loads `/config.js` and `/config.json`.
- Confirm the browser config object contains the production `SUPABASE_URL`, expected auth flags, and no unresolved `#{...}#` tokens.
- Sign in and sign out through the supported auth methods.
- For auth callbacks, confirm the hosted app returns to the expected route without a redirect allow-list error.
- Visit a deep SPA route directly and confirm Netlify serves `index.html` through `public/_redirects`.
- Invoke `https://<project-ref>.supabase.co/functions/v1/app-health` and confirm it returns a JSON health response.
- Invoke an authenticated app flow that calls `https://<project-ref>.supabase.co/functions/v1/app`.
- If a browser call reports a CORS/preflight failure, check whether the deployed function exists and responds outside the browser first. A missing or stale function deployment can surface as a browser CORS error even when the root cause is a `404`, route mismatch, or import-time function failure.
- Check Supabase hosted function logs after invocation for import-time dependency warnings, runtime errors, and unexpected Node compatibility warnings.
