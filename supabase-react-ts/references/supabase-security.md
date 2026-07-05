# Supabase Security

Use this before changing migrations, RLS policies, direct table access, function auth, or security tests.

## Security Model

Assume malicious users can:

- inspect bundled frontend code
- use the publishable Supabase key
- call Edge Functions directly
- query/insert/update/delete tables directly through Supabase APIs

Therefore:

- Edge Functions must require authenticated users.
- Database tables must have Row Level Security enabled.
- RLS must protect direct table access independently of function code.
- Security tests must exercise both functions and direct table access.

## Schema Pattern

The starter models multi-tenant access with:

- `profiles`: one row per auth user
- `workspaces`: tenant/group boundary
- `workspace_members`: active membership and invited member state
- `workspace_invitations`: first-class pending invitations
- domain tables such as `tasks` with `workspace_id`

Adapt names to the product, but keep a clear tenant boundary column on tenant-owned tables.

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

## Security Integration Tests

Keep tests under `tests/integration/security`. They should run only against local Supabase.

Cover at least:

- Anonymous users cannot call business functions.
- Anonymous users cannot read app tables directly.
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

## Local Only

Security tests should require local endpoints and keys. Never point them at production or shared test environments unless the user explicitly designs that workflow.
