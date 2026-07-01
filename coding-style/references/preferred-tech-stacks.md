# Preferred Tech Stacks

Use these preferences when choosing a new stack, adding dependencies, or evaluating whether to introduce a framework. Existing repository choices still lead unless there is a concrete reason to change them.

## Dependency Posture

- Prefer self-authored application code over low-trust open-source frameworks.
- Use credible provider libraries when they are the official or industry-standard way to integrate with a platform, SDK, or API.
- Use high-credibility infrastructure libraries for critical plumbing such as GraphQL clients, HTTP clients, WebSocket clients, database clients, cryptography, authentication, and payment integrations.
- Avoid adding a broad framework when a small local abstraction or direct platform API is enough.

## Hosting And Backend

- Use Netlify for basic static websites and single-page apps.
- Use Vercel for apps that require server-side rendering.
- Use Supabase as the preferred backend platform for Postgres, auth, storage, local development, and Deno Edge Functions.
- For Supabase-backed React TypeScript apps, also read `$supabase-react-ts` and avoid duplicating its detailed project guidance here.

## Web Client

- Prefer React TSX for web UI.
- Prefer SCSS modules for scoped custom styling.
- Do not add CSS frameworks by default.
- Use semantic HTML, native controls, and existing design-system primitives before introducing custom interaction patterns.

## Server-Side Shape

- For Supabase Edge Functions, expose semantic domain interactions rather than thin database passthroughs.
- Prefer a single function with command/query dispatch or mediator-style branch-out when that keeps deployment and authorization simpler.
- Consider Domain Driven Design principles for command names, aggregate boundaries, validation, and authorization.
- Use Row Level Security for persisted data, with expressive and legible policy helper functions.
- If server-side rendering is important, prefer React TSX with Next.js.

## Mobile

- For lightweight apps with minimal native SDK use and modest performance requirements, prefer Ionic with React TSX, the Ionic design system, SCSS modules for minimal customization, and atomic well-contained native plugins.
- For medium-weight or heavier apps with meaningful native SDK or performance requirements, prefer Swift and SwiftUI for iOS and Kotlin with Jetpack Compose for Android.
- Prefer automated deployment to TestFlight Internal Testing and Google Play Store Internal Testing when changes merge to `main`.

## Cloud

- Treat Supabase as the preferred do-everything platform while it fits the application's complexity and scale.
- For applications that exceed or outgrow Supabase, Azure and AWS are acceptable.
- Manage complex cloud infrastructure strictly with Infrastructure as Code.
- Deploy cloud infrastructure through GitHub Actions or an equivalent auditable CI/CD path.

## Deployment And Environments

- Keep environment separation explicit and enforced.
- Scope environment variables to specific environments and keep them out of source control.
- Prefer GitHub-managed environment values when build or deployment happens in GitHub Actions.
- It is acceptable to manage build/deploy values on-platform when the platform is the natural owner, such as Netlify or Supabase.
- For in-development work, prefer a fully local developer environment when total local emulation is practical.
- When total local emulation is not practical, prefer cloud-based per-developer sandbox environments.
- Avoid a mixed local development experience where some dependencies run locally and others require shared cloud resources. Choose all-local or a one-command deployable per-developer sandbox.
- Deploy reviewed `main` changes automatically to a test environment.
- Promote tested builds to production manually.
- Prefer build-once, deploy-to-many-environments when feasible: the same build artifact should move from test configuration to production configuration after promotion.
- Decide case by case when platform constraints make build-once deployment costly, such as mobile app store signing or TestFlight binary requirements.
