# React Style

## Component Shape

- Keep components small and purpose-specific. Split when a component mixes layout, data loading, state transitions, formatting, and interaction details.
- Organize components by feature/domain before creating broad shared UI folders.
- Colocate component-specific hooks, types, fixtures, and helpers with the component or feature that owns them.
- Promote shared components only when multiple features need the same behavior and visual contract.

## State And Hooks

- Prefer local state, composed hooks, and pure state transition helpers before broad global stores.
- Keep hooks focused on one concern: data loading, subscriptions, form state, derived view models, or command dispatch.
- Make side effects explicit in hooks and ensure cleanup paths are present for subscriptions, timers, observers, and async work.
- Keep derived data as pure calculations where practical instead of duplicating it in mutable state.

### Route-Scoped Async State

- Assume a route-parameter change can reuse the same component and hook instances. Clearing state in an effect does not stop work issued for the previous tenant, account, project, conversation, or other scope from settling into the new route.
- Give each route scope a generation or equivalent operation identity. Capture both the scope key and generation before every request, command, or subscription reconciliation, then require both to remain current after every `await` and immediately before every route-scoped state mutation.
- Apply the guard to success, error, and completion paths. This includes content and cursor merges, busy flags, errors, access-denied state, drafts, read markers or watermarks, and any other state whose meaning depends on the route. A guarded success path with an unguarded `catch` or `finally` still permits stale state to cross scopes.
- Invalidate the generation synchronously when the route scope changes and when the owner unmounts. Cancel requests and unsubscribe transports where practical to avoid wasted work, but keep the identity check as the correctness gate because cancellation can race with settlement or be unsupported.
- Validate that every incoming DTO belongs to the captured scope before merging it. Key sequence tracking, deduplication, cursors, and reconciliation state by tenant or route scope so an identifier or watermark from one scope cannot suppress or advance another.

## UI Implementation

- Prefer semantic HTML, native controls, and accessible interaction patterns.
- Keep presentational formatting separate from domain transformations when a view starts doing both.
- Use existing design-system primitives and styling conventions before introducing new component patterns.
- Prefer SCSS modules for custom web styling in React TSX apps unless the repository has already standardized on another scoped styling approach.
- Avoid introducing CSS frameworks by default.
- Keep responsive behavior predictable by giving fixed-format UI elements stable dimensions or constraints.
- Also read `accessibility.md` when changing visible UI, interactive controls, layout, motion, theming, or focus behavior.
