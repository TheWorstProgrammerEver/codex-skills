# Automated Testing Practices

## Core Requirement

Tests must clean up after themselves. A successful or failed test run should not leave temp directories, state files, lock files, spawned processes, timers, services, environment changes, or other local artifacts dangling.

## Unit Test Design

- Prefer mocking, substitution, and narrow fakes for high-volume unit tests so behavior can be asserted without real external systems.
- Shape code for testable substitution: depend on small interfaces, injected collaborators, and pure functions where practical.
- Apply Inversion of Control, Dependency Inversion, and Liskov Substitution principles to make tests meaningful without over-coupling them to implementation details.
- Keep unit tests focused on domain behavior, parsing, state transitions, and adapter boundaries rather than incidental framework mechanics.

## Serialized Producer-Consumer Compatibility

- Passing producer and consumer unit suites do not prove their composed
  compatibility. When an SDK, DTO mapper, generated client, or serializer emits
  data for another schema or parser, feed the producer's exact serialized
  output through the authoritative downstream consumer in at least one contract
  test.
- Compare every duplicated field rule across that boundary: size and numeric
  limits, enum members, required versus optional or nullable fields, defaults
  and normalization, and the tags and payloads of discriminated variants. Cover
  boundary values that can reveal one side accepting a value the other rejects;
  do not stop at representative happy-path values.
- Prefer importing canonical constants or types from the downstream contract,
  or centralizing them in a dependency-neutral contract package, when package
  direction allows it. When direct reuse would create an unsuitable dependency,
  add an explicit cross-schema parity test as well as the composed
  producer-to-consumer test.
- When recovery state copies a path-bearing or otherwise security-constrained
  value from an authoritative plan, run the same accepted and denied corpus
  through both schemas. Prefer the same canonical validator; otherwise make
  parity explicit and include traversal components, ambiguous separators, empty
  components, absolutes, and normalization forms that could cross the original
  boundary.
- Treat a producer that can emit data rejected by its declared consumer as a
  compatibility defect even when each schema is internally valid. In review,
  request canonical constraint reuse or a composed boundary test; if divergence
  is intentional, require an explicit versioned transformation and tests for
  that behavior.

## TypeScript Workspace Validation

When adding or changing cross-workspace imports, run a clean-artifact check if
CI performs lint or no-emit typechecking before the build, or if sibling
packages can resolve through generated JavaScript or declarations. Workspace
links, package `types` or `exports` fields, and project references can otherwise
let a stale local `dist` tree hide a clean-checkout failure.

1. Use the repository's native clean command or remove its exact generated
   outputs, then confirm sibling build and declaration outputs are absent.
2. Without rebuilding, run the same lint or no-emit typecheck path that CI runs
   before the build.
3. Only after the pre-build check passes, run the repository's normal
   project-reference or package build and the remaining validation.

Treat the no-emit check and the project-reference build as separate evidence.
The first must resolve the intended source graph without creating prerequisite
declarations; the second may build referenced packages first and thereby mask a
broken pre-build check. Fix clean-checkout resolution with the
repository-native approach—such as its source-resolution configuration,
workspace exports, project-reference setup, or deliberate CI ordering. Preserve
the pre-build order when that is the intended contract; do not assume one
package manager or automatically add a `paths` mapping.

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

### Atomic File Durability Tests

Test a reboot-safe atomic replacement as an ordered persistence protocol, not
only as a final-content assertion. Use injectable filesystem operations or
fault hooks to stop at exact boundaries, then construct a fresh store or
recovery object against the same isolated temporary root.

At minimum, exercise this example matrix:

| Interrupted attempt | Required recovery evidence |
| --- | --- |
| Destination absent; failure before rename | The destination remains absent, owned temporary residue is removed, and recovery does not invent a committed file. |
| Old destination present; failure before rename | The old bytes remain intact while the temporary file contains or contained the candidate bytes. |
| Rename succeeds; failure before destination-directory sync | The new destination may already be visible and the temporary name may be gone, but retry still syncs the existing destination directory before accepting the file as durable. |
| Owned temporary residue beside unrelated files | Recovery removes only the exact operation-owned artifacts and leaves every unrelated file unchanged. |

- Record or spy on the sequence `write -> file sync -> close -> rename ->
  directory sync`. Inject immediately before rename and immediately after
  rename but before directory sync; a visible destination is not enough to
  pass the post-rename case.
- For a nested destination whose ancestors do not yet exist, inject before and
  after the sync associated with every newly created ancestor. Retry each
  interruption against the same root and assert that the safely bounded
  ancestor chain is synced root-to-leaf before another temporary file is
  opened.
- Include a retry where all nested directories are visible and recursive
  creation reports no newly created path. Assert the same full-chain sync;
  otherwise the test misses an interruption that created several ancestors but
  stopped before their containing directory entries became durable.
- After recovery removes a temporary entry, require another destination-
  directory sync. Also require that sync when recovery finds no temporary entry
  because rename may have consumed it just before interruption.
- Allocate every scenario under its own test-created temporary root, retain the
  exact owned temporary names for assertions and cleanup, and remove the root
  in `finally`. Never fault-test against a user, repository, or shared state
  directory.

### Durable State Trust-Boundary Tests

Test directory trust and serialized-value validation separately from atomicity
and crash durability. A store passes only when all applicable contracts pass;
a mode-`0600` destination or successful rename must not compensate for a
failure in either trust boundary.

For directory trust, exercise pre-existing components rather than testing only
the modes used by directory-creation code:

| Existing state | Required result |
| --- | --- |
| Private destination inside a broadly writable containing directory | Reject before cleanup, destination inspection, or replacement. |
| Directory component owned by an untrusted identity | Reject where the platform test environment can establish a distinct owner; otherwise record this platform gap rather than silently omitting the contract. |
| Symlink at an ancestor pointing to another test-owned directory | Reject at that ancestor and assert that no requested descendant was created in the symlink target. |
| Trusted existing chain | Open and validate each component in order before operating on state. |

- Instrument the traversal sequence as `open or create component -> validate
  type, owner, and mode -> descend`. Assert that no child creation or state-file
  operation occurs after the first rejected component.
- Keep both the intended root and any symlink target under the test's isolated
  temporary root. Capture their contents before the operation and assert the
  target is unchanged, then remove the whole fixture in `finally`.
- Include race-focused integration coverage for handle-relative, no-follow
  operations when the implementation claims resistance to concurrent
  replacement. A path-only unit mock proves validation order, not resistance to
  check/use races.

For recovery-schema parity, drive both the authoritative source validator and
the recovery parser from one table. Include valid multi-component relatives
and denied values such as `../outside-root`, `safe/../outside-root`,
`safe\child`, and `safe//child`, plus any platform-specific absolute or
normalization spellings in the source contract. Assert that every denied value
is rejected by both boundaries, then serialize and parse at least one record
per safety-relevant field so helper-only tests cannot hide schema drift.

### Recovery Semantic-Invariant Tests

Start with serialized checkpoints that the transition API can produce, then
mutate one relationship at a time while leaving every individual field
shape-valid. This keeps field validation, cross-field semantics, and external
source-plan validation independently observable.

At minimum, exercise this example matrix:

| Shape-valid recovery state | Semantic result | Required evidence |
| --- | --- | --- |
| `currentStep: null` with `transaction: { stepId: "prepare-disk", phase: "prepared" }` | Corrupt: orphan transaction. | The recovery parser rejects before returning a valid classification or invoking resume behavior. |
| `currentStep.id: "prepare-disk"` with `transaction.stepId: "apply-config"` | Corrupt: mismatched identities. | The parser enforces identity equality even though both identifiers are individually valid. |
| `phase: "succeeded"` with `pendingStepIds: ["verify"]` | Corrupt: terminal success with unfinished work. | The parser enforces terminal completeness and does not continue or repair the workflow implicitly. |
| `phase: "running"`, `currentStep: { id: "prepare-disk", attempt: 2 }`, no transaction, and `pendingStepIds: ["verify"]` | Legitimate retry/recovery state. | The semantic parser accepts it; the owning runtime separately confirms both step identities against the current source plan before resuming. |

- Assert a distinct corrupt result for each impossible document rather than
  treating it as absent, uninitialized, or valid-but-unresumable. Also assert
  that no transition callback or resume side effect ran before rejection.
- Derive the mutation table from documented transition preconditions and
  postconditions. Add cases for every persisted identity relationship,
  impossible phase combination, terminal state with unfinished work, and
  related record that becomes required or forbidden in another state.
- Test source-plan cross-references at the runtime boundary when the parser does
  not own the plan. Feed the same semantically valid checkpoint to matching and
  mismatching plans, and assert rejection before resume when the plan's
  identity, order, or revision rules do not match.
- Pure parser tests should avoid filesystem state. When a test writes and
  recovers the serialized document, allocate its store under a test-created
  isolated temporary root, clean that root in `finally`, and never point the
  fixture at user, repository, or shared runner state.

### Ambiguous In-Flight Retry-Budget Tests

Treat a persisted attempt number and the possible number of executions as
different quantities. A checkpoint such as `phase: "started", attempt: 1`
proves that attempt 1 was reserved; after an interruption, it does not prove
whether the command never started, is still running, completed, or produced
external effects. Keep semantic validity checks in
[RYA-160](https://linear.app/ryan-hayward/issue/RYA-160/hive-mind-validate-semantic-invariants-in-recovered-state);
apply the execution-budget contract after a legitimate in-flight state is
recognized.

Enumerate at least these ordered crash windows:

| Interruption window | Recovery requirement |
| --- | --- |
| Before the `started` checkpoint is durably persisted | No execution may have started. Recovery may reserve an attempt, but it must durably persist that reservation before launch. |
| After `started` is persisted but before execution begins | The local checkpoint is indistinguishable from a later interruption unless a trusted external reconciler proves that launch never occurred. Apply the configured ambiguous-work policy. |
| After execution begins or completes but before its outcome is durably persisted | Count the reserved attempt as a possible execution. Replaying it under the same attempt number evades the budget and can duplicate non-idempotent effects. Reconcile, consume another durably reserved budget slot, or stop for manual intervention. |
| After the outcome is durably persisted | Resume from that outcome. Never rerun a recorded success; a recorded failure may advance only through the normal next-attempt reservation and budget check. |

- Define whether ambiguous in-flight work is reconciled, conservatively
  consumed, retried with a new durably persisted attempt, or stopped for manual
  intervention. If persisting the new reservation fails, fail before launch.
  The configured maximum must bound executions that may actually have started
  across restarts, not merely the largest attempt number observed in one
  checkpoint.
- For a focused regression, seed `maxAttempts: 1` with
  `phase: "started", attempt: 1`, construct a fresh runtime against that same
  checkpoint more than once, and retain one shared fake launch counter. A
  conservative non-idempotent policy must launch zero additional commands and
  repeatedly return reconciliation or manual-intervention state. A retrying
  policy must first reconcile or durably reserve a remaining attempt; repeat
  recovery more times than the budget and assert that the shared launch count
  never exceeds the remaining execution slots.
- Cover both command classes. For non-idempotent work, an indeterminate result
  must stop until reconciliation or manual intervention prevents duplicated
  effects. For idempotent work, use a stable operation or idempotency key and
  still consume a durably recorded execution slot for every new launch; local
  idempotency does not turn repeated process starts into one execution.
- Exactly-once execution of non-idempotent work cannot be inferred from a local
  success checkpoint: interruption can occur after the external effect but
  before that checkpoint. It requires an end-to-end idempotency or
  reconciliation contract with the effect owner, otherwise ambiguous recovery
  must stop.
- Use injected launch and reconciliation fakes, or harmless commands confined
  to a test-created temporary fixture. Keep the counter or operation ledger
  shared across fresh runtime instances, terminate any real process, and remove
  temporary state in `finally`.

## Process And Service Cleanup

- Tests that spawn processes must wait for exit, terminate explicitly, or use a controlled fake process object.
- Tests that install or simulate services, timers, hooks, locks, or scheduler state must isolate them under a temp root and remove that root in `finally`.
- Avoid writing to real user or system locations unless the test is explicitly an integration test and the cleanup path is validated.

### Bounded Subprocess Lifecycle Tests

Timeout errors and direct-child exit are not proof that a bounded subprocess
adapter cleaned up the full command tree. On every supported process-control
model, add real lifecycle coverage with these distinct fixtures. Pair it with
the [cancellation-settlement checklist](general-implementation.md#cancellation-settlement)
and deterministic coordination fixtures below.

| Fixture | What it proves |
| --- | --- |
| A direct child that accepts the graceful termination signal | The basic timeout and graceful-stop path works, but not descendant cleanup. |
| An ordinary shell that remains running while its descendant accepts the signal | Cleanup reaches a shell descendant without relying on shell replacement such as `exec`. |
| A same-group shell descendant that ignores the graceful signal and inherits a captured stdout or stderr descriptor | Cleanup escalates within a bound and does not wait forever for stream closure. |

- Record the shell and descendant PIDs. When the adapter settles, assert the
  expected timeout or cancellation error and that every recorded process is no
  longer live. Observing only the direct child's `exit` event is insufficient.
- Choose the process-state predicate from the contract being tested:

  | Contract | Passing observation |
  | --- | --- |
  | Descendant execution has terminated | Every recorded PID is absent or the platform reports a terminal, non-executing state. On Linux, `/proc/<pid>/stat` state `Z` (zombie) or `X` (dead) satisfies this predicate; a stopped but resumable process does not. |
  | No process-table entry remains | Every recorded PID is absent after reaping; a zombie does not satisfy this stronger predicate. |

  On POSIX, `kill(pid, 0)` checks whether the caller may address a process-table
  entry. It therefore succeeds for both a live process and an unreaped zombie
  (and a permissions error can also imply that an entry exists). Do not use it
  alone to prove that execution continues. Use a platform-aware state probe
  when testing termination—for example, parse the state field after the
  parenthesized command in Linux `/proc/<pid>/stat`—and reserve an absent entry
  such as `ESRCH` for the complete-reaping assertion.
- Run tests for a complete-reaping guarantee under a reaping PID 1 or a
  test-owned subreaper that adopts and waits for orphaned descendants. A zombie
  under a non-reaping external PID 1 can be valid evidence that execution
  stopped, but it is not evidence that reaping completed. Do not accept a live,
  stopped, or otherwise resumable descendant, and do not excuse zombies that
  the unit under test or its controlled test environment is responsible for
  reaping.
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
  group. Before every watchdog or `finally` signal, validate stable identity and
  ownership captured when the fixture started, such as the expected process
  group plus a platform start-time or equivalent identity marker. A numeric PID
  or process-group ID alone can be reused. If ownership cannot be revalidated,
  fail closed or tear down an enclosing isolated environment instead of
  signaling the stale identifier. Do not use process-name matching or broad
  discovery-and-kill commands that could terminate unrelated work.
- Measure elapsed time with a monotonic clock. Allowing a documented scheduling
  margin, assert that the adapter did not settle before its configured timeout
  and did settle within its timeout plus termination-grace bound. Keep this
  expected deadline shorter than the independent watchdog deadline so a
  regression fails promptly while the watchdog and `finally` path still prevent
  leaked processes and temporary files.

#### Cancellation Settlement Race Fixtures

Use controlled signal, child, and cleanup collaborators to force ordering
boundaries without scheduler timing. These fakes prove adapter coordination,
not real process-tree termination; retain the platform-specific lifecycle
fixtures above for every declared process-control model.

- For cancellation between the initial precheck and listener registration,
  wrap an `AbortController` so the first `aborted` read returns false, then make
  `addEventListener` abort the underlying controller immediately before it
  forwards the listener registration. The event is deliberately missed, so the
  post-registration `aborted` recheck must drive the guarded cancellation path.
  Assert that the child starts once and settles as canceled. Temporarily remove
  the recheck and confirm this fixture remains pending until its independent
  watchdog fails rather than passing accidentally.
- For cancellation after child completion while descendant cleanup is pending,
  make cleanup return a deferred promise. Emit the terminal `close` event,
  verify the cancellation listener has already been removed, abort while the
  deferred cleanup is unresolved, then release cleanup. Assert that completion
  retains the exit reason, code, and signal captured at `close`, and that no
  second termination starts. Exercise the equivalent `error` boundary when
  asynchronous cleanup is part of the adapter's spawn-failure path.

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

### File URL To Native Path Boundaries

- Treat URL-syntax validation and decoded native-path validation as separate
  boundaries. A canonical `file:` URL can still decode to an unusable or
  differently interpreted filesystem path. Check the URL policy, convert it,
  then validate the exact native path before any filesystem operation.
- Define the URL contract explicitly: local versus remote hosts, rejection of
  queries and fragments that conversion may discard, and whether the input must
  name a file rather than a directory. For file-only inputs, reject a trailing
  separator lexically; verifying the existing path's type is a separate I/O
  responsibility.
- Reject percent-encoded NUL and encoded slash or backslash spellings in the
  source URL before decoding, then reject NUL and unexpected platform
  separators in the converted path. Do not rely on every platform's URL
  converter rejecting the same encoded separators.
- Exercise literal and percent-encoded parent segments. URL construction may
  normalize them before later checks can observe the original spelling, so
  inspect raw input when traversal syntax itself is forbidden and always apply
  containment policy to the final normalized native path. For operations that
  canonicalize existing paths or promise symlink containment, also follow
  [Trusted Path Boundaries](shell-safety.md#trusted-path-boundaries).
- Keep parser and conversion unit tests no-I/O: cover encoded NUL, encoded slash
  and backslash, parent segments, a remote host, query and fragment suffixes, a
  directory-shaped URL, and a valid local file URL constructed with
  `pathToFileURL(join(tmpdir(), "example.txt"))`. Assert the rejection stage or
  reason, not only that an error occurred. Put existence, file-type, symlink,
  and canonical-containment promises in separate temporary-fixture integration
  tests with cleanup.

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
