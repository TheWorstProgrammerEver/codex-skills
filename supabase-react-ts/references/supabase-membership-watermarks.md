# Membership Read Watermarks

## Contents

- [Own the boundary through membership](#own-the-boundary-through-membership)
- [Advance only through committed sequences](#advance-only-through-committed-sequences)
- [Compose unread state with reconnect cursors](#compose-unread-state-with-reconnect-cursors)
- [Serialize reads with membership removal](#serialize-reads-with-membership-removal)
- [Protect the database boundary](#protect-the-database-boundary)
- [Security and concurrency matrix](#security-and-concurrency-matrix)
  - [Mutation-check unsafe alternatives](#mutation-check-unsafe-alternatives)

Use this pattern for exact read, unread, acknowledgement, delivery, or
processing state over a tenant-scoped ordered stream. Typical consumers include
chat members, notification recipients, feed subscribers, job workers, and
agents resuming after disconnect.

This pattern assumes the stream already has a committed monotonic sequence.
Use the [serialized tenant write pattern](supabase-serialized-writes.md) for
tenant locking, gap-free sequence allocation, and idempotent append retries.
When a different list uses a multi-column keyset, preserve its complete tuple
with the
[exact keyset cursor contract](../../coding-style/references/general-implementation.md#preserve-exact-keyset-cursor-tuples).
Do not duplicate either contract in the watermark implementation.

## Own The Boundary Through Membership

A watermark is the greatest sequence this active membership has durably
acknowledged. It is not a timestamp and not a free-standing user/tenant
preference. Model one optional watermark row per membership:

```sql
create table public.membership_read_watermarks (
  membership_id uuid primary key
    references public.memberships(id) on delete cascade,
  sequence bigint not null check (sequence >= 0),
  updated_at timestamptz not null default clock_timestamp()
);
```

The membership foreign key is the ownership boundary. Removing the membership
deletes its watermark. Deleting the tenant or group must delete memberships,
which removes watermarks transitively. Do not preserve a removed member's
watermark for a later membership row unless the product deliberately defines
and authorizes that separate history.

Choose the new-membership baseline explicitly. Sequence `0` means existing
stream history is unread; initializing to the tenant's current committed high
watermark means only future appends are unread. Whichever policy is selected,
store or derive it at membership activation under the same tenant transition
lock. An absent watermark must have exactly one documented meaning.

Use sequences rather than `created_at` because clocks can repeat, move, or have
less precision than the database order. A timestamp cannot identify an exact
position when two effects share a time or a later sequence carries an equal or
earlier timestamp.

## Advance Only Through Committed Sequences

An acknowledgement is an idempotent greatest-value transition. After deriving
the current membership and validating that the requested sequence belongs to
the tenant's committed stream, upsert with:

```sql
insert into public.membership_read_watermarks (membership_id, sequence)
values (caller_membership_id, requested_sequence)
on conflict (membership_id) do update
set sequence = greatest(
  membership_read_watermarks.sequence,
  excluded.sequence
),
updated_at = case
  when excluded.sequence > membership_read_watermarks.sequence
    then clock_timestamp()
  else membership_read_watermarks.updated_at
end
returning sequence;
```

Return the stored greatest sequence, not the caller's requested value. Repeated,
concurrent, or out-of-order marks then converge on one boundary and an older
request cannot reopen acknowledged work. Reject a requested sequence above the
tenant's committed high watermark or one that does not belong to that tenant.

A successful sender must not see its own appended effect as unread. Advance
the sender's membership through the newly allocated sequence inside the same
database transaction as the append, after membership authorization and
sequence allocation. An `AFTER INSERT` trigger can participate in that same
transaction, but the append must roll back if sender membership resolution or
watermark advancement fails. Do not acknowledge in a later client request:
the append could commit while the separate mark is lost.

A single contiguous watermark means sender advancement also acknowledges every
earlier sequence. Make that product rule explicit. If the sender's new effect
must be excluded while earlier effects remain unread, use per-effect receipts
or another read-state model instead of claiming that one watermark can express
both states.

For a gap-free, immutable stream produced by the serialized write pattern, an
exact unread count is:

```sql
greatest(tenant.last_committed_sequence - coalesce(watermark.sequence, 0), 0)
```

If committed sequences can contain gaps or effects can be removed
independently, subtraction is not exact. Count the visible stream rows whose
sequence is greater than the watermark instead, or repair the stream contract;
never label an approximate counter as exact unread state.

## Compose Unread State With Reconnect Cursors

The durable watermark and a caller's pagination or reconnect cursor are
different boundaries. After locking and reauthorizing the membership, compute:

```sql
effective_sequence := greatest(
  coalesce(stored_watermark_sequence, membership_baseline),
  coalesce(after_sequence, membership_baseline)
);
```

Fetch strictly where `stream.sequence > effective_sequence`, ordered by
sequence ascending, with a positive bounded page size. Build the next cursor
from the actual final returned sequence and serialize large database integers
losslessly, commonly as canonical decimal strings. Validate that a supplied
cursor is nonnegative and not beyond the tenant's committed high watermark
before querying.

This composition provides two independent guarantees:

- a newer page cursor continues forward without repeating prior page items;
- a newer durable acknowledgement dominates an older reconnect cursor, so
  reconnect cannot reopen already acknowledged items.

An append committed between pages appears on a later forward page without
duplicating or skipping the earlier committed sequences. If the product needs
one immutable snapshot instead, carry a separately validated upper high
watermark and bound every page by it; do not overload the read watermark or
continuation cursor with that meaning.

## Serialize Reads With Membership Removal

When append and membership transitions share a tenant or group row lock,
protected message reads, unread reads, and acknowledgement commands must join
that serialization order:

1. Validate request shape and authenticated context without treating an early
   membership lookup as authoritative.
2. Acquire the tenant row in a statement containing only the lock lookup. A
   compatible read lock such as `FOR SHARE` may run concurrently with other
   protected readers while conflicting with membership mutation's `FOR UPDATE`.
3. After the lock returns, resolve the current principal again when applicable
   and query the active membership in a fresh statement.
4. Only then read or update the membership-owned watermark and query effects.

Under PostgreSQL `READ COMMITTED`, a statement can keep its pre-wait snapshot.
Do not combine the tenant lock and membership authorization in one joined
`SELECT ... FOR SHARE`. A read queued behind committed membership removal must
resume, recheck a fresh statement, and fail before returning tenant data or
creating watermark state.

Apply one global lock order to append, membership activation/removal, protected
reads, and acknowledgements. If a workflow takes additional principal or
secondary locks, every path must take them in the same order.

## Protect The Database Boundary

Watermark tables need RLS even when ordinary roles currently lack direct write
privileges. Permit a member to select only the row owned by their current
membership when direct read state is part of the product API. Prefer no direct
`INSERT`, `UPDATE`, or `DELETE` privilege for `anon` or `authenticated`; expose
one narrow acknowledgement command that rechecks authentication, membership,
tenant ownership of the requested sequence, and the lock order above.

A `security definer` command must use an empty explicit `search_path`, fully
qualify objects, revoke default `PUBLIC` execution, and grant execution only to
roles that can represent a principal. Denial paths must leave the watermark and
stream unchanged. RLS and grants must also prevent a caller from choosing
another membership id, moving state across tenants, or recreating state after
membership removal.

## Security And Concurrency Matrix

Run this matrix against a disposable local Supabase database. Use authenticated
clients for public boundaries, administrative reads only for complete
postconditions, and direct PostgreSQL sessions for deterministic lock control.

| Scenario | Required evidence |
| --- | --- |
| Initial exact unread state | The documented membership baseline yields the exact ordered results and count; the sender's own successful append is already acknowledged through its allocated sequence |
| Sequential and repeated acknowledgement | Marks through `2`, `5`, `5`, then `3` return and store `2`, `5`, `5`, then `5`; only sequences greater than `5` remain unread |
| Controlled out-of-order acknowledgements | Hold a mark through `5` before commit, start a mark through `3`, prove the older mark waits on the watermark row, then release `5`; the queued call returns and stores `5`, and a concurrent fan-out such as `1, 5, 3, 2, 4` also converges on `5` |
| Reconnect catch-up | With a durable watermark at `4` and a stale reconnect cursor at `2`, return only sequences greater than `4`; with a newer cursor at `6`, return only sequences greater than `6` |
| Append during pagination | Page forward from sequence `0`, commit a new append between pages, then continue from each returned sequence cursor; every committed sequence appears exactly once in order |
| Sender advancement | Append as a member and immediately query unread state; the appended sequence is not returned, and an injected watermark failure rolls back the append and sequence allocation |
| Membership removal race | Hold membership removal after it takes the tenant transition lock, start each protected read and acknowledgement, prove each session waits, commit removal, then require denial and zero returned or created read state |
| Membership cascade | Delete one membership and prove exactly its watermark disappears while another membership and watermark in the tenant remain |
| Tenant cascade | Delete the tenant/group and prove memberships and their watermarks disappear transitively without a direct child-delete capability |
| Missing, removed, anonymous, or cross-tenant caller | Every unread, context, direct-table, and acknowledgement path denies access and leaves stream and watermark rows unchanged |
| Catalog boundary | The membership cascade, nonnegative sequence, RLS, grants, policy predicates, function `search_path`, and execution grants match the documented contract |

For each lock race, give sessions unique `application_name` values. Start the
losing operation without awaiting it, use an observer to require
`pg_stat_activity.wait_event_type = 'Lock'`, and assert the promise remains
unsettled before committing the winner. Await or cancel every query and close
every client in `finally`; elapsed sleeps alone are not race evidence.

### Mutation-check unsafe alternatives

Require the focused scenarios above to fail against each disposable unsafe
variant before accepting the protected implementation:

1. **Timestamp watermark:** replace the sequence boundary with `created_at`,
   then use two committed effects with the same timestamp and a later sequence
   with an equal or earlier timestamp. The initial exact unread or reconnect
   assertion must skip, duplicate, or miscount at least one effect.
2. **Regressing upsert:** replace `greatest(current, requested)` with direct
   assignment. The sequential `5` then `3` case or controlled concurrent
   completion must store `3` and fail the non-regression assertion.
3. **Cursor-only reconnect:** ignore the stored watermark and query only after
   the caller cursor. The stale cursor `2` with durable watermark `4` must
   wrongly reopen sequences `3` and `4` and fail reconnect catch-up.
4. **Joined lock and membership read:** authorize membership in the same
   statement that waits for the tenant lock. The queued-behind-removal test must
   expose data, create state, or otherwise fail denial after removal commits.

Keep unsafe functions or migrations test-only and remove them in `finally`.
Rerun the complete protected matrix after restoration.
