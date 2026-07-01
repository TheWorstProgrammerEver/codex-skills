# Automated Testing Practices

## Core Requirement

Tests must clean up after themselves. A successful or failed test run should not leave temp directories, state files, lock files, spawned processes, timers, services, environment changes, or other local artifacts dangling.

## Unit Test Design

- Prefer mocking, substitution, and narrow fakes for high-volume unit tests so behavior can be asserted without real external systems.
- Shape code for testable substitution: depend on small interfaces, injected collaborators, and pure functions where practical.
- Apply Inversion of Control, Dependency Inversion, and Liskov Substitution principles to make tests meaningful without over-coupling them to implementation details.
- Keep unit tests focused on domain behavior, parsing, state transitions, and adapter boundaries rather than incidental framework mechanics.

## Filesystem Cleanup

- Wrap every test-created directory or file in `try`/`finally` and remove it with an idempotent cleanup such as `rmSync(path, { recursive: true, force: true })`.
- Avoid helper defaults that allocate temp files or directories implicitly. Helpers should create filesystem resources only when the test explicitly asks for them, or they should return a cleanup handle used by the caller.
- Be careful with object defaults such as `stateDir: mkdtempSync(...)` before `...overrides`; JavaScript evaluates that default even when the caller overrides it.
- Prefer test-specific temp prefixes so leftovers are easy to detect and safe to remove.
- When fixing or reviewing filesystem-affecting tests, verify cleanliness with a before/after snapshot of the relevant temp prefix.

Example cleanliness check:

```bash
find /tmp -maxdepth 1 -type d -name 'project-prefix-*' -printf '%f\n' | sort > /tmp/project-before.txt
npm test
find /tmp -maxdepth 1 -type d -name 'project-prefix-*' -printf '%f\n' | sort > /tmp/project-after.txt
comm -13 /tmp/project-before.txt /tmp/project-after.txt
```

The final `comm` output should be empty.

## Process And Service Cleanup

- Tests that spawn processes must wait for exit, terminate explicitly, or use a controlled fake process object.
- Tests that install or simulate services, timers, hooks, locks, or scheduler state must isolate them under a temp root and remove that root in `finally`.
- Avoid writing to real user or system locations unless the test is explicitly an integration test and the cleanup path is validated.

## Database And Integration Cleanup

- Integration tests that manipulate databases must isolate their data by transaction, schema, test database, tenant, user, or unique test prefix.
- Clean database rows, buckets, auth users, queues, and related external state in `finally`, even when assertions fail.
- Prefer local emulators or disposable per-test/per-suite environments when the stack supports them.
- Avoid mixing local and cloud dependencies in the same integration test path unless the project explicitly chooses a cloud sandbox strategy.

## Security Tests

- Include security tests for applications with backends, authentication, authorization, or persisted user data.
- Write access-control tests so they express the domain policy legibly: who can read, create, update, delete, or invoke each sensitive resource or command.
- Aggressively assert denied access as well as allowed access, especially for cross-user, cross-tenant, role, ownership, and unauthenticated scenarios.
- For Supabase apps, cover Row Level Security policies and semantic Edge Function command/query authorization paths.

## Environment Cleanup

- Tests that mutate `process.env`, current working directory, global console methods, timers, or other process-wide state must restore the original value in `finally`.
- Capture originals before mutation and restore even when assertions fail.

## Review Checklist

- Search tests for temp creation APIs and confirm each allocation has a cleanup path.
- Check helper functions for hidden side effects and implicit temp allocation.
- Check database-affecting tests for isolation and cleanup of created records, auth users, storage objects, and related external state.
- Check security-sensitive code for readable tests that cover allowed and denied cases.
- Run the relevant test command and, when applicable, a before/after filesystem snapshot.
- Treat leftover artifacts as a test bug, not an acceptable nuisance.
