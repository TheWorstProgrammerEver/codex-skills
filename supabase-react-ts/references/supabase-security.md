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

When adding a new table or function request, update both the fixture and security assertions.

## Local Only

Security tests should require local endpoints and keys. Never point them at production or shared test environments unless the user explicitly designs that workflow.
