# Project Style

Use this as the default taste layer for Supabase-backed React TSX MicroSaaS apps.

## Philosophy

Build the actual authenticated app experience first. Keep the app modest, readable, and operational. Prefer boring primitives and native platform behavior unless a dependency solves real complexity.

Avoid architecture theatre, but separate responsibilities early enough that future changes have obvious homes.

## Stack

- Vite React TypeScript.
- React Router for route destinations.
- SCSS modules for component styling.
- Supabase JS for Auth and Edge Function invocation.
- Supabase CLI local stack for Postgres/Auth/Studio/Mailpit/Functions.
- Vitest for pure logic and integration tests.
- Playwright for important UI journeys.
- Netlify-compatible static hosting with SPA `_redirects`.

Do not add Tailwind or broad UI frameworks unless the user explicitly asks.

## Dependency Trust

Start from skepticism. Every dependency is code, maintenance burden, supply-chain risk, bundle weight, and migration surface.

Prefer dependencies that are official or high-reputation vendor packages for the stack already in use. Avoid convenience wrappers around trivial React/platform behavior.

When adding a dependency, state the reason and tradeoff plainly. For current package recommendations, verify primary sources.

## Code Style

- No semicolons.
- Prefer expression-bodied components and small helpers.
- Avoid noisy fragments when a semantic element can be returned.
- Avoid explicit return/type annotations where inference is clear.
- Keep comments rare and useful.
- Prefer ASCII unless the app/domain clearly needs otherwise.

## Directory Shape

```text
common/       Shared client/function request identifiers and DTOs
lib/          Reusable app-agnostic helpers and UI primitives
public/       Runtime config loader/templates and static host files
scripts/      Developer/deploy workflow scripts
src/
  components/ App-specific reusable components
  contexts/   Thin React context providers
  data/       Client-side integration implementations
  domain/     Pure app logic and types
  routing/    Route guards/scope components
  screens/    Route destinations and screen view models
  state/      App state hooks and pure state update helpers
  styles/     Global app style entry points
supabase/
  functions/  Edge Function entrypoints and handlers
  migrations/ SQL schema, RLS, grants, and helper functions
tests/
  integration/security/
  unit/
  visual/
```

Use `screens` for top-level route compositions. Use colocated `use{ScreenName}ViewModel.ts` hooks to keep JSX presentation lean.

## UI

Use semantic HTML first: `main`, `section`, `header`, `form`, `fieldset`, `legend`, `dialog`, `button`, `input`, `select`, checkbox/radio controls. Reach for ARIA only when native semantics are insufficient.

Operational SaaS UI should feel calm, direct, and readable. Avoid marketing heroes, decorative blobs, nested cards, one-note palettes, and text that explains obvious controls inside the app.

Use `lib/ui` primitives as the design-system seed:

- `AppFrame` for authenticated header/sidebar/main layout.
- `AppDialog` for modal forms with stable header/content/footer slots.
- `AuthPanel` for Supabase-backed auth flows.
- `Section`, `List`, `HeaderWithActions`, `LoaderContainer`, `AsynchronousSubmitButton` for common app surfaces.

## State

Prefer composition of state over large global stores. Use:

- `src/domain` for pure rules.
- `src/state` for app state hooks and pure update helpers.
- `src/screens/*/use...ViewModel.ts` for screen orchestration.
- `src/contexts` for thin providers around shared services/state.
- `src/data` for integration boundaries.

If a store grows, split actions/update helpers before it becomes a god class. Keep mutation logic named after user/domain actions, not UI trivia.

## Styling

Use SCSS modules. Put design-system foundation styles in `lib/ui/styles/foundation.scss`; import them from app global styles.

Support system light/dark mode naturally with `color-scheme` and semantic CSS variables. Use stable dimensions for boards, lists, grids, toolbars, and tiles so state changes do not shift layout unexpectedly.
