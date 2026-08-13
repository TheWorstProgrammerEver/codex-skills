# Private Supabase Realtime Broadcast Authorization

Use this reference for private Broadcast channels, receive-only availability
events, or externally minted short-lived Realtime sessions. Realtime is an
availability hint; persisted application state remains authoritative.

## Contents

- [Authorization boundary](#authorization-boundary)
- [Receive-only RLS](#receive-only-rls)
- [Private-channel checklist](#private-channel-checklist)
- [Externally minted ES256 sessions](#externally-minted-es256-sessions)
- [Least-authority token role](#least-authority-token-role)
- [Refresh, removal, and reconnect](#refresh-removal-and-reconnect)
- [Local validation matrix](#local-validation-matrix)

## Authorization Boundary

Supabase [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization)
calculates a channel's permissions when a client connects and subscribes. It
probes `realtime.messages` under the caller's JWT and requested topic, then
rolls back the authorization query. The probe row is not the database Broadcast
row that will later be delivered.

Scope a receive policy with both:

- `realtime.messages.extension = 'broadcast'`;
- an exact topic predicate based on `realtime.topic()` and current application
  membership.

Do not add `realtime.messages.private IS TRUE` to that policy. The rolled-back
join probe does not carry the delivered message's private flag, so the
additional predicate rejects valid private joins. Establish privacy through
the channel and send configuration described below.

The `realtime` schema is platform-managed and locked against ordinary schema
or helper changes. Limit migrations there to supported policies on
`realtime.messages`; put topic parsers and membership helpers in an unexposed
application schema.

## Receive-Only RLS

Use separate policies when humans and externally minted agents have different
identity resolvers. Each helper must parse one exact topic shape, reject a
malformed or missing identifier, and query current membership. A topic claim
on an agent token is an upper bound, not proof of current membership.

```sql
create policy "Human members can receive availability"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and app_realtime.human_can_receive_topic((select realtime.topic()))
);

create policy "Agent members can receive availability"
on realtime.messages
for select
to app_realtime_agent
using (
  realtime.messages.extension = 'broadcast'
  and app_realtime.agent_can_receive_topic((select realtime.topic()))
);
```

Make security-definer helpers set `search_path = ''`, fully qualify every
object, accept only the topic being authorized, and expose `EXECUTE` only to
the policy role that needs them. The human helper should bind `auth.uid()` to a
current human principal and active membership. It must also require the exact
human role and reject the dedicated Realtime token kind. The agent helper should
require the dedicated token kind, exact agent role, matching `sub` and
principal claim, a bounded topic claim, an active agent, and current
membership.

These checks must be mutually exclusive. The agent role below inherits
`authenticated`, PostgreSQL applies policies through role membership, and
permissive policies are OR-combined. Without the exact-role and token-kind
checks, an agent JWT with a human member's `sub` could satisfy the human policy
without passing the agent topic and lifecycle checks.

Create only `SELECT` policies for a receive-only Broadcast design. Do not add:

- an `INSERT` policy for Broadcast client sends;
- a `SELECT` or `INSERT` policy for Presence;
- a catch-all policy for multiple Realtime extensions;
- a policy whose topic check trusts a caller-selected tenant identifier without
  resolving current membership.

PostgreSQL policies are permissive by default, so audit every policy on
`realtime.messages`, not just the migration being added.

## Private-Channel Checklist

All four controls are required:

1. Instantiate every client channel with `config: { private: true }`.
2. Send database Broadcasts as private. Pass `true` as the private argument to
   `realtime.send(...)`; confirm equivalent helpers also use private delivery.
   Supabase requires the database send and channel privacy settings to match.
3. In the hosted project's Realtime Settings, set Channel Restrictions to
   private-only by disabling public access. Treat this dashboard setting as a
   promotion check because it is not established by a database migration.
4. Keep the policy catalog receive-only: no unintended Broadcast `INSERT` or
   Presence policy for either human or agent roles.

The official [Broadcast guide](https://supabase.com/docs/guides/realtime/broadcast)
describes the matching private send/channel flags, and the
[Realtime Settings guide](https://supabase.com/docs/guides/realtime/settings)
describes hosted Channel Restrictions.

Application broadcasts should contain only non-sensitive availability data,
for example a tenant identifier plus a committed high-watermark sequence.
Never include message bodies, prompts, application credentials, JWTs, private
JWK fields, service-role credentials, or management secrets.

Define the application-owned payload separately from the transport envelope.
For example, the application contract may own only `groupId` and
`highWatermarkSequence`, while the pinned Supabase client/Realtime version may
append an opaque delivery `id` in `payload` and `meta`. Treat that ID as
transport metadata, never as an application sequence or authorization value.
Snapshot the exact observed wire shape in a live local test and re-review it
when upgrading the client or Realtime service.

For a pinned version that adds the same opaque ID to `payload` and `meta`, keep
the distinction executable:

```ts
const { id: deliveryId, ...applicationPayload } = envelope.payload

expect(applicationPayload).toEqual({
  groupId: expectedGroupId,
  highWatermarkSequence: expectedSequence
})
expect(envelope.meta).toEqual({ id: deliveryId })
```

If the pinned transport uses a different envelope, change this assertion only
after reviewing that observed shape. Do not broaden it to accept arbitrary
extra application payload fields.

## Externally Minted ES256 Sessions

Externally minted production JWTs require private signing material that the
minting service controls. Follow Supabase's
[JWT signing-key procedure](https://supabase.com/docs/guides/auth/signing-keys):

1. Generate a P-256 key outside Supabase in a trusted environment with
   `supabase gen signing-key --algorithm ES256`. Capture it directly into an
   owner-only secret store; do not print it into logs or shell transcripts.
2. Retain the private JWK only in the trusted minting service's secret store and
   import the same key into Supabase Auth as a standby signing key. A key that
   Supabase generated cannot be extracted later and therefore cannot support
   external minting.
3. Verify the public key's `kid`, `kty`, `crv`, `x`, and `y` at
   `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`. The JWKS
   response must not contain the private `d` value.
4. Rotate the imported key into active use. Account for the platform's signing
   key state-change propagation window. Activation also changes how Supabase
   Auth signs new human sessions, so first verify every backend and Edge
   Function validator supports ES256 and current JWKS discovery. Then issue a
   short-lived probe token whose protected header uses `alg: ES256`, the
   imported `kid`, and `typ: JWT`.
5. Configure a short lifetime, an earlier refresh time, a unique token ID, the
   dedicated PostgreSQL role, the intended principal, an explicit token-kind
   discriminator, and a bounded topic list. Authorize the requested topics
   against current membership before signing.

Possession of this private key is project-wide JWT minting authority even when
the tokens it normally issues are narrowly claimed. Keep it out of browsers,
agent hosts, repositories, migrations, database rows, client-visible runtime
configuration, responses, metrics, and errors. Do not substitute the legacy
production JWT secret, a service-role/secret API key, a database password, or a
management credential.

For rotation, generate a new key outside Supabase, import it as standby, verify
its public `kid` in JWKS, activate it, switch the minting service, and prove a
new token works. Keep the old key only for the bounded overlap required by the
maximum issued token lifetime, then revoke it. Preserve a tested rollback path
until the new issuer and Supabase state are both verified.

Local development may use a local-project-only signing secret when the local
stack requires it. Keep it generated, ignored, owner-only, and impossible to
load in hosted configuration; it is not a production signing procedure.

## Least-Authority Token Role

Supabase locks ordinary grants in the `realtime` schema. A dedicated JWT role
may therefore need to inherit the platform's `authenticated` Realtime ACL:

```sql
create role app_realtime_agent
  nologin inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant app_realtime_agent to authenticator;
grant authenticated to app_realtime_agent;
```

Inheritance also makes application privileges granted to `authenticated`
reachable, so the role definition is not sufficient isolation. Use a dedicated
token-kind claim and make the canonical application principal resolver return
no principal when either that kind or the Realtime-only role is present. Use a
separate, narrowly executable Realtime policy helper for the agent join; do not
reuse the normal Data API/chat principal resolver.

Except for the narrowly scoped Realtime helper schema and function, grant the
role no direct application table, sequence, function, or schema privileges.
Keep every application-table policy, RPC, and server dispatch fail-closed when
the normal principal resolver returns no principal. For defense in depth, an
exposed table can also apply a restrictive deny to the dedicated role:

```sql
create policy "Realtime-only tokens have no application access"
on public.example_records
as restrictive
for all
to app_realtime_agent
using (false)
with check (false);
```

Audit every exposed table, view, and function, including future migrations;
security-definer views or functions can otherwise escape the intended table
RLS boundary. Do not place `service_role` or any management capability in the
JWT.

Validate the effective role rather than trusting migration text:

- catalog fields prove `NOLOGIN`, `INHERIT`, `NOSUPERUSER`, `NOCREATEDB`,
  `NOCREATEROLE`, `NOREPLICATION`, and `NOBYPASSRLS`;
- the only inherited role is `authenticated`, and `authenticator` can set the
  dedicated JWT role;
- no direct grants exist on exposed application tables or functions;
- a database test under representative JWT claims proves the canonical
  application principal resolver returns no principal;
- an agent-role/token-kind JWT whose `sub` deliberately equals a human member's
  Auth user ID still fails the human helper and private join;
- live Data API reads expose no rows, writes fail, application RPCs fail, and
  the canonical chat/function endpoint rejects the same token.

Catalog evidence is necessary but cannot replace the live denial checks.

## Refresh, Removal, and Reconnect

Realtime caches authorization for the connection. It rechecks when a client
connects and subscribes or sends a new JWT with the `access_token` protocol
message. The Supabase JavaScript client exposes this through
[`realtime.setAuth`](https://supabase.com/docs/reference/javascript/setauth).
Choose callback-managed or explicit-token mode deliberately and test the mode
used by the app.

Refresh before expiry. A refreshed credential must re-authorize the principal
and requested topics against current application state before signing. On
refresh failure, remove the affected channels and reconnect only after a new
authorized session; do not silently keep retrying an old token.

Start with a five-minute token lifetime and refresh about one minute early,
then shorten either window when the threat model requires it. Test the selected
values rather than treating them as documentation-only configuration.

Removal semantics have two distinct guarantees:

- A fresh session, subscription, or reconnect after removal is denied
  immediately because it evaluates current membership.
- A connection authorized before removal can retain cached policy state until
  a new JWT, reconnect, or token expiry. Bound that residual window with short
  token lifetimes and ensure every possible residual event is metadata-only.

After initial connect, refresh, reconnect, a sequence gap, or an availability
event, fetch persisted application context through the normal authorized query
path starting after the last trusted sequence/watermark. Deduplicate and order
by the persisted sequence. Never treat event delivery, arrival order, replay,
or the opaque delivery ID as authoritative state.

## Local Validation Matrix

Run against a disposable local Supabase project after a clean reset and
database lint. Use real Supabase clients and real private Realtime WebSocket
joins; policy catalog inspection or direct helper calls alone do not exercise
join authorization, token transport, caching, or wire shape.

A minimal subscription helper must instantiate the channel privately and
observe the actual status:

```ts
const channel = client
  .channel(topic, { config: { private: true } })
  .on('broadcast', { event: availabilityEvent }, observe)

channel.subscribe((status) => settle(status))
```

Bound subscriptions and event waits with timeouts, fail if a positive path does
not reach `SUBSCRIBED`, require every denial not to reach `SUBSCRIBED`, and
remove channels plus disconnect clients in `finally` cleanup.

When humans and agents use separate helpers or policies, cross both paths. An
agent denial is not evidence that the human policy denies the same case.

| Principal path | Live scenario | Required proof |
| --- | --- | --- |
| Human | Active member | Private join reaches `SUBSCRIBED` and receives one database-sent availability event. |
| Human | Outsider and pending invitee | Each fresh private join is denied. |
| Human | Cross-topic and post-removal fresh client | First prove an allowed join; then prove each unauthorized fresh join/reconnect is denied. |
| Human | Client send | Broadcast send fails because no client `INSERT` policy exists. |
| Agent | Active member with bounded topic claim | Private join reaches `SUBSCRIBED` and receives the same metadata-only event. |
| Agent | Missing claim, cross-topic, inactive agent, and removed membership | Each fresh private join is denied even if another topic was allowed. |
| Agent | Human-subject confusion | A dedicated-role/token-kind JWT whose `sub` is a human member's Auth user ID is denied by the human helper and live join. |
| Agent | Refresh and reconnect | A new authorized token works through the configured refresh mode; refresh/session issuance and a fresh reconnect fail immediately after removal. |
| Agent | Client send | Broadcast send fails because no client `INSERT` policy exists. |
| Agent | Data API and chat isolation | Table reads expose no rows; writes, application RPCs, principal resolution, and the canonical business endpoint are denied. |
| Agent | Expiry | A connection that never receives a replacement JWT disconnects after the short token expiry. |
| Both | Exact wire shape | Application fields equal the reviewed metadata-only contract; only the pinned transport's documented opaque metadata is additional. No content or credential sentinel appears. |
| Removed connection | Cached residual | A fresh connection is denied. If the already-authorized connection receives an event before refresh/expiry, it contains only the exact metadata contract. |

Also assert the database sender passes the private flag, the hosted promotion
check records private-only Channel Restrictions, and the policy catalog
contains only the intended Broadcast `SELECT` policies. Scan committed files,
test output, logs, and captured envelopes for message-content sentinels,
application keys, JWT-shaped values, private JWK material, service-role
credentials, and management secrets.
