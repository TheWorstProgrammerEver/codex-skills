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

### Whole-Directory Replacement Tests

Test the
[whole-directory replacement protocol](general-implementation.md#safe-whole-directory-replacement)
with deterministic hooks or injectable filesystem operations at staging,
promotion, and rollback boundaries. Do not reuse the single-file atomic-write
matrix as proof that a complete directory tree and its prior version remain
recoverable.

At minimum, exercise this example matrix:

| Scenario | Required evidence |
| --- | --- |
| New output | The complete staged tree is promoted, every required file and created directory was synced, and no staging or backup sibling remains. |
| Existing recognizable output without explicit replacement | The operation refuses before staging; the prior tree is byte-for-byte intact. |
| Existing unrelated directory, partial lookalike, symlink, or broad target such as a filesystem or workspace root | Replacement is refused even when a force/replace option is present; no entry is moved, removed, or created. |
| Failure before commit | The requested output stays absent, or the prior output stays unchanged; owned staging residue is removed. |
| Promotion failure with successful rollback | The exact prior tree is restored at the requested output and the parent is synced after `backup -> output`; owned staging and unused backup artifacts are removed. |
| Promotion failure with failed rollback | The exact prior tree remains at the reported backup locator, the parent is synced before that locator is returned, staging is removed, and the backup is retained as the sole recovery copy. |
| Successful explicit replacement | The candidate becomes the requested output only after complete staging; the old backup and staging sibling are removed. |

- Snapshot or hash the prior tree, including expected modes and nested entries,
  before replacement. Recheck that snapshot after every denied or failed
  scenario so a passing error assertion cannot hide prior-output damage.
- Make the rollback-failure regression deterministic: after the prior output
  has moved to backup, recreate the requested output as a non-empty directory
  containing an interloper, then fail candidate promotion. Require the restore
  rename to fail without deleting or changing the interloper. Assert that
  staging is gone, exactly the expected operation-owned backup remains, and its
  contents match the prior snapshot.
- Assert that the rollback-failure error exposes only a structured locator
  bounded to the validated parent and generated backup entry. Its user-facing
  message must not include raw filesystem exception text, fixture contents,
  secrets, or attacker-controlled path text.
- Record the sync and rename sequence. Require all staged files and directories
  to be synced before the prior output moves. On success, require
  `output -> backup`, `staging -> output`, and parent sync in order; if backup
  removal is part of a crash-durable success contract, require the final parent
  sync too. On successful rollback, require `backup -> output` followed by a
  parent sync before reporting restoration. On failed rollback, require a
  parent sync after the restore failure and before returning the backup
  locator, so the earlier `output -> backup` rename is durable.
- Inject failure into each rollback-outcome parent sync. A successful-rollback
  sync failure must leave the prior tree at the requested output without
  reporting it durably restored. A failed-rollback sync failure must retain the
  exact prior backup and the interloper without reporting the locator as a
  crash-durable recovery result. In both cases, require bounded, redacted
  diagnostics and prove that failure handling does not delete the sole prior
  tree.
- Keep the fixture under one test-created temporary root. Preserve a failed
  rollback backup until its recovery assertions finish, then remove the whole
  root in the outer `finally`; an unconditional operation-level cleanup that
  deletes that backup is the regression under test.

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

### Derived-Artifact Replay Tests

Apply these scenarios only after the checkpoint has passed
[Recovery Semantic-Invariant Tests](#recovery-semantic-invariant-tests).
Valid recovery state does not prove that a derived artifact will be reproduced
with the context of the step that logically produced it.

Start from a pure fake producer whose output bytes depend on an allowlisted,
non-secret input such as `RENDER_MODE`. Record producer context with both the
value and a presence bit so unset and empty values remain distinguishable.
Capture the uninterrupted output as the replay oracle, then exercise this
matrix:

| Scenario | Mutation between producer and consumer | Required evidence |
| --- | --- | --- |
| Uninterrupted execution | None; produce with `RENDER_MODE=before` and consume immediately. | The consumer receives the producer's exact output bytes and behavior. |
| Intervening set | Change the consumer-time fake environment to `RENDER_MODE=after` after the produced checkpoint. | Rehydration still receives `before` from immutable producer context and exactly matches the uninterrupted bytes; no consumer-time environment read affects replay. |
| Intervening unset or newly set value | Unset a value that was present at production, and separately set `RENDER_MODE=after` when it was absent at production. | Both replays preserve the original presence/value pair rather than collapsing absent, empty, and changed inputs. |
| Same-process retry | Let the first consumer attempt observe the derived bytes and fail, mutate the live fake environment, then retry without restarting the runtime. | Every attempt receives byte-identical input and makes the same producer-derived decision; retry does not refresh implicitly. |
| Reboot/resume | Serialize the valid checkpoint and producer context, construct a fresh runtime, and give its live fake environment a different value or presence state. | Recomputed bytes and observable behavior equal the uninterrupted oracle before any resumed side effect. |
| Deliberate refresh | Invoke a separately named refresh transition after changing the input to `after`. | The refreshed artifact uses `after`, records a new producer identity or revision, and explicitly invalidates or recomputes every affected descendant. |

- Identify all semantic producer inputs, not only function arguments. Bind
  template and plan revisions, selected configuration, presence-aware
  environment values, and relevant locale, time, or working context when they
  can change output. An unversioned reference to mutable current state is not
  producer context.
- Persist the minimum immutable values or version identities needed to
  reconstruct the producer. If exact replay cannot be supported, persist the
  artifact through an appropriate protected channel or declare refresh
  semantics; do not label consumer-time recomputation as replay.
- Compare exact bytes or a collision-resistant digest plus the consumer's
  observable decision. Matching checkpoint fields or merely completing the
  workflow does not prove semantic equivalence.
- Prefer injected environment, configuration, clock, and renderer fakes. If a
  focused integration test mutates process-wide state or writes a checkpoint,
  use a test-created temporary root and restore every set/unset value in
  `finally`. Follow
  [Structural Secret Exclusion](#structural-secret-exclusion)
  instead of capturing a whole real environment or persisting plaintext secret
  values in replay fixtures.

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

#### Recovery Process Identity Tests

Test post-crash adoption separately from control through a retained current
child handle. Drive recovery with an injected identity reader and signal sink
so every ownership decision and denied signal is observable.

| Recovery scenario | Required result |
| --- | --- |
| Same boot and exact PID, isolated process-group ID, and start-time ticks | Adoption may proceed; immediately before any group signal, a fresh read must match the complete tuple again. |
| Same boot and PID but different start-time ticks | Treat as PID reuse; do not adopt, suppress a replacement launch, or signal. |
| Different boot ID with otherwise matching numeric fields | Treat as prior-boot state; do not inspect the PID or signal the recorded group as though it were the old process. |
| Exact numeric fields but a zombie or dead leader | Treat the leader as exited, not live or adoptable; use the canonical [RYA-157 cleanup-test guidance](https://linear.app/ryan-hayward/issue/RYA-157/hive-mind-distinguish-live-descendants-from-unreaped-zombies-in) for execution-versus-reaping assertions. |
| Process-group ID differs from the recorded value or from the leader PID | Treat as unowned or non-isolated; do not adopt or group-signal it. |
| Initial adoption matches, then any tuple field changes before signaling | The immediate pre-signal revalidation fails and the signal sink records no call. |

- Add a deterministic hook between the initial recovery match and the signal
  attempt. Replace one field at a time, including the process-group ID, and
  assert that the code re-reads all fields rather than trusting a cached
  `true`. Apply the same check before a graceful signal and escalation.
- Assert the signal target as well as the call count: an allowed recovered
  signal addresses only the freshly verified isolated process group, never a
  positive PID, stale group number, process-name match, or discovered group.
- Keep real-process smoke fixtures inside a test-owned isolated group with an
  independent watchdog and `finally` cleanup. Use fakes for PID reuse and
  reboot cases; tests must not wait for the host kernel to reproduce either
  event.

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

### Orchestration Cancellation Matrix

Test the
[orchestration cancellation contract](general-implementation.md#orchestration-cancellation-propagation)
at every step kind that can keep the runner pending. Before entering the step
under test, start and register a test-owned background or supervised resource;
otherwise the regression does not prove that cancellation can escape the
foreground wait and reach outer supervisor cleanup.

At minimum, exercise this example matrix:

| Active step kind | Required cancellation evidence |
| --- | --- |
| Automatic foreground command | The runner signal reaches the command adapter; its foreground process and descendants stop, and the earlier supervised resource is also cleaned up. |
| Manual gate or operator-input wait | Cancellation settles the gate without an answer or fixture release, then outer cleanup stops the supervised resource. |
| Completion probe or polling loop | Cancellation interrupts both an in-flight probe and any interval between probes; no further probe starts after abort. |
| Sleep, delay, or retry backoff | Cancellation clears the owned timer and settles without advancing to the next step. |
| Background-supervisor start, join, or completion wait | Partially or fully started resources are already registered, cancellation stops each one, and the join cannot keep the runner pending. |
| Queue, lock, or resource-acquisition wait when supported | Cancellation removes the waiter or subscription and does not acquire or start work after abort. |

- Use controlled fakes with explicit `entered`, `canceled`, and
  `cleanupComplete` observations. Await `entered`, abort the one runner-owned
  controller, and race the outer `run()` promise against an independent hard
  deadline. Assert bounded outer settlement, not merely that an abort callback
  ran.
- Add an already-aborted case for every supported step kind. Assert that no
  foreground command, manual wait, probe, timer, queue waiter, or supervised
  resource starts. Keep this separate from the active-step cases, which must
  start and register a supervised resource before abort.
- For polling, abort once while the probe call is pending and once while the
  interval timer is pending. In both cases assert that no later probe starts.
- After both successful cancellation and injected cleanup failure, assert that
  every test-owned process has reached the contract's terminal state, every
  timer and poll handle is cleared, every waiter or listener is removed, and
  every supervised cleanup promise has settled. Keep the watchdog and fixture
  cleanup idempotent in `finally`, and clear the watchdog itself so the test
  leaves no process, timer, listener, or unobserved promise behind.
- With multiple supervisors, make one cleanup succeed, one report failure
  after releasing its resource, and one require bounded escalation. Assert
  that one rejection does not prevent every registered cleanup from being
  attempted and awaited before the runner reports the aggregated outcome.
- Include resistant and non-settling work. A command or supervisor that ignores
  the graceful signal must exercise bounded escalation. Wrap a manual gate,
  probe, or timer collaborator whose underlying work promise never settles
  with a structured cancellation/cleanup handle. Assert that the executor
  observes the underlying promise, invokes and awaits cleanup, and settles
  without the test releasing that promise.
- Make propagation failures deterministic. For each matrix row, replace or
  mutate that executor so it ignores the runner signal while its blocking work
  remains pending. Confirm the outer deadline fails and supervised cleanup has
  not completed until the test's independent `finally` cleanup releases the
  fixture. A runner test that still passes when any one active executor drops
  cancellation does not cover the orchestration contract.
- Keep runner propagation tests separate from the adapter-level
  [cancellation-settlement race fixtures](#cancellation-settlement-race-fixtures).
  The listener-registration and terminal-outcome races remain canonical in
  [RYA-155](https://linear.app/ryan-hayward/issue/RYA-155/hive-mind-cover-subprocess-cancellation-settlement-races);
  the matrix proves that orchestration actually reaches each adapter and wait.

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
