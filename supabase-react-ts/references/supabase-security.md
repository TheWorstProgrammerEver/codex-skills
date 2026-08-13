# Supabase Security

Use this before changing migrations, RLS policies, direct table access, function auth, or security tests.

## Security Model

Assume malicious users can:

- inspect bundled frontend code
- use the publishable Supabase key
- call Edge Functions directly
- query/insert/update/delete tables directly through Supabase APIs

Therefore:

- Business Edge Functions must require authenticated users. Keep deliberately
  public functions narrow and follow their explicit public-endpoint contract.
- Database tables must have Row Level Security enabled.
- RLS must protect direct table access independently of function code.
- Security tests must exercise both functions and direct table access.

## Project Keys And Principal Credentials

[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
identify which application component is accessing a project; they do not
identify a human or machine principal. Keep project access and principal
authentication as separate decisions:

- Use a publishable key, or legacy `anon` key, for a public application
  component. Treat it as public transport metadata and pair it with a valid
  Supabase Auth session when the operation requires a human principal. RLS then
  runs as `authenticated`; without a session, the caller remains `anon`.
- Use a secret key, or legacy `service_role` key, only inside a trusted backend
  that is fully controlled and already authorizes its callers. These keys use
  the `service_role`, which has `BYPASSRLS`. Never hand one to a browser,
  packaged client, untrusted agent, or external machine as its identity. Even a
  separately named secret key identifies a backend component, not an
  RLS-constrained application principal.
- Prefer Supabase Auth whenever it provides the required principal lifecycle
  and non-interactive flow. If a machine principal instead needs its own
  scoped, rotatable, and revocable credential, generate a high-entropy opaque
  application credential, reveal it once, and persist only a strong one-way
  digest. Verification must resolve an active credential to exactly one
  server-side principal, fail closed on no or multiple matches, and return only
  a capability that performs business data access under the same RLS-backed
  authorization rules as a human caller. Do not use a service-role client as a
  substitute for that principal boundary.

### Credential Selection At Edge Functions

When `verify_jwt = false`, the function must select and validate its
authentication mode itself. Some local or hosted gateway paths can forward a
public project credential in both `apikey` and `Authorization: Bearer ...`.
Recognize an exact configured public project credential as application
transport, never as a user session.

Make principal selection authoritative and fail closed:

- A bearer value other than a recognized project credential selects the human
  session adapter. If JWT validation fails, reject the request; do not fall
  back to a simultaneously supplied machine credential.
- A recognized public project credential plus one opaque machine credential
  may select the machine adapter. Invalid, revoked, expired, or ambiguous
  machine credentials must be rejected before business dispatch.
- Reject conflicting principal credentials rather than trying adapters until
  one succeeds. Derive principal, tenant, roles, and entitlements server-side;
  ignore caller-supplied identity or privilege claims.

## Schema Pattern

The starter models multi-tenant access with:

- `profiles`: one row per auth user
- `workspaces`: tenant/group boundary
- `workspace_members`: tenant membership state
- `workspace_invitations`: first-class pending invitations
- domain tables such as `tasks` with `workspace_id`

Adapt names to the product, but keep a clear tenant boundary column on tenant-owned tables.

For a schema that duplicates one tenant owner across a principal row and an
owner membership, use the complete
[cross-table owner invariant](supabase-owner-invariants.md). New schemas should
keep active memberships and pending invitations in separate tables rather than
representing an invitation as a pseudo-member.

For an append-only tenant effect that needs both a monotonic local sequence and
idempotent retries, use the complete
[serialized tenant write pattern](supabase-serialized-writes.md). The tenant
lock, current-principal authorization, sequence allocation, effect row, and
idempotency row form one transaction boundary.

## RLS Helpers

Prefer small SQL helper functions for repeated policy conditions:

```sql
create function public.current_user_is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = target_workspace_id
      and workspace_members.profile_id = auth.uid()
      and workspace_members.status = 'active'
  );
$$;
```

Use these helpers in both RLS policies and function-side checks when a defensive duplicate check is useful.

Keep `search_path` explicit on `security definer` functions.

## Policies

For each app table, decide separately:

- Who can select?
- Who can insert?
- Who can update?
- Who can delete?

Enable RLS explicitly:

```sql
alter table public.tasks enable row level security;
```

Tenant-owned rows usually need policies like:

```sql
create policy "Members can read tasks"
on public.tasks
for select
to authenticated
using (public.current_user_is_workspace_member(workspace_id));
```

Write direct-table policies even when the UI only uses Edge Functions.

## Command-Only Column Mutations

When owners may update ordinary columns directly but one sensitive column must
only change through an authenticated command boundary, use column-level
privileges in addition to RLS. RLS update policies can check the existing row
with `using` and the proposed row with `with check`, but they are not a good
place to compare old and new values for "this column cannot change directly"
rules.

Replace broad table update grants with explicit column grants that omit the
protected column:

```sql
revoke update on public.things from authenticated;
grant update (display_name, status, updated_at) on public.things to authenticated;
```

Then expose one narrow command path for the protected write, such as a
`security definer` SQL or PL/pgSQL helper invoked from the app command handler.
That helper must set an explicit `search_path`, reject unauthenticated callers,
recheck ownership or tenant membership using `auth.uid()`, recheck any role or
entitlement required for the protected field, validate the new value, and update
only the target owned row. Do not trust caller-supplied owner, tenant, or role
fields; derive authorization from database state. Revoke helper execution from
`public` and `anon`, and grant only the narrow execute permission needed by
`authenticated`.

Keep the normal row RLS policies in place. Column privileges prevent direct
mutation of the protected field; RLS still decides which rows can be read,
inserted, updated, or deleted at all.

## Invitations

Prefer invitations as first-class pending records. Accepted/rejected invitations should usually be consumed/deleted once handled.

Do not show full tenant data to invitees until they accept and become active members. It is acceptable for invitees to read only their own invitation rows.

Invitation creation and membership activation are opposing writes. When both
tables can be written directly or by trusted code, serialize both directions
at the database boundary so a race cannot leave the same person simultaneously
active and pending. The [cross-table owner invariant](supabase-owner-invariants.md#serialize-membership-and-invitation-transitions)
shows the shared-lock and test pattern.

## Edge Functions

Use Supabase's authenticated function wrapper when available:

```ts
export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const { data, error } = await context.supabase.auth.getUser()

    if (error || !data.user) {
      throw new HttpError(401, 'Sign in before using the app.')
    }
  })
}
```

Function handlers should still validate target workspace/tenant membership before writes that are domain-sensitive. Treat this as clearer error handling and defense in depth, not as the only security layer.

For a public database-backed health or readiness function, use the narrower
[public health endpoint contract](public-health-endpoints.md). Anonymous HTTP
access does not imply that `anon` or `authenticated` may execute the underlying
health RPC directly.

## Security Integration Tests

Keep tests under `tests/integration/security`. They should run only against local Supabase.

Cover at least:

- Anonymous users cannot call business functions.
- Each Edge Function's declared path ownership is covered at the handler and
  local gateway boundaries. For a single-route function, keep an exact-path
  positive and a suffix-path negative; the unit negative must prove the
  database or effect adapter was not reached, and the gateway negative must use
  `/functions/v1/<function-name>/unexpected`. For an intentional multi-route
  function, cover every owned route class plus one unowned path instead of
  rejecting all suffixes.
- Public database-backed health endpoints remain callable without a user
  session, while direct `anon` and `authenticated` RPC calls are denied; use
  the [health endpoint test matrix](public-health-endpoints.md#validation-matrix).
- Anonymous users cannot read app tables directly.
- A browser publishable key plus a valid human JWT enters the human's
  RLS-scoped context, while the publishable key alone grants no user identity.
- A trusted backend secret reaches only its intended privileged path. Static
  artifacts, client responses, errors, metrics, and logs contain no raw secret.
- Two machine credentials map one-to-one to different principals and cannot
  read, mutate, select, or impersonate each other's data or authorization
  context.
- Invalid and revoked machine credentials fail, a replacement credential works
  after rotation, and the replaced credential remains denied.
- Invalid human JWT plus a valid machine credential, multiple principal
  credentials, and other mixed-mode downgrade attempts fail without fallback.
- Logs and errors omit raw credentials and stored digests, and denial paths
  leave business data unchanged.
- Reject any design that gives an untrusted machine a secret or legacy
  service-role key: its `BYPASSRLS` authority cannot represent that machine as
  a constrained principal.
- Authenticated users can only load tenant data they belong to through functions.
- Authenticated users can only read tenant rows they belong to through direct table access.
- Pending invitees see invitation state but not tenant rows.
- Members can perform allowed positive writes through functions.
- Members cannot create/update/delete rows outside their tenant via direct table access.
- Cleanup removes test users and rows using the local service-role key.
- For command-only protected columns, direct-table tests prove ordinary owner
  updates still work while protected-column updates fail directly, including for
  users who are entitled to use the command helper. Function or RPC tests prove
  the helper allows the entitled owner path, rejects non-entitled or cross-owner
  calls, rejects invalid values or conflicts, and leaves stored rows unchanged
  after denial.

When adding a new table or function request, update both the fixture and security assertions.
For Supabase/PostgREST array inserts in fixtures, keep every row object in the
array the same shape when the table has `not null default` columns, especially
after adding one. If one row omits a defaulted column while another row includes
it, the client can send the omitted key as `null` instead of letting the
database default apply, failing fixture setup before the security assertions
run. Either include the defaulted column consistently for every row in that
batch, or split the rows into separate inserts by shape.

Before interpreting function authorization failures, confirm `npm run get-going`
has validated each enabled function route from `supabase/config.toml`. A passing
health function alone can miss stale Edge Runtime state after adding a new
function or importing new shared function code.

### Backend-disabled public signup

Frontend capability flags can hide account creation or authentication methods, but bundled browser config is caller-controlled and cannot enforce enrolment policy. Supabase Auth must reject public signup at the backend. For email signup, disable both `auth.enable_signup` and `auth.email.enable_signup`; treating only one setting as authoritative leaves the deployment contract ambiguous.

Keep the backend-disabled check explicit and opt-in because it requires a different Auth process configuration from the ordinary signup-enabled suite. The test must call public Auth directly with the local publishable key and assert all three parts of the denial contract:

- the error code is `signup_disabled`;
- `data.user` is null;
- `data.session` is null.

Changing `supabase/config.toml` while Auth is running is not evidence that the new setting took effect. On a disposable local stack, stop the stack, change both settings to `false`, restart Auth through the local Supabase stack, and run only the opt-in denial test. Then stop the stack, restore both committed settings to `true`, restart, and rerun the ordinary signup-enabled security suite. Keep this workflow local-only and derive the public URL and key from local Supabase status rather than committing credentials.

## Local Only

Security tests should require local endpoints and keys. Never point them at production or shared test environments unless the user explicitly designs that workflow.

Before constructing a service-role admin client, load the browser test target
from its committed test config and load admin credentials only from the local
Supabase CLI status for the current project. Require both URLs to be explicit
HTTP loopback origins and to match exactly, including host spelling and port;
do not fall through to ambient `SUPABASE_URL` or service-role environment
variables. Reject hosted targets and origin mismatches before client
construction or any request.

Auth-user cleanup must paginate `listUsers` until every requested email is
found or authoritative terminal metadata proves it absent. Validate page data
and next-page metadata, reject repeated or non-advancing pages, and apply a
documented page bound that fails closed rather than pretending the collection
was exhausted. After deletion responses succeed, traverse again and fail the
test if any requested account remains. Keep later-page, malformed metadata,
no-progress, and unsuccessful-deletion controls in the starter unit suite.
