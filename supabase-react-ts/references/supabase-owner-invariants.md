# Cross-table Supabase Owner Invariants

Use this pattern when one tenant has exactly one human owner and ownership is
represented across a tenant row, a principal row, and a membership row. RLS is
not the enforcement boundary: secret or legacy service-role clients bypass
RLS, while constraints and triggers still protect the data.

The invariant is one state contract:

- every tenant has one non-null `owner_principal_id`;
- that principal exists, is human, and retains its required Auth link;
- exactly one active membership for the tenant has role `owner`;
- that owner membership names the tenant's `owner_principal_id`;
- no pending invitation exists for an active human member; and
- deleting the tenant may still cascade through its memberships and pending
  invitations.

Do not treat any one column or trigger as the complete invariant. Every table
that can invalidate the state needs a database-level guard.

## Model Live State Directly

Use role-neutral product names, but keep these responsibilities separate:

| Relation | Live-state responsibility | Baseline enforcement |
| --- | --- | --- |
| principals | Human or machine identity and optional Auth link | Primary key; checks that distinguish human and machine shapes |
| tenants | Authoritative owner reference | Non-null foreign key with principal deletion restricted |
| memberships | Active tenant access only | Unique tenant/principal pair and role check or enum |
| invitations | Pending access only | Unique normalized tenant/email pair |

Use a partial unique index on `(tenant_id) where role = 'owner'` to prevent a
second owner membership. That proves *at most one*, not that an owner row
exists or matches the tenant owner. Create the matching owner membership
automatically in the tenant-insert transaction and validate the whole tuple at
the database boundary.

An accepted or rejected invitation should normally be deleted. Acceptance
creates an active membership and consumes the pending invitation atomically;
rejection consumes the invitation without creating a membership. If an audit
history is required, record a separate immutable event rather than retaining
accepted/rejected invitation rows or inactive pseudo-members in the live
authorization tables.

## Prefer Declarative Constraints Where They Fit

Use non-null constraints, ordinary foreign keys, unique constraints, checks,
and a partial unique owner index before adding triggers. Declarative
constraints apply to every writer and PostgreSQL already gives them
transaction-safe concurrency semantics.

A composite foreign key can express the exact tenant-to-owner-membership link
when the schema can expose the complete tuple. For example, a tenant tuple
`(id, owner_principal_id, owner_role)` can reference a non-partial unique key on
`memberships (tenant_id, principal_id, role)`, with `owner_role` constrained to
the constant `owner`. Because the membership also references its tenant, this
is a circular insertion dependency: make the tenant-to-membership foreign key
`DEFERRABLE INITIALLY DEFERRED`, create both rows in one transaction, and test
tenant deletion with the chosen deferred `NO ACTION` and child `ON DELETE
CASCADE` behavior. The referenced unique constraint itself must be suitable as
a PostgreSQL foreign-key target; the partial one-owner index alone is not.

Prefer this shape when the redundant constant column and deferred cycle make
the ownership relation clearer. Use triggers when the invariant depends on a
predicate that a foreign key cannot express cleanly, such as principal kind,
Auth-link shape, automatic row creation, invitation email resolution, or a
deliberate parent-cascade exception. Do not replace an available declarative
constraint with an unlocked trigger read.

## Guard Every Ownership Write Surface

Keep trigger functions narrow, schema-qualify every referenced object, and use
an empty explicit search path:

```sql
create function app_private.enforce_tenant_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Refer only to app.principals, app.tenants, and other qualified objects.
  return new;
end;
$$;

revoke all on function app_private.enforce_tenant_owner() from public;
revoke all on function app_private.enforce_tenant_owner() from anon, authenticated;
```

Trigger functions do not need direct caller execution grants. For callable
helpers, revoke the default `PUBLIC` grant and grant `EXECUTE` only to the role
that owns the narrow command boundary. Keep the function owner unexposed and
avoid granting broad table privileges merely because the function is a
definer. These triggers must reject invalid secret/service-role writes as well
as ordinary authenticated writes.

Cover each direction:

1. Before tenant insert or owner validation, lock the proposed principal row
   `FOR SHARE`, then require its kind to be human and its Auth link to be
   present. This lock conflicts with identity-changing updates.
2. After tenant insert, create exactly one membership using the inserted
   tenant ID, `owner_principal_id`, and role `owner`. If ownership transfer is
   not a supported command, reject changes to the tenant owner reference.
3. Before a principal kind or Auth-link update, protect the invariant attached
   to `OLD.id`: if that principal owns any tenant, reject conversion, unlinking,
   or relinking. Principal deletion remains restricted by the tenant foreign
   key.
4. Before membership insert or update, lock the proposed tenant row `FOR
   UPDATE`, then require role `owner` if and only if the membership principal
   equals the tenant owner.
5. Before owner-membership update or delete, protect the invariant attached to
   the old row. A valid-looking `NEW` row does not repair the tenant that the
   old owner row would abandon.

The old-row update check must compare all identity-bearing columns before
validating the proposed target:

```sql
if tg_op = 'UPDATE'
  and old.role = 'owner'::app.membership_role
  and (
    new.tenant_id is distinct from old.tenant_id
    or new.principal_id is distinct from old.principal_id
    or new.role is distinct from old.role
  ) then
  raise exception 'The tenant owner membership cannot be changed.'
    using errcode = 'check_violation';
end if;
```

This denies one-statement re-home-and-demote attempts even when `NEW` is a
valid ordinary membership in another tenant. If ownership transfer is later
supported, implement one serialized command that replaces and validates the
old and new owner tuples atomically; do not weaken the raw-row guards.

### Preserve the parent-delete cascade deliberately

An ordinary delete of the active owner membership must fail. A delete invoked
by the tenant foreign key's `ON DELETE CASCADE` must succeed. In the membership
delete trigger, allow the owner row to disappear only when a schema-qualified
lookup proves its parent tenant row is already absent to the deleting
statement; otherwise raise `check_violation`.

Do not use `session_replication_role`, a caller-set flag, trigger depth, or a
service-role exception to identify the cascade. Those mechanisms can suppress
or forge the guard. Keep tenant IDs immutable so an update cascade cannot
accidentally enter the delete exception, and test parent deletion separately.

## Serialize Every Opposing Write Direction

Cross-table validation must define a shared lock key and order. An unlocked
`exists` query can let two transactions validate different snapshots and both
commit an invalid combined state.

Use these serialization roots when triggers are required:

- **Owner eligibility:** the principal row is the lock key. Tenant creation
  takes `FOR SHARE`; a principal identity update already takes a conflicting
  row lock before its trigger checks whether the old principal owns a tenant.
  Whichever transaction arrives second waits and then validates committed
  state.
- **Membership and invitation state:** the tenant row is the lock key. Every
  membership insert/update and invitation insert/update locks it `FOR UPDATE`
  before reading or changing the opposing table.

If one path must acquire both keys, choose one global order and use it in every
trigger and helper. Never let one path lock tenant then principal while another
locks principal then tenant. Keep lock queries schema-qualified and verify the
row exists rather than treating a null `SELECT INTO` result as valid.

### Serialize membership and invitation transitions

After locking the tenant, an active human membership insert resolves the
principal's normalized Auth email and deletes any matching pending invitation
in the same transaction. After taking the same lock, invitation insertion
rejects a normalized email that already resolves to an active human
membership. This gives both arrival orders one final state:

- invitation first, membership second: membership waits if necessary, becomes
  active, and consumes the committed invitation;
- membership first, invitation second: invitation waits if necessary,
  re-evaluates the committed membership, and fails.

Do not split membership creation and invitation consumption across separate
PostgREST calls or Edge Function transactions. Put the transition in one SQL
function or enforce it with the reciprocal database triggers above.

## Direct Database Regression Matrix

Use a disposable local Supabase database and an administrative fixture. The
fixture must bypass RLS so the test proves constraints and triggers—not policy
denial—protect trusted writes. Prefer direct PostgreSQL connections when a test
needs transaction control. Clean every created tenant, principal, membership,
invitation, Auth user, connection, and observer in `finally`.

For every denied write, assert the SQLSTATE and then reread all affected rows;
an error alone is insufficient. Cover at least:

| Mutation | Required postcondition |
| --- | --- |
| Insert a second owner membership | Exactly one owner remains and it matches the tenant owner |
| Demote or delete the owner membership | The original owner row is unchanged |
| Change owner membership principal | The original owner row is unchanged |
| Change tenant, principal, and role together | The old tenant still has its exact owner row; the proposed tenant gained no row or owner |
| Convert an owning human principal to a machine kind | Principal identity and owner state are unchanged |
| Null or change the owning principal's Auth link | Principal identity and owner state are unchanged |
| Create a tenant owned by a machine principal | No tenant or automatic membership was created |
| Add membership for a pending invitee | Membership exists and the invitation was consumed atomically |
| Invite an existing active human member | Invitation is absent after denial |
| Delete the parent tenant | Tenant, owner membership, other memberships, and pending invitations are all absent |

Also prove the positive baseline: tenant insertion for an eligible human
automatically creates one matching owner membership, ordinary non-owner
memberships remain allowed for supported principal kinds, and rejecting an
invitation consumes it without creating a membership.

## Deterministic Two-session Regressions

Do not use timing sleeps as evidence of serialization. Give each PostgreSQL
connection a unique `application_name`, start the losing statement without
awaiting it, and use a third observer connection to poll
`pg_stat_activity.wait_event_type` until it reports `Lock`. Bound that poll
with an independent timeout and assert the losing promise is still unsettled.
Only then commit the winning transaction and await the loser.

Exercise both owner orderings:

1. Hold an uncommitted human-to-machine principal conversion; start tenant
   creation for that principal; prove creation waits, then commit conversion.
   Creation must re-evaluate, fail, and leave no tenant or owner membership.
2. Hold uncommitted eligible-human tenant creation; start conversion of its
   owner principal; prove conversion waits, then commit creation. Conversion
   must re-evaluate, fail, and preserve the human principal and owner tuple.

Exercise both invitation/member orderings against the same tenant and email:

1. Hold an uncommitted invitation; start membership insertion; prove it waits,
   then commit the invitation. Membership succeeds and consumes the invitation.
2. Hold an uncommitted membership; start invitation insertion; prove it waits,
   then commit the membership. Invitation re-evaluates, fails, and remains
   absent.

After each race, query the complete principal/tenant/membership/invitation
state. Await or cancel every pending query before rolling back and closing
connections so a failed assertion cannot leak a blocked session into later
tests.
