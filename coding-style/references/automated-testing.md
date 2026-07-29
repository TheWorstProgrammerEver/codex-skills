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

### Bounded Subprocess Lifecycle Tests

Timeout errors and direct-child exit are not proof that a bounded subprocess
adapter cleaned up the full command tree. On every supported process-control
model, add real lifecycle coverage with these distinct fixtures:

| Fixture | What it proves |
| --- | --- |
| A direct child that accepts the graceful termination signal | The basic timeout and graceful-stop path works, but not descendant cleanup. |
| An ordinary shell that remains running while its descendant accepts the signal | Cleanup reaches a shell descendant without relying on shell replacement such as `exec`. |
| A same-group shell descendant that ignores the graceful signal and inherits a captured stdout or stderr descriptor | Cleanup escalates within a bound and does not wait forever for stream closure. |

- Record the shell and descendant PIDs. When the adapter settles, assert the
  expected timeout or cancellation error and that every recorded process is no
  longer live. Observing only the direct child's `exit` event is insufficient.
- In Node.js, observe `exit` and `close` as different lifecycle events.
  `close` waits for stdio streams to close, so a resistant descendant that
  inherited a pipe can keep it pending after the direct child exits. The hard
  test deadline and cleanup trigger must not depend only on `close`.
- Start a test-owned watchdog before the adapter can hang, and keep idempotent
  cleanup in `finally`. For example, create a dedicated process group for the
  fixture, retain its exact group and descendant IDs, gracefully terminate that
  group, escalate it after a short grace period, wait for the owned PIDs, and
  remove PID files and temporary state.
- Signal only the fixture's recorded PIDs or dedicated test-owned process
  group. Do not use process-name matching or broad discovery-and-kill commands
  that could terminate unrelated work.
- Measure elapsed time with a monotonic clock. Allowing a documented scheduling
  margin, assert that the adapter did not settle before its configured timeout
  and did settle within its timeout plus termination-grace bound. Keep this
  expected deadline shorter than the independent watchdog deadline so a
  regression fails promptly while the watchdog and `finally` path still prevent
  leaked processes and temporary files.

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

### Structural Secret Exclusion

- Treat a claim that a serialized contract structurally excludes plaintext
  secrets as stronger than secret detection. A field-name denylist or regex is
  only a heuristic, even when it catches familiar names; it may supplement but
  cannot prove the structural guarantee.
- For manifests, config, job specs, and command plans that carry environment
  values, arguments, URLs, headers, or free-form config fields, model value
  origins with typed, discriminated source variants such as
  `{"kind":"secretRef","id":"example-service-login"}`. Require a secret
  reference for credential-capable positions. If the contract also permits
  public literals, constrain them to explicitly public fields or a versioned
  public-key allowlist, reject unknown variants and keys, and avoid generic
  string maps or arrays that can bypass the source boundary.
- Add fail-closed parser and serializer tests that attempt placeholder plaintext
  through both obvious and alias or compound-name carriers. Include cases such
  as `PGPASSWORD`, `GITHUB_PAT`, and `DATABASE_URL`, an argument like
  `--service-login=EXAMPLE_CREDENTIAL_VALUE`, an embedded-credential URL under
  `connectionUrl`, and a nested config value. Assert rejection before the value
  reaches durable JSON; renaming or composing a carrier must not change the
  verdict.
- Also test the allowed boundary: typed secret references round-trip without
  secret material, and explicitly public literals still work. When an
  implementation relies only on suspected field names, report the missing
  structural guarantee as a required change rather than describing the
  denylist as enforcement.

## Environment Cleanup

- Tests that mutate `process.env`, current working directory, global console methods, timers, or other process-wide state must restore the original value in `finally`.
- Capture originals before mutation and restore even when assertions fail.

## CI Container Hardening

For GitHub Actions job containers, follow
[`github-actions-container-hardening.md`](github-actions-container-hardening.md).
It is the canonical guidance for combining runner mount compatibility with
dropped capabilities, `no-new-privileges`, and no host block-device access.

## Review Checklist

- Search tests for temp creation APIs and confirm each allocation has a cleanup path.
- Check helper functions for hidden side effects and implicit temp allocation.
- Check database-affecting tests for isolation and cleanup of created records, auth users, storage objects, and related external state.
- Check security-sensitive code for readable tests that cover allowed and denied cases.
- Run the relevant test command and, when applicable, a before/after filesystem snapshot.
- Treat leftover artifacts as a test bug, not an acceptable nuisance.
