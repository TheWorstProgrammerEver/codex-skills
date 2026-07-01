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

## UI Implementation

- Prefer semantic HTML, native controls, and accessible interaction patterns.
- Keep presentational formatting separate from domain transformations when a view starts doing both.
- Use existing design-system primitives and styling conventions before introducing new component patterns.
- Keep responsive behavior predictable by giving fixed-format UI elements stable dimensions or constraints.
