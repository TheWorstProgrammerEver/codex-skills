# Public Database-backed Health Endpoints

Use this for a public Supabase Edge Function that must prove a fixed database
operation is available.

## Contents

- [Trust boundary](#trust-boundary)
- [Handler contract](#handler-contract)
- [Database privilege](#database-privilege)
- [Validation matrix](#validation-matrix)
- [Unit example](#unit-example)
- [Local failure injection](#local-failure-injection)

## Trust Boundary

Make the HTTP request contract anonymous without making the database operation
public. If `anon` can execute the health RPC through PostgREST, callers can
bypass every rate limit, concurrency limit, timeout, and response projection in
the Edge Function.

The handler must own one fixed capability:

- hard-code the database operation and target;
- accept no caller-selected SQL, schema, table, RPC name, or database URL;
- accept no parameters unless the health contract truly requires fixed,
  bounded values derived by the server;
- use only a server-held credential or equivalently narrow internal database
  capability;
- discard the RPC response body and return a small generic status; and
- never expose database error text, PostgREST diagnostics, stack traces, row
  data, timing detail, or upstream response bodies.

A service-role client has broader authority than this one operation. Keep it in
the function, never forward caller authorization into it, and expose only the
fixed health call. Prefer a narrower internal credential when the deployment
supports one.

## Handler Contract

Set `verify_jwt = false` only for the public function. Then enforce all of these
inside the handler before database access:

1. Require the exact method, usually `GET`.
2. Apply the architecture's [path-ownership
   rule](architecture.md#edge-function-path-ownership): compare the runtime
   pathname with the one exact health path. The handler sees a
   function-relative path such as `/health`, not the public gateway prefix
   `/functions/v1/health`.
3. Reject suffixes such as `/health/unexpected`, query parameters, request
   bodies, and any other input outside the intentionally empty contract.
4. Take a bounded request-budget slot before starting the database call. Bound
   both request rate and in-flight work so overload does not create an
   unbounded database queue.
5. Abort the fixed database call at a short deadline and settle its promise
   before releasing the in-flight slot.
6. Return only bounded generic responses, for example `200 {"status":"ok"}`,
   `429 {"status":"busy"}`, `404 {"status":"not_found"}`, or
   `503 {"status":"unavailable"}`.
7. Add `Cache-Control: no-store` to every response, including method, path,
   malformed-input, overload, timeout, and unexpected-failure responses.

Validate the route before consuming a budget slot, and validate both before
calling the database. A suffix request must fail generically without spending
database capacity. Do not echo the rejected path or input.

An in-memory token bucket or concurrency counter is local to one Edge Runtime
worker. Its effective deployment-wide allowance scales with active workers and
resets with worker lifecycle. Document that scope. Put a distributed or
gateway-enforced limiter in front when the budget must be globally
authoritative; keep the function-level bound as defense in depth.

## Database Privilege

Revoke default execution before granting only the server-side role. Use the
exact function signature so overloaded functions cannot inherit an unintended
grant:

```sql
create or replace function public.health_check()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.health_check() from public;
revoke all on function public.health_check() from anon;
revoke all on function public.health_check() from authenticated;
grant execute on function public.health_check() to service_role;
```

Keep the function non-parameterized, set an explicit `search_path`, and qualify
every referenced object. Do not grant the health function to `anon` merely
because the Edge Function is public. Keep health tables and views inaccessible
to `anon` and `authenticated` unless they have a separate, reviewed product
reason to be public.

## Validation Matrix

Cover the boundary from both sides:

| Scenario | Required evidence |
| --- | --- |
| Healthy anonymous HTTP | The canonical function URL succeeds without a user JWT, returns only the generic healthy body, and has `Cache-Control: no-store`. |
| Direct RPC bypass | PostgREST calls to the fixed RPC and direct health-table reads fail for both `anon` and a valid `authenticated` session. |
| Database failure | The canonical endpoint returns generic `503` with no RPC body, database error, identifier, or stack trace. |
| Timeout | A never-settling database adapter is aborted within the configured bound, settles, and produces the same generic `503`. |
| Overload | An exhausted rate or concurrency budget returns generic `429` without invoking the database. |
| Exact path | A unit fixture uses the runtime-visible `/health` pathname and invokes the fixed database check once. |
| Suffix path | `/health/unexpected` in a unit fixture and `/functions/v1/health/unexpected` through the local gateway return generic `404`; the unit database spy remains untouched. |
| Malformed input | Wrong methods, query strings, and bodies fail before the budget and database adapters run. |
| Cache control | Every success and failure class above includes `Cache-Control: no-store`. |

Do not infer the direct-RPC result from endpoint behavior. Call PostgREST with
the public project key first without a session and then with a real local user
JWT, and require a non-success response in both cases. The authenticated denial
matters because granting the RPC to `authenticated` creates the same limiter
bypass for any signed-in caller.

## Unit Example

Inject the database check and request budget so routing and overload behavior
can be proved without a live service. Model the URL that the function handler
actually sees:

```ts
it('rejects a forwarded suffix before budget or database work', async () => {
  const takeBudget = vi.fn(() => true)
  const checkDatabase = vi.fn(async () => undefined)
  const handle = createHealthHandler({ takeBudget, checkDatabase, timeoutMs: 100 })

  const response = await handle(
    new Request('https://function.invalid/health/unexpected')
  )

  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ status: 'not_found' })
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(takeBudget).not.toHaveBeenCalled()
  expect(checkDatabase).not.toHaveBeenCalled()
})
```

Add adjacent cases for exact `/health`, overload, malformed input, thrown RPC
failure, and a database promise that settles only after its abort signal fires.
Use fake time where practical and assert the in-flight slot is released after
abort settlement, not merely after scheduling the timeout.

## Local Failure Injection

Use a disposable local Supabase stack. Derive its URL and public/service
credentials from the local CLI status; never commit them. Invoke the public
gateway path without a user JWT, and invoke PostgREST separately as `anon` and
with a real local authenticated JWT.

Temporarily revoke only the exact server-side RPC grant. Restore that same grant
in `finally`, even when an assertion or request fails:

```ts
try {
  await adminSql(
    'revoke execute on function public.health_check() from service_role'
  )

  const failed = await fetch(`${apiUrl}/functions/v1/health`, publicHeaders)
  expect(failed.status).toBe(503)
  expect(await failed.json()).toEqual({ status: 'unavailable' })
  expect(failed.headers.get('cache-control')).toBe('no-store')

  const suffix = await fetch(
    `${apiUrl}/functions/v1/health/unexpected`,
    publicHeaders
  )
  expect(suffix.status).toBe(404)
  expect(await suffix.json()).toEqual({ status: 'not_found' })
} finally {
  await adminSql(
    'grant execute on function public.health_check() to service_role'
  )
}
```

After cleanup, require the canonical anonymous endpoint to become healthy
again. Re-run both direct-RPC denials so restoration is proven to be exactly the
server-side grant, not an accidental public grant. Scan every captured response
and test log for database error text and generated secret sentinels.
