# Serialized Tenant Writes

## Contents

- [Model one state transition](#model-one-state-transition)
- [Use one authoritative lock order](#use-one-authoritative-lock-order)
  - [Separate lock acquisition from authorization reads](#separate-lock-acquisition-from-authorization-reads)
- [Keep the effect append-only](#keep-the-effect-append-only)
- [Direct and catalog regression matrix](#direct-and-catalog-regression-matrix)
- [Deterministic concurrency regressions](#deterministic-concurrency-regressions)
  - [Mutation-check the unsafe shortcuts](#mutation-check-the-unsafe-shortcuts)

Use this pattern for an append-only tenant effect that needs a gap-free
monotonic sequence among committed rows and replay-safe caller retries. Typical
examples are event streams, audit records, outbox entries, and ledger-like
writes.

A unique `(tenant_id, sequence)` constraint is a backstop, not an allocator.
An idempotency lookup is not safe when it runs outside the allocator's
serialization boundary. Both properties must share one authoritative tenant
row lock and one database transaction.

## Model One State Transition

Keep these responsibilities explicit, adapting names to the product:

| Relation | Responsibility | Required database contract |
| --- | --- | --- |
| tenants | Serialization root and last committed local sequence | One stable row per tenant; nonnegative counter |
| memberships | Current actor access to the tenant | Unique tenant/actor membership; active state represented directly |
| effects | Immutable durable outcome | Unique `(tenant_id, sequence)`; actor foreign key; payload constraints |
| idempotency keys | Maps one caller request namespace to one outcome | Unique `(tenant_id, actor_id, client_key)`; foreign key to the tenant-owned effect |

Scope an idempotency key across every independently reusable namespace. At a
minimum that normally means tenant, authenticated actor, and client-generated
key. Do not use a globally unique client key when two actors or tenants should
be able to choose the same value independently.

Derive `actor_id` from the current authenticated database context. A callable
function must not accept the actor as a request parameter, and a trusted
handler must not convert an unverified actor claim into database identity.
Resolve a human or machine principal through the application's canonical
current-principal helper and fail closed when it returns no unique active
principal.

Store enough request identity to distinguish a retry from conflicting key
reuse. Prefer comparing the canonical persisted payload columns to the new
validated payload. A digest can be an index aid, but a digest match alone must
not authorize replay unless the chosen collision and canonicalization contract
is explicitly strong enough for that decision.

Use declarative constraints even though the command serializes writes:

- `unique (tenant_id, sequence)` on effects;
- a unique `(tenant_id, actor_id, client_key)` constraint on idempotency rows,
  normally the primary key;
- a unique idempotency reference per effect when each effect has exactly one
  request key;
- a composite foreign key from `(tenant_id, effect_id)` to an effect key such
  as `(tenant_id, id)`, so a key cannot name another tenant's row;
- exact nonblank and length checks for client keys and payload fields; and
- `on delete cascade` from the tenant to tenant-owned effects and keys, and
  from the effect to its key when that expresses the ownership lifecycle.

Keep actor deletion restricted when history must retain its author. Do not
silently erase or rewrite an immutable effect because an actor is removed.

## Use One Authoritative Lock Order

Implement the write as one SQL or PL/pgSQL command. A `security definer`
function must have an empty explicit `search_path`, schema-qualify every object,
validate bounded inputs, and revoke its default `PUBLIC` execution grant.

Within the command, use this order:

1. Require authenticated database context and validate the tenant identifier,
   client key, and payload limits before attempting durable writes. Treat any
   early principal lookup as a non-authoritative preflight only.
2. In a statement containing only the serialization-root lookup, select the
   authoritative tenant row `FOR UPDATE`. Reject a missing tenant.
3. In a fresh statement after the lock is held, resolve the current actor again
   from authenticated database identity. Reject a missing, ambiguous, inactive,
   or no-longer-linked principal.
4. In another new statement after the lock is held, require a current active
   membership for the derived actor and tenant.
5. Under the same lock, look up `(tenant_id, actor_id, client_key)` and join it
   to its durable effect. If it exists and the canonical payload is identical,
   return that original row without updating it. If the payload differs, raise
   a stable conflict such as SQLSTATE `unique_violation`.
6. If no key exists, increment and return the tenant counter, insert the effect
   with that sequence and derived actor, then insert the idempotency row.
7. Return the just-inserted durable effect through the same result projection
   used by the retry path.

The counter update, effect insert, key insert, and returned row belong to the
same transaction. Do not call them through separate PostgREST requests. An
error at any later step must roll back the counter and every partial row, so a
retry can reuse the next committed sequence.

Every operation that can revoke or change membership must acquire the same
tenant row `FOR UPDATE` before changing authorization state. If another
invariant requires a principal or secondary row lock, define one global order
and follow it in the write and every membership transition. A sequence command
that locks tenant then principal cannot coexist safely with a transition that
locks principal then tenant.

### Separate lock acquisition from authorization reads

PostgreSQL `READ COMMITTED` takes a fresh snapshot for each statement, not for
each joined relation after a lock wait. Do not combine the tenant lock and
membership authorization into one joined `SELECT ... FOR UPDATE`.

If the tenant row itself is unchanged, a joined statement can resume after
waiting and still authorize from membership data visible to that statement's
pre-wait snapshot. A transaction that deleted the membership while holding the
tenant lock may already have committed.

Acquire the tenant lock in one statement. Only after it returns, re-resolve the
current principal and issue a separate membership query. PL/pgSQL statements
naturally create this boundary under `READ COMMITTED`; a client-managed
transaction must send distinct SQL statements. Keep both post-lock
authorization reads inside the same transaction and before the idempotency
lookup. A formerly authorized actor must not replay an earlier key after losing
membership unless the product explicitly defines a separate read-only replay
capability.

## Keep The Effect Append-only

Give ordinary `anon` and `authenticated` callers no direct `INSERT`, `UPDATE`,
or `DELETE` privilege on the effect or idempotency tables. Grant only the
narrow command's `EXECUTE` privilege to roles that can represent a principal.
RLS remains required on both tables even when table grants currently deny a
path; policies should expose only the intended tenant-filtered effect reads.
Idempotency rows normally need no ordinary read policy.

Do not add edit, delete, counter-reset, or key-reassignment RPCs merely because
the command is a definer. Preserve immutability with privileges, the absence of
rewrite commands, and database constraints. If defense against trusted direct
writes is required, add narrow triggers that reject effect updates and direct
deletes.

A deliberate parent-owned lifecycle is compatible with append-only callers.
The tenant foreign key may cascade deletion through effects and idempotency
rows while ordinary callers remain unable to delete either child directly.
Test the parent cascade as its own positive operation and ensure no service-role
or session flag acts as a forgeable delete exception.

## Direct And Catalog Regression Matrix

Run the matrix against a disposable local Supabase database. Use direct
PostgreSQL sessions for transaction and lock control, authenticated Supabase
clients for the callable boundary, and an administrative client only for
fixtures and complete postcondition reads. Clean every tenant, actor, Auth
user, request row, connection, observer, and injected test object in `finally`.

Cover at least:

| Scenario | Required evidence |
| --- | --- |
| Distinct concurrent sends | Every call succeeds; returned and stored sequences are exactly `1..N`; IDs and keys are unique; counter equals `N` |
| Many identical retries | Every call succeeds with the byte-equivalent original result; exactly one effect and one key exist; the counter advances once |
| Same key, different actor | Both writes succeed independently and name their database-derived actors |
| Same actor and key, different tenant | Both writes succeed independently with tenant-local sequence `1` |
| Same scoped key, different payload | Stable conflict; original row, key, counter, and payload remain unchanged |
| Invalid or over-limit key/payload | Exact validation error; no counter, effect, or key residue |
| Failure after allocation | Inject a constraint or trigger failure after the counter update; prove the counter, effect, and key all roll back, then prove a valid retry receives the unconsumed sequence |
| Missing, pending, removed, or cross-tenant actor | Denial through the command and no durable residue |
| Ordinary direct mutation | Direct insert, update, delete, idempotency read, and key write are denied |
| Parent deletion | Tenant-owned effects and keys cascade together; actor history rules remain intact for surviving tenants |

Catalog assertions must verify:

- RLS is enabled on effects and idempotency keys;
- only the intended tenant-filtered effect read policies exist;
- ordinary roles lack direct effect mutation and all key-table privileges;
- the command is `security definer`, has the exact empty `search_path`, and is
  executable only by intended roles;
- unique sequence, scoped-key, composite ownership, actor, limits, and cascade
  constraints have the expected definitions; and
- no ordinary effect rewrite RPC exists.

For every denial or injected failure, query the tenant counter, effects, and
keys afterward. An error response alone does not prove atomic rollback.

## Deterministic Concurrency Regressions

Do not use elapsed time or a sleep as evidence that a race occurred. Give each
direct PostgreSQL connection a unique `application_name`. Start the losing
statement without awaiting it, then use a third observer connection to poll
`pg_stat_activity` until its `wait_event_type` is `Lock`. Bound the observer
poll with an independent timeout and assert the losing promise is still
unsettled before releasing the winner.

For the post-lock authorization regression:

1. Create an active actor membership.
2. In one transaction, take the tenant transition lock and delete the
   membership without committing.
3. Start the actor's append command and prove its session is waiting on a lock.
4. Commit the removal.
5. Require the queued command to fail authorization.
6. Reread the tenant counter, effects, and keys and require no residue.

Await or cancel every pending query before rollback and connection cleanup so a
failed assertion cannot leak a blocked session into later tests.

### Mutation-check the unsafe shortcuts

A concurrency test is credible only when it rejects the shortcuts it is meant
to prevent. In a disposable database, replace the command with each unsafe
variant and require the focused regression to fail before accepting the
protected implementation:

1. **Unlocked allocator or `max(sequence) + 1`:** coordinate sessions after
   they read the same prior value and before insertion. On release, the
   distinct-send regression must observe duplicate allocation, a unique
   conflict, missing results, or a non-contiguous committed result instead of
   reporting full success.
2. **Idempotency lookup before the tenant lock:** coordinate identical callers
   after every lookup misses and before they attempt the lock. On release, the
   retry regression must expose a conflict, duplicate attempt, or non-identical
   response instead of coalescing every call to the original durable row.
3. **Joined lock and membership authorization:** use the committed-removal race
   above. The unsafe statement must admit the removed actor or otherwise fail
   the denial-and-zero-residue assertion because it authorized from the
   pre-wait snapshot.

For the first two mutations, use an explicit test-only barrier rather than a
timing window. One workable direct-PostgreSQL design has each instrumented
unsafe function hold a shared advisory "arrived" lock after the stale read,
then wait on a second advisory gate held by the controller. The observer waits
until every expected session holds the arrival lock before the controller
releases the gate. Remove the instrumented function and all advisory locks in
`finally`.

Keep unsafe SQL variants in test fixtures or generated disposable migrations,
never in the production migration history. The protected implementation must
pass the complete scenario and catalog matrix after every mutation is removed.
