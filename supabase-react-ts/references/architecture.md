# Architecture

Use this when changing request boundaries, data access, state management, or Edge Function structure.

## Dispatch Boundary

The starter uses `lib/dispatch` as a small Mediatr-like request dispatcher. A request declares:

- a stable `identifier`
- typed `params`
- a compile-time result type

Prefer generated request classes:

```ts
export const LoadAppQuery = createQueryType(appRequestIdentifiers.load)<AppState, LoadAppParams>()
export const CreateThingCommand = createCommandType(appRequestIdentifiers.createThing)<Thing, CreateThingParams>()
```

Use `createRequestHandler(RequestType, handler)` when handlers live in-process and need typed params. Use identifier-to-handler registration when all requests cross the same network boundary.

Keep identifiers in `common/*RequestIdentifiers.ts` when they cross the client/function boundary.

## Client Data Flow

The browser should not know Supabase function details throughout UI code.

```text
Screen -> view model -> app state hook -> dispatcher -> Supabase function invoker -> Edge Function
```

Typical files:

- `src/data/app/requests.ts`: request classes and params/results.
- `src/data/app/appDispatcher.ts`: maps request types to the function invoker.
- `src/data/supabaseFunctionInvokerRequestHandler.ts`: calls `supabase.functions.invoke`.
- `src/state/useTeamTasks.ts`: source-of-truth app state and domain actions.
- `src/state/*StateUpdates.ts`: pure state update helpers.
- `src/screens/*/use...ViewModel.ts`: screen-specific orchestration.

After mutations, prefer minimal response DTOs:

- Create returns the created row/DTO.
- Update returns the updated row/DTO.
- Delete returns `{ id }` or a minimal success DTO.
- Explicit load/query requests load broader state.

Do not reload the entire app state after every mutation unless the domain truly requires reconciliation.

## Edge Function Structure

The starter intentionally uses one app function with internal dispatch:

```text
supabase/functions/app/index.ts
  parse request
  require authenticated user
  create dispatcher
  dispatch by identifier

supabase/functions/app/handlers/
  index.ts registers handler factories
  workspaces.ts/invitations.ts/tasks.ts implement focused handlers
```

This keeps deployment simple while avoiding a giant switch statement.

Each handler factory should statically declare its request identifier:

```ts
export const createThingHandler = createAppRequestHandlerFactory(
  appRequestIdentifiers.createThing,
  (context) => async (request) => {
    // work
  }
)
```

Split handler files by domain capability as they grow. Keep shared helpers in function-local helpers, mappers, or profile modules.

A public database-backed health or readiness function is a deliberate exception
to the normal authenticated business-function shape. Keep only its HTTP request
anonymous; keep its fixed database operation server-only and follow the
[public health endpoint contract](public-health-endpoints.md), including exact
function-relative routing and a request budget before database access.

## Public URL Generation

When an Edge Function emits absolute public URLs, such as QR code source links, signed callbacks, metadata URLs, or links that will be opened outside the current browser session, treat the product's public app host as explicit runtime configuration. Do not infer the canonical host from `Request.url`, `Host`, `X-Forwarded-*`, or other request-derived headers. Local Supabase/Kong and proxied hosted paths can reflect the function gateway, omit the original app port, or otherwise differ from the public product host.

Keep the public-host value separate from secrets, but pass it into Edge Runtime through the app's configured environment or Supabase function secrets alongside other hosted function config. Use one small helper to parse and validate it before constructing URLs.

If the public-host config is missing or invalid, fail with a clear non-success response instead of returning a plausible URL built from the request. For image-producing functions, return a non-image error response so callers and tests cannot mistake a misleading generated asset for success.

Security and integration tests for public URL functions should compare generated source URLs against the same canonical helper or config value used by the app, not against request-derived hosts.

## Shared Code

Use:

- `common/` for client/function DTOs and request identifiers.
- `lib/` for code that could plausibly be reused across Ryan's next app.
- `src/domain` for product-specific pure code.

Do not duplicate dispatch implementations between client and functions. Import the shared `lib/dispatch/dispatch.ts` from both sides.

## Auth

Supabase Auth is wrapped by:

- `src/state/useAppAuth.ts`
- `src/contexts/AuthContext.tsx`
- `lib/ui/AuthPanel`

Keep Supabase as an implementation detail. UI should receive capabilities like sign in, sign up, OTP, magic link, status, and errors from the auth state/context layer.

## Contexts

Contexts should be dumb glue:

```tsx
const Context = createContext<Value | undefined>(undefined)

export const SomethingContextProvider = ({ children }: Props) => {
  const value = useSomething()

  return <Context.Provider value={value}>{children}</Context.Provider>
}
```

Put logic in `src/state/useSomething.ts`, not in the provider component.
