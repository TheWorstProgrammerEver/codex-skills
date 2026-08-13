# Automated Testing Practices

## Core Requirement

Tests must clean up after themselves. A successful or failed test run should not leave temp directories, state files, lock files, spawned processes, timers, services, environment changes, or other local artifacts dangling.

## Unit Test Design

- Prefer mocking, substitution, and narrow fakes for high-volume unit tests so behavior can be asserted without real external systems.
- Shape code for testable substitution: depend on small interfaces, injected collaborators, and pure functions where practical.
- Apply Inversion of Control, Dependency Inversion, and Liskov Substitution principles to make tests meaningful without over-coupling them to implementation details.
- Keep unit tests focused on domain behavior, parsing, state transitions, and adapter boundaries rather than incidental framework mechanics.

## Host-Diagnostic Evidence Tests

Exercise the production collector, topology resolver, normalizer, and reporting
boundary together. Handing a report builder an already-classified device or
effective setting does not prove that raw host evidence was scoped and merged
correctly.

At minimum, cover this matrix with generated host-neutral fixtures:

| Scenario | Required evidence |
| --- | --- |
| Zero-discard root beside discard-capable loop and zram devices | Resolve `/` to its exact mount source and complete active block-device stack. Report discard as not advertised for that target; unrelated loop and zram capabilities remain observations only. Replace the target resolver with host-wide `any(discard > 0)` aggregation and require the assertion to fail. |
| Zram reported by `swapon` as `TYPE=partition` | Normalize the canonical device identity as zram or memory-backed before classifying the write path. Report no disk-backed swap when it is the only active swap. Replace normalization with `TYPE=partition` implies physical storage and require the assertion to fail. |
| Persistent journald base file, later volatile drop-in, and an existing persistent journal directory | Feed the main file and drop-in through the production systemd-aware merge path and report the effective `Storage=volatile`. Keep the directory as corroborating evidence only. Replace the merge path with base-file-only parsing and require the assertion to fail. |

- Keep raw command/file observations and derived conclusions separately
  assertable. Include the resolved target, mount source, normalized device
  family, topology identities, source status, effective configuration source,
  and conclusion reason in the test result without copying native host paths.
- Add incomplete and conflicting cases. A missing parent edge, ambiguous mount
  source, failed virtual-device identity probe, or failed/partial systemd merge
  must produce `unknown` or an explicit conflict, not a fallback positive or
  negative claim.
- Test layered block stacks, nested target paths, and device-mapper or RAID
  fan-out when the product supports them. Assert that every required active
  layer is evaluated and unrelated host devices cannot change the target
  result.
- For systemd-managed settings, use an isolated root or faithful merge fixture
  that preserves main-file and drop-in precedence, reset assignments, and
  masking rules. A hand-concatenated expected string is not evidence that the
  production merge command or adapter selected the effective value.
- Mutation-check the three central shortcuts independently: host-wide discard
  aggregation, partition-equals-disk swap classification, and base-file-only
  journald parsing. Each unsafe implementation must fail the scenario's
  expected assertion for the intended reason.
- Allocate every filesystem fixture under a test-created temporary root and
  remove it in `finally`. Use only generated device names, paths, and contents;
  never copy local device identifiers or host configuration into fixtures.

Follow the collection and reporting contract in
[`host-diagnostic-evidence.md`](host-diagnostic-evidence.md).

## Structured-Configuration Mutation Tests

For a script or adapter that edits TOML, INI, YAML, a service file, or another
structured format, execute the production mutation path against isolated
filesystem fixtures. An orchestration fake may prove that a caller selected the
right file or invoked the editor, but a fake that writes the expected result
cannot prove the real parser or transformation respects section and key
boundaries.

At minimum, exercise this matrix:

| Fixture | Required evidence |
| --- | --- |
| Top-level defaults plus a named profile or nested section with independent same-named overrides | Only the owned top-level or selected-section keys change; every unrelated section and override retains its semantic value. |
| Existing target keys, duplicate keys, dotted or nested collisions, and semantically equivalent bare, quoted, or escape-encoded key spellings | The documented replace-or-reject policy is applied to normalized key identity. No duplicate or scalar/table collision reaches publication. |
| Comments, target-looking text inside multiline values, and other supported boundary syntax | The production transformation does not interpret data or comments as owned keys and preserves presentation when that is part of its contract. |
| Idempotent rerun | A second real invocation succeeds without adding keys, changing unrelated values, or causing further byte or mode changes beyond the documented serialization policy. |
| Malformed input and valid-but-unsupported structure | The operation fails before replacement with the documented classification and bounded guidance; original bytes and mode remain exact, and no operation-owned temporary output remains. |

- Parse the actual transformed candidate with the authoritative format parser
  and assert its target and preserved semantics. Do not parse a hand-authored
  expected file in place of the production output. Include a valid original
  whose transformation would become invalid, such as inserting a scalar where
  a dotted or nested key already owns that path, and require candidate
  validation to fail closed.
- Keep malformed input separate from valid-but-unsupported syntax so the test
  proves both parser rejection and the transformer's deliberate subset
  boundary. Mutation-check the section guard or semantic key normalization when
  practical; at least one profile or equivalent-key fixture must fail under the
  unsafe line filter.
- Run each case beneath a test-created temporary root. Capture original bytes
  and mode before execution, inspect the real destination and temporary
  namespace afterward, and remove the fixture in `finally`.

Follow the implementation boundary in
[`general-implementation.md`](general-implementation.md#structured-configuration-mutation).

## Negative Controls For Safety Harnesses

A zero-valued happy-path audit does not prove that a cleanup, sandbox,
redaction, network-denial, device-denial, or secret-leak detector can observe
the effect it claims to prohibit. Treat the detector and its outer harness as
code under test. For every claimed safety boundary, keep all three controls:

- a clean baseline that passes with zero violations;
- a harmless controlled violation that crosses the monitored boundary and
  makes the outer harness fail; and
- an allowed near-boundary control that remains permitted and distinguishes a
  real effect from inert data, syntax, or another lookalike.

Replace or bypass the detector with a no-op in a mutation check when practical.
At least one controlled-violation regression must then fail for the expected
missing observation. Asserting only an internal detector callback is weaker
than invoking the same outer command, test runner, or audit path that enforces
the safety result in normal use.

Run every controlled violation inside an isolated fake, temporary root,
disposable local emulator, or harmless virtual fixture. Never use a physical
device, real secret, external provider, host service, privileged operation, or
production-like account as the violation target. Generate non-secret fixture
markers and require concise structured diagnostics containing only a stable
detector code, bounded counts, and redacted labels. Assert that raw markers,
fixture contents, native paths, and adapter output are absent from the failure
message and captured logs.

Give the negative-control test its own hard watchdog, independent of the
detector's timeout. Register every test-owned process, timer, listener, and
temporary path before the controlled effect can occur, and release them through
idempotent `finally` cleanup. Await cleanup and clear the watchdog itself.
Afterward, prove that the recorded processes reached the promised terminal
state and that no test-prefixed file or directory was added. A safety regression
that can itself leak work is not acceptable evidence.

### Process-Tree Detectors

Do not discover descendants only from a before/after ancestry snapshot taken
after the launcher exits. A surviving grandchild can be reparented before that
snapshot and disappear from the launcher's descendant tree. Instead, have the
fixture publish every test-owned stable identity while the launcher and child
relationship still exists. On Linux, retain at least the PID, start-time ticks,
and isolated process-group identity; keep an additional test nonce or
fixture-owned channel when the harness uses one.

After allowing the launcher to exit, look up those recorded identities directly
and require the controlled live orphan to make the outer cleanup audit fail
even after it has been reparented to PID 1 or a subreaper. Revalidate stable
ownership before every watchdog or `finally` signal so PID reuse cannot redirect
cleanup. Pair this violation with an allowed control whose descendant exits and
is reaped within the contract.

Use the lifecycle, watchdog, escalation, and timing fixtures in
[Bounded Subprocess Lifecycle Tests](#bounded-subprocess-lifecycle-tests) and
[RYA-150](https://linear.app/ryan-hayward/issue/RYA-150/hive-mind-test-bounded-subprocess-cleanup-with-resistant-descendants).
Choose execution termination versus complete reaping explicitly; use the
zombie predicates in
[RYA-157](https://linear.app/ryan-hayward/issue/RYA-157/hive-mind-distinguish-live-descendants-from-unreaped-zombies-in)
instead of copying that process-state matrix here.

### Filesystem And Device-Denial Detectors

State the exact enforcement boundary. Prefer a lower sandbox, system-call, or
injected adapter boundary over patching a convenient subset of high-level
callers when the supported platform can provide it without privileged or
physical-device fixtures. If interception remains at a language filesystem
API, enumerate the supported functions, overloads, and path-taking operands;
do not describe the result broadly as “no device access.”

Drive a synthetic forbidden namespace or regular files under a temporary root
through representative callback, promise, and synchronous variants. Cover:

- metadata and canonicalization such as `access`, `stat`, `lstat`, and
  `realpath`;
- enumeration such as `readdir` and `opendir`;
- open, read, and write paths such as `open`, `readFile`, and `writeFile`; and
- read and write stream construction.

Include direct paths and every supported file-URL form. If already-open
descriptors are part of the claim, state how their origin remains attributable;
otherwise exclude descriptor-only calls explicitly and guard descriptor
acquisition. Assert that every promised operation reaches the same denial
result before its underlying adapter performs I/O. An unguarded representative
call in any claimed category must make the outer harness fail.

Classify each multi-path API operand by whether that operation actually accesses
it. For example, `symlink(target, destination)` stores `target` as opaque text
and performs creation I/O at `destination`; a path-like target naming a
synthetic forbidden namespace is therefore an allowed control when the
destination is inside the temporary fixture. A later `stat`, `realpath`, or
`open` that dereferences that link is real filesystem access and must trigger
the controlled violation. Keep analogous allowed controls for every detector
so fail-closed enforcement does not become fail-everything matching.

For destructive-device workflows, reuse the fixture and adapter constraints in
[Deterministic Validation Without Devices](destructive-device-safety.md#deterministic-validation-without-devices)
and the generalized contract in
[RYA-174](https://linear.app/ryan-hayward/issue/RYA-174/hive-mind-add-fail-closed-destructive-device-guardrail-guidance);
do not duplicate its device topology or writer matrix here.

## Pinned External-Artifact Fixture Conformance

Before the first destructive-device or production integration for an immutable
external artifact, require an explicit three-way consistency gate:

1. the catalog lock or
   [immutable acquisition contract](immutable-artifact-acquisition.md#pin-the-artifact-contract),
   including its exact length and checksum;
2. representative metadata read from those exact checksum-verified bytes; and
3. the checked-in fixture plus the adapter's semantic validator.

Exercise the production metadata parser and validator through a safe,
non-device probe when possible. Prefer inspecting the verified regular file
directly. If the format requires block-layout semantics, use a test-owned
regular backing file with a loop or equivalent adapter, read-only where
practical, and guarantee detach, unmount, handle, and temporary-root cleanup in
`finally`. This conformance gate must complete before an effecting adapter,
physical target, or production import is allowed to start; keep routine
physical-device validation separate under
[Destructive Block-Device Safety](destructive-device-safety.md#deterministic-validation-without-devices).

Give every checked-in or cached derived fixture provenance that identifies the
source catalog revision, artifact checksum and length, metadata extraction
method, parser or normalization revision when relevant, and the reviewed
refresh command or procedure. Reverify cached source bytes by content identity
before deriving or approving fixture evidence. Do not let a release label,
filename, prior cache hit, or hand-authored fixture stand in for the pinned
bytes.

Independently drift each semantic edge. Keep the catalog and verified bytes
fixed while changing one fixture or validator marker to another plausible
value; keep fixture provenance fixed while selecting a different catalog
digest; and feed validly structured metadata with one wrong product, platform,
schema, or release marker. Each case must fail before any effecting adapter
runs. Build expected values independently from the probe output so one shared
bug cannot rewrite both sides of the assertion.

Do not download large artifacts in every routine CI run. Run the real-byte
conformance job when a catalog lock, fixture derivation, extractor, or semantic
validator changes; before the first destructive or production use of a pinned
artifact; and on a reviewed periodic release-audit cadence. Routine CI may use
the small provenance-linked fixture and independent drift negatives. A
content-addressed, checksum-reverified cache may support the real-byte job
under [Immutable Artifact Acquisition](immutable-artifact-acquisition.md), but
the validation record must state which pinned identity was reviewed and when
the fixture must be refreshed.

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

### Codex Structured Error Projection Tests

For a Codex wrapper or authorization-adjacent consumer that depends on an error
class, test the exact production projection and adapter:

- Generate or load the app-server schema for the installed target version.
  Assert structurally that the error payload exposes `codexErrorInfo` and that
  every relied-on discriminator, such as `usageLimitExceeded`, remains in its
  declared enum. Do not substitute a handwritten interface or a message fixture
  for this schema-drift check.
- Feed an exact app-server wire event with an allowlisted discriminator through
  the production adapter and authorization boundary. Assert the expected
  internal discriminated type, producer kind, and contract version, then prove
  the intended effect adapter runs only for that typed evidence.
- Use a message-only `codex exec --json` error and failed-turn fixture as
  negative controls, including text identical to a real usage-limit message.
  Also cover absent, null, unknown, and malformed `codexErrorInfo`. Every case
  must produce indeterminate, non-authoritative evidence and must not call the
  reset, billing, retry, or other effect adapter.
- Mutation-check the downgrade boundary: remove or rename
  `codexErrorInfo`, replace the structured event with the exec JSONL projection,
  and alter the relied-on enum member in the schema fixture. At least one
  focused test must fail before any effect for each mutation. Build expected
  discriminators independently from the adapter so the same mapping defect
  cannot change both sides of the assertion.

Keep message, details, stderr, exit-status, and timing assertions separate from
the authorization oracle. The negative controls should remain denied even when
those free-form signals look exactly like the positive case.

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

## Native Optional-Dependency Lockfile Portability

Treat a platform-specific native binding missing after `npm ci` as dependency
and environment evidence before attributing it to the submitted product diff.
A lockfile or module tree hydrated on one operating system or architecture can
hide an omitted optional package until a clean install runs on another supported
target.

When the dependency graph includes native prebuilds or packages constrained by
`os` or `cpu`, validate from clean disposable checkouts:

1. Preserve the submitted `package-lock.json`, record the target operating
   system, architecture, Node.js version, and npm version, then run the
   repository's lockfile-backed install and normal check, test, build, and
   runtime-startup commands. `npm ci --ignore-scripts` can isolate package
   resolution when lifecycle scripts are not part of the claim, but it does not
   replace a required production-equivalent install or runtime smoke.
2. Repeat the lockfile-backed path on every supported architecture, or use an
   equivalent CI matrix. A hosted x64 success is not evidence that a clean ARM64
   install received its native optional package, and the reverse is equally
   true.
3. If one target reports a missing platform package or native binding, retain
   that failed checkout and its unchanged lockfile as evidence. Confirm whether
   the submitted diff changed dependency manifests or the lockfile, and keep
   the install-portability finding separate from failures caused by product
   code.
4. In another disposable copy only, remove both the module tree and lockfile,
   perform a clean reinstall, and rerun the failing check or build as a
   diagnostic. Success shows that current dependency resolution can produce a
   working target graph; it does not prove that the submitted lockfile is
   portable and it does not authorize replacing that lockfile in a review.
5. Route an intentional lockfile regeneration through the normal implementation
   and review workflow. Inspect the entire dependency delta, explain why it is
   expected, and rerun the supported-architecture matrix against the proposed
   lockfile before accepting it.

Use [Final-Path Launcher Smoke Tests](#final-path-launcher-smoke-tests) for the
installed entrypoint's runtime evidence. When a project ships a private native
or foreign-architecture runtime rather than an npm-resolved binding, use
[`packaged-runtime-verification.md`](packaged-runtime-verification.md) for that
artifact's identity, placement, and target checks.

Scenario-review the evidence and routing explicitly:

| Submitted change and observations | Correct routing |
| --- | --- |
| A content-only PR leaves manifests and lockfile unchanged; hosted x64 install, checks, and build pass; a clean ARM64 `npm ci` later installs no required optional native package and the build fails with a missing-binding error; a separate lockfile-free ARM64 reinstall checks and builds successfully. | Do not rewrite the content PR's lockfile or label the missing binding a product-diff regression. Record the original ARM64 failure and diagnostic success separately. If ARM64 is a required merge target, route a reviewed lockfile/dependency fix before claiming portability; if the content review's declared target is the already-passing x64 path, decide that artifact on its own evidence and open or link the portability follow-up explicitly. |
| A dependency or lockfile change passes on the developer architecture but fails to resolve a native optional package on another supported target. | Treat portability as part of the submitted dependency delta, require a reviewed correction, and rerun the clean architecture matrix. |

## Final-Path Launcher Smoke Tests

File presence, executable mode, checksums, source-tree imports, and placement
manifests do not prove that an installed command can start. For every generated
or installed launcher used as a public command, service entrypoint, scheduled
job, helper, or hook, execute the exact staged or installed pathname in the same
filesystem layout used by the target. Do not substitute a source-tree script,
its resolved symlink target, or an explicit interpreter command for the shipped
entrypoint.

Run the smoke with the production interpreter/runtime selection behavior and a
platform-equivalent sanitized environment containing only documented minimums.
Set `PATH` to the target's expected search path, use an unrelated empty working
directory and isolated test home, and omit developer-only module, library, and
package-manager variables. If PATH lookup is part of the public contract, test
both the installed pathname and command-name lookup. Invoke wrappers and
symlinks through their public paths so their own-directory, real-path, shebang,
relative-resource, and private dependency resolution all run as shipped.

A host-neutral test case can model the invocation without prescribing one
shell:

```text
invoke:
  path: <staged-root>/<public-command-path>
  cwd: <empty-test-directory>
  env:
    PATH: <production-minimum>
    HOME: <isolated-test-home>
  args: [<side-effect-free-probe>]
```

Use a side-effect-free probe such as help, version, validation-only, or a
fixture-backed no-op. Also exercise one expected startup failure, such as
missing optional input or invalid non-secret fixture data. Assert the documented
exit classification and bounded diagnostic, and require captured output to
exclude environment values, fixture contents, native absolute paths, stack
traces, and secret-like markers. Use generated non-secret markers; never inject
real credentials merely to test redaction.

At minimum, scenario-review both placement shapes:

| Placement | Required evidence |
| --- | --- |
| Launcher beside its dependencies or resources | The exact installed launcher starts from an unrelated working directory with the minimal production environment, proving it does not rely on the source tree or caller CWD. |
| Public wrapper or symlink stored elsewhere | Invocation through every public path reaches the intended private runtime, interpreter, modules, and resources without developer-only PATH or module variables; the safe-failure probe remains bounded and redacted. |

Treat each generated entrypoint as a separate test obligation even when several
wrappers or services share one implementation. This is an
installation-readiness stage, separate from non-executing build-host
verification. For a target that cannot execute on the build host, run the smoke
under a target-compatible emulator or on the actual target; never execute
foreign target code natively on the build host. Keep static identity and
placement checks as separate evidence rather than replacing either boundary.
For an elevated launcher, run the exact production launcher with an isolated
minimal parent environment and the target's effective restricted elevation
environment. Assert that it passes the already resolved, validated absolute
runtime and absolute entrypoint after the option boundary; a private runtime
available only through the invoking user's `PATH` must not make the test pass.
Mutate the launcher to pass only the runtime command name and require the smoke
to fail before secret hydration or the effecting entrypoint.
Use
[`packaged-runtime-verification.md`](packaged-runtime-verification.md)
for the canonical archive, executable identity, entrypoint-mode, placement
manifest, and isolated service-definition checks.

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

### Filesystem Bundle Directory-Mode Tests

Test the
[filesystem bundle directory-mode policy](general-implementation.md#filesystem-bundle-directory-modes)
from both an empty staging root and a realistic pre-populated target. Leaf-only
assertions can pass while a generated manifest still carries destructive modes
for shared ancestors.

At minimum, exercise this matrix:

| Scenario | Required evidence |
| --- | --- |
| Empty staged root | Build private `/var/lib/my-app` and `/run/my-app` leaves from no pre-existing directories. Assert the complete set of generated directory paths and modes: both leaves are `0700`, while `/var`, `/var/lib`, and `/run` are either omitted from the placement manifest or recorded with the fixture's explicit shared policy, never inherited `0700`. |
| Existing shared target | Seed `/var`, `/var/lib`, and `/run` as mode `0755`, plus an unrelated entry under a shared ancestor. Apply the generated placement artifact and assert that shared ancestor modes and the unrelated entry are byte-for-byte and metadata-for-metadata unchanged while the private leaves are installed as `0700`. |
| Restrictive ancestor mutation | Replace the safe component-wise fixture operation with recursive creation using leaf mode `0700`, or inject a `0700` shared-ancestor manifest entry. Require the manifest assertion or placement preflight to fail before any target mode changes. |

- Read modes from the completed staged tree and serialized manifest rather than
  asserting only calls to a directory helper. Compare the exact normalized
  manifest entry set so an unexpected ancestor cannot hide behind correct leaf
  assertions.
- Snapshot the pre-populated target's relevant kinds, modes, and contents before
  placement and compare them afterward. A successful installer return value is
  not proof that unrelated shared metadata was preserved.
- Keep both roots beneath one test-created temporary directory, use explicit
  fixture modes instead of host directory metadata, and remove the fixture in
  `finally`.

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

### Remote Filesystem Promotion Tests

Test remote publication as a transport-specific state machine, not as a mocked
local `rename` call. Use an injected promotion adapter to force exact outcomes
and record client inspections, server inspections, reconnects, cache
invalidations, reads, digests, renames, and cleanup. Retain a disposable
SMB-compatible same-share integration fixture for the mounted-client and
server-native paths before first production use and after material adapter,
client, mount, or server changes. Supply authentication out of band and use
only generated names and non-secret bytes.

At minimum, exercise this matrix:

| Scenario | Required evidence |
| --- | --- |
| Failure before rename | Staging remains byte-for-byte verified, final stays authoritatively absent, no server-native call or recopy occurs, and cleanup preserves the recovery copy. |
| Ambiguous mounted rename with no server mutation | The mounted adapter returns an I/O-like error while server inspection still finds exact staging and no final. Reconciliation, not the exception, establishes this state before any recovery action. |
| Mounted error after server-side success | The mounted call returns the same ambiguous error, but a fresh authoritative view finds final and no staging. Recovery does not recopy or invoke another rename; a fresh whole-object final read and digest decide success. |
| Server-native recovery | After reconciliation proves exact staging and final absence, staging is re-read and reverified immediately before one non-overwriting same-share server-native rename. The final is then freshly read and verified. |
| Artifact/sidecar partial success | One name is final while its peer remains staged or ambiguous. The proven final is not deleted or overwritten, the verified peer staging object is preserved, and success waits for fresh verification of both finals and their digest relationship. |
| Reconnect and stale client cache | Client and server views initially disagree. Reconnect or cache invalidation occurs according to the adapter contract, no mutation occurs while evidence conflicts, and only the refreshed authoritative state selects recovery. |
| Final verification failure | Rename appears successful but a fresh final read is short or digest-mismatched. The operation reports unresolved or corrupt final state, never success, and does not overwrite it from a retained staging copy. |
| Owned cleanup | After complete success, only exact operation-owned staging residue is eligible for removal. Unknown, near-match, and unrelated entries remain unchanged; interrupted and ambiguous cases retain verified recovery data. |

Assert the event order:

```text
verify staging -> inspect final absence -> attempt promotion ->
reconcile ambiguous state -> server-native rename if authorized ->
fresh final read -> verify final bytes -> owned cleanup
```

The server-native step is conditional, but no later step may move ahead of an
applicable earlier gate. Add mutation controls that replace reconciliation with
blind copy or overwrite, skip the immediate staging re-verification or final-
absence check, trust a cached client listing, or accept the rename response
without fresh final verification. Each mutation must fail before success is
reported. Close both adapters, release handles, remove the generated namespace,
and prove the disposable share has no test-owned residue in `finally`.

Follow the production protocol in
[`immutable-artifact-acquisition.md`](immutable-artifact-acquisition.md#promote-across-remote-filesystems).

### Transactional Sensitive-File Migration Tests

Test the
[sensitive-file migration protocol](general-implementation.md#transactional-sensitive-file-migration)
with deterministic hooks around every durable effect. Construct a fresh
transaction object against the same isolated fixture after each injected
interruption. Use generated non-secret marker bytes in memory; do not put
credential-like values, secret derivatives, private paths, or host facts in
fixtures, checkpoints, logs, or assertions.

Inject immediately before and after every `prepared`, `installed`,
`source-removed`, and `committed` checkpoint, and on both sides of publication
rename, destination-directory sync, source unlink, and source-directory sync.
At minimum, prove this matrix:

| Interrupted boundary | Required recovery evidence |
| --- | --- |
| Temporary creation or copy before `prepared` | The source remains intact; recovery removes only the exact recorded operation-owned plaintext temporary, syncs its directory, and preserves near-match files. |
| After `prepared`, before publication rename | The verified prepared temporary can be resumed; the source remains intact and no destination is accepted as installed. |
| After rename, before destination-directory sync | The destination may be visible and the temporary name absent, but recovery syncs the destination directory and repeats destination metadata and content verification before `installed`. |
| After destination sync, on either side of `installed` | Recovery accepts installation only after proving the durable destination invariant; the source is never unlinked without a durable `installed` checkpoint. |
| On either side of source unlink | Before unlink, source identity and content still match the opened source and installed destination. After unlink, recovery never deletes another entry or recreates plaintext from checkpoint data. |
| After unlink, before source-directory sync | Recovery syncs the source directory before recording durable removal or commit. A missing source pathname alone is not durable-unlink evidence. |
| After source sync, on either side of `source-removed` | Recovery proves the installed object and durably absent source, then advances without republishing or broad cleanup. |
| On either side of `committed` | Recovery never copies, renames, or unlinks secret material again; any transaction-record cleanup preserves the committed data invariants. |

- Record the complete order: reserve transaction identity and exact temp leaf;
  create and verify temp; durably record its non-secret identity; write,
  metadata-update, verify, and sync temp; `prepared`; publish;
  destination-directory sync; verify destination; `installed`; revalidate and
  compare source; unlink source; source-directory sync; `source-removed`;
  `committed`. Assert that moving any checkpoint earlier fails the test.
- Seed a leftover exact generated temp and several near-matches, including a
  longer suffix, shorter prefix, different transaction identifier, symlink,
  hardlink, directory, and special file where the platform safely supports it.
  Recovery must remove only the exact regular file whose recorded identity and
  ownership match the transaction. It must fail closed on an identity mismatch,
  preserve every other entry, and sync after an actual removal.
- After initial validation but before each containment-sensitive read,
  ownership or mode change, publication, verification, cleanup, and unlink,
  replace the pathname of a source or destination ancestor with a symlink to a
  separate test-owned outside tree. Also swap the source, temporary, and
  destination leaf entries with symlinks or different regular files at hooks
  between validation and mutation. Assert either fail-closed rejection or
  continued operation on the pinned verified object, and prove every outside
  file is byte-for-byte and metadata-for-metadata unchanged.
- Make the swap tests exercise the real descriptor-relative or equivalent
  platform adapter. A pathname-only mock that reports another successful
  `lstat` does not test the race. When a platform cannot condition mutation on
  the verified mutable leaf, require the implementation to reject that threat
  model or establish a non-attacker-writable boundary; do not weaken the
  expected result to “the final path looked valid.”
- Cover a source symlink, destination symlink, special file, and source or
  destination with link count greater than one. Reject each before copying or
  unlinking. After every denied, interrupted, or recovered scenario, assert the
  source/destination copy invariant, exact checkpoint phase, absence of
  unowned cleanup, and no leaked temporary fixture.
- Inspect the serialized transaction structurally. Permit only constrained
  recovery metadata and phase values; assert that marker bytes and direct or
  unkeyed derived fingerprints are absent. Keep semantic phase mutations in
  [Recovery Semantic-Invariant Tests](#recovery-semantic-invariant-tests) and
  generalized secret-bearing schema cases in
  [Structural Secret Exclusion](#structural-secret-exclusion) rather than
  duplicating those matrices here.

### Reversible Credential-Rotation Tests

Drive the production credential store through injectable journal, rename,
directory-sync, validation, revocation, and cleanup boundaries. After every
interruption, discard the in-memory object and construct a fresh runtime
against the same isolated store. Seed generated non-secret marker bytes for
the original and replacement ciphertexts, and compare exact bytes so a test
cannot pass after preserving or restoring the wrong generation.

At minimum, exercise this matrix:

| Interrupted boundary | Required fresh-runtime evidence |
| --- | --- |
| Before and after initial `installing` publication, including its rename and directory sync | No credential entry moves before durable intent. Recovery accepts only the complete journal bound to the current operation. |
| Before and after `active -> rollback` | The exact original remains either active or at the journal-bound rollback entry; recovery restores it without accepting the candidate. |
| Before and after the old-generation directory sync | Replacement publication cannot begin until preservation is synced. Recovery repeats the required sync and restores the exact original. |
| Before and after `candidate -> active` and its directory sync | A visible replacement is not accepted as durable or staged. Recovery restores and validates the exact original, then removes only current-operation residue. |
| Before and after `staged` publication | The replacement is considered staged only after production validation and durable phase publication; earlier interruption remains rollback-safe. |
| Before and after `rolling-back`, both rollback renames, their directory syncs, restored-old validation, and cleanup | Repeated recovery completes rollback idempotently, preserves the original bytes, and does not remove unrelated or other-operation entries. |
| Before and after `committing`, server-side revocation, rollback-entry removal, each directory sync, and journal cleanup | No revocation occurs before durable `committing`. Once that phase is durable, every restart finishes or reconciles forward and never reactivates the possibly revoked old generation. |

Record the complete event order and assert the journal's operation identity on
every recovery and cleanup action. Reject shape-valid but impossible
phase/entry combinations before mutation using
[Recovery Semantic-Invariant Tests](#recovery-semantic-invariant-tests). Reuse
the directory-sync fault hooks from
[Atomic File Durability Tests](#atomic-file-durability-tests) and the custody
and secret-exclusion fixtures from
[Transactional Sensitive-File Migration Tests](#transactional-sensitive-file-migration-tests)
rather than replacing those contracts.

Add a deterministic simultaneous-entry regression against the same store and
the same pending replacement. Gate the first caller after it acquires the
coordinator and publishes its journal. Start the second through the production
mutation entrypoint and prove it remains outside all journal and credential
reads and mutations until release. After the first settles, require the second
to reject or reconcile the now-observed state without replacing the original
rollback generation; rollback must restore the byte-exact pre-rotation
ciphertext. Temporarily remove or narrow the coordinator so both calls can
return success while rollback restores the replacement, and require this
fixture to fail. Exercise install, rotate, commit, rollback, and revoke through
the same crash-released coordinator and prove no alternate mutation path can
bypass it.

Mutation-check the ordering boundary by independently removing the pre-rename
journal, old-generation directory sync, phase/entry semantic validation,
`rolling-back` publication, and pre-revocation `committing` publication. Each
mutation must fail at the intended interruption case. Keep every fixture under
one test-owned temporary root, settle all gated callers in `finally`, and prove
that no process, journal, candidate, rollback, lock, or unrelated file leaked.

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

### Stale File-Lock Takeover Tests

Test the
[identity-safe stale-takeover protocol](general-implementation.md#identity-safe-stale-file-lock-takeover)
with deterministic barriers around observation, takeover, acquisition, entry,
and release. A test in which each caller acquires and releases before the next
one enters does not exercise mutual exclusion during recovery.

For the central regression, seed one stale identity A and start two or more
recoverers. Hold every caller after it has observed A. Then let one caller
remove A, acquire as B, and enter while its release remains gated. Resume the
other caller's stale-removal path and assert that it does not remove B, resolve
its acquisition, or enter until B is explicitly released. Temporarily replace
the identity-safe takeover with the original check-then-unlink behavior and
confirm that this same fixture admits both holders before either release; do not
accept a race test that never fails against the unsafe implementation.

At minimum, exercise this matrix:

| Scenario | Required evidence |
| --- | --- |
| Live owner | Age, PID-only probes, timeout, and waiting recoverers do not remove or replace the lock; at most one holder has entered. |
| Stale owner | One recoverer takes over the exact dead generation and makes progress; exact protocol-owned residue is cleaned. |
| PID reuse or changed stable identity | The candidate is not classified as the recorded owner; takeover follows the [RYA-168 stable-identity contract](https://linear.app/ryan-hayward/issue/RYA-168/hive-mind-verify-stable-process-identity-before-recovery-signaling) without duplicating its process matrix. |
| Simultaneous stale recovery | With every contender observing the same stale generation, exactly one acquisition resolves and enters before the release gate opens; all others remain pending or return the documented bounded result. |
| Replacement after observation | Replace A with a fresh identity B at the pre-removal hook. The delayed recoverer leaves B byte-for-byte and identity-for-identity unchanged. |
| Release after ownership loss | Invoke A's delayed release after the path names B. The nonce mismatch prevents unlink, and B remains the only holder. |
| Empty or partial primary state | A live initializer never publishes it. Seeded crash residue is therefore unambiguously recoverable without timeout or concurrent entry. |
| Abandoned recovery coordinator | Seed a dead primary and a dead auxiliary lease, including a finite nested chain when the protocol permits one. Acquisition succeeds under the original deadline, admits one holder, and cleans exact primary, coordinator, nested, and candidate residue. |

- Record acquisition identities, entry count, release state, and filesystem
  mutations. Assert mutual exclusion at the moment the first holder is inside
  the critical section, before triggering any release; checking only final
  cleanup can miss a double-holder interval.
- Use injected identity/liveness readers and filesystem-operation hooks for
  deterministic ordering. Keep a bounded stress probe with several contenders
  and many iterations as supplemental coverage, but do not make scheduler luck
  the sole regression oracle.
- Verify that every retry and recursive recovery step receives one shared
  monotonic deadline. Advance a fake clock while traversing abandoned
  coordinators and assert that no nested acquisition obtains a fresh timeout.
- Allocate primary locks, recovery coordinators, adjacent candidates, and any
  outside swap targets beneath one test-created temporary root. Gate releases
  in `try`/`finally`, settle all contenders, and remove the root even when the
  mutual-exclusion assertion fails.

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

### Prompt-Driven External Effect Tests

Exercise the production deterministic executor and durable store with an
injected provider adapter whose acceptance ledger survives fresh executor
instances. Do not let the model/provider fake call the effect adapter directly;
first assert that it can produce only the reviewed non-secret payload consumed
by the executor.

At minimum, cover this state matrix:

| Scenario | Required evidence |
| --- | --- |
| Reviewed payload replay | After immutable payload publication, a same-process retry and fresh-runtime restart use the byte-identical revision without another model call. An explicit content refresh from the unreserved retryable state creates a new revision before reservation rather than mutating an existing revision. |
| First send | Preflight validates provider, destination, authorization, and secret custody; durable `pending` publication precedes the only provider call; a validated receipt then produces durable `sent`. |
| Already-`sent` replay | A same-process retry and a fresh-runtime restart both return a no-op result with zero additional provider calls. |
| Definitive rejection and safe retry | The provider proves non-application, the executor clears `pending`, and a later retry repeats preflight and persists a new `pending` reservation before its one new call. |
| Ambiguous transport result | The provider accepts into its external ledger but the adapter reports transport loss. Local state remains `pending`; neither the current executor nor a fresh one calls again. |
| Malformed or mismatched success | A success-shaped response with an absent or invalid receipt, wrong provider, authenticated sender, destination, operation, or payload identity remains `pending` and returns bounded reconciliation-required output. |
| Retry while `pending` | A concurrent caller, ordinary retry, and restarted executor all refuse delivery until reconciliation changes state. |
| Content refresh while `pending` | A same-process request and fresh-runtime restart both refuse refresh before invoking the model or publishing a revision. State remains `pending`, and the executor makes no provider call until authoritative reconciliation resolves the existing lineage. |
| Reconciliation after ambiguity | Authoritative acceptance advances `pending` to `sent` without a call; definitive non-application clears it without a call; indeterminate reconciliation retains `pending`. |
| Content refresh after `sent` | A refresh request cannot reset or reuse the completed lineage. A further delivery requires a separately reviewed and authorized logical operation identity; retrying the original remains a no-op with no model or provider call. |

Record transition and adapter events, then assert the strict first-send order:

```text
preflight -> durable pending -> provider call -> validate receipt -> durable sent
```

Inject interruption before and after every event and construct a fresh executor
against the same durable state and provider ledger. In particular, simulate
acceptance immediately after the provider-call hook and interrupt before
receipt validation or `sent` publication. Recovery must observe `pending`,
make zero additional calls, and request reconciliation. Also cover interruption
before durable `pending` and prove that no provider call could have occurred.
Temporarily change pending recovery to clear or resend; the accepted-before-
checkpoint case must then fail with a duplicate ledger entry.

Test structural secret exclusion separately from value redaction. The prompt
builder, model payload, executor request, command plan, receipt, and durable
state schemas must have closed field sets with no credential value, generic
environment map, arbitrary argv, raw provider response, or unrestricted
metadata carrier. Credential-capable fields accept only an opaque reference or
narrow capability whose serializer cannot yield secret bytes. Use a
compile-time, schema, AST, or source-contract scan appropriate to the language
to prove those carriers are unavailable.

Supplement the structural proof with generated placeholder markers. Make the
credential capability expose a marker only inside the connector, and make the
provider fake return different markers in raw headers, body, URL, and exception
text. After success, rejection, malformed success, transport loss, retry, and
restart, scan every captured prompt, payload, argv vector, receipt, checkpoint,
durable byte, log, and diagnostic. Require all markers to be absent and every
diagnostic to contain only an allowlisted code and bounded non-secret fields.
Mutation-check each serializer or adapter by adding a generic string carrier;
the structural scan or marker assertion must fail before publication.

When provider-native idempotency is supported, verify that every authorized
provider-specific reconciliation request for one logical effect uses the same
key and canonical request. Exercise the provider's documented expiry and
conflict boundaries; the executor must stop when the guarantee no longer
covers the ambiguous attempt. Keep non-idempotent and idempotent-provider cases
separate so a fake deduplicating ledger cannot make the default fail-closed
path pass accidentally.

Allocate the state store and fake provider ledger beneath one test-created
temporary root, close every executor, and remove the root in `finally`. Use
only generated non-secret identities and markers. Follow the production
contract in
[`general-implementation.md`](general-implementation.md#prompt-driven-external-effect-execution).

### Persisted Clock-Stability Tests

Test the
[stable-clock scope contract](general-implementation.md#stable-clock-scope-across-executions)
at the serialized observation boundary, not only as arithmetic in one runtime.
Use a temporary state file and launch the production scheduler entry point or a
minimal fixture as two real process invocations. Configure a short skew
tolerance, wait longer than that tolerance between invocations, and assert that
a normal same-boot interval remains stable because wall and boot-scoped elapsed
time agree. The test must fail if the persisted boot reading is replaced with a
fresh process-local counter such as `process.uptime()`.

Keep real process boundaries for the normal-interval regression, then inject
clock and boot-identity readers for the policy matrix:

| Scenario | Required result |
| --- | --- |
| Separate invocations, same boot, normal elapsed time greater than the skew tolerance | Stable: wall and boot-scoped deltas agree within tolerance even though the absolute elapsed interval exceeds it. |
| Same boot, wall-clock rollback while the boot-scoped counter advances | Unstable and fail closed; do not overwrite the last accepted observation with the rejected reading. |
| Same boot, forward or backward wall divergence beyond tolerance | Unstable and fail closed under the same published policy. |
| Boot ID changes | Do not compare boot-counter deltas across the reboot; exercise the declared fail-closed, manual-reconciliation, or safely rebaselined result. |
| Boot ID is unchanged but wall synchronization is absent or indeterminate | Follow the synchronization policy independently of the boot match. |

- Persist and parse the complete `{ wall, bootMonotonic, bootId }` observation in
  each process so an in-memory fake cannot hide a serialization, unit, or field
  mapping defect. Assert that every accepted update is coherent and every
  rejected case preserves the prior trusted state.
- Mutation-check clock scope: swap the boot-scoped reader for a process-scoped
  reader whose value restarts in the second child. The normal-interval case
  must reject that implementation, while the correct boot-scoped source
  remains stable.
- Use fakes for rollback, large jumps, synchronization state, and boot-ID
  changes; tests must not change the host clock or wait for a reboot. Use
  placeholder boot identities rather than copying a local machine identifier.
- Keep the tolerance and wait small but separated by a scheduling margin, add
  an independent watchdog, and remove the temporary state in `finally`.

### Repeat-Install System Timer Tests

When an installer deliberately runs more than once or transitions between
configuration modes, exercise the production install path twice against a
faithful system-manager fixture. A fake that turns every `restart` into a
`waiting` state cannot reproduce systemd's elapsed-timer or service-condition
semantics.

At minimum, exercise this matrix:

| Scenario | Required evidence |
| --- | --- |
| Safe-mode install followed by enabled-mode reinstall | The first install completes with its documented safe behavior. The second publishes the final unit content, reloads the manager, applies the explicit re-arm strategy, and finishes with the exact timer enabled, active, and carrying a finite next monotonic or realtime trigger. |
| Already-active timer followed by reload and `enable --now` only | A faithful negative fixture reaches `active (elapsed)` with no finite next trigger. Reloading and calling `enable --now` leaves the already-active timer unarmed, so the final scheduling assertion fails even though enabled-state and active-state assertions pass. |
| Condition-skipped oneshot with only a service-state-relative recurrence | Let an overdue timer attempt the service while a test-owned `Condition...=` evaluates false. A timer restart may attempt the service again, but the skipped activation supplies no required active or inactive transition; the timer remains elapsed with no finite next trigger and the final assertion fails. |
| Condition-skipped oneshot with an independent recurring schedule | Keep the same skipped service result but use the production independent schedule, such as a recurring calendar cadence where appropriate. After the first attempted activation, the timer reports a later finite trigger without requiring service success, failure, or activation. |
| Successful and failed service paths | Every supported result either preserves a finite next trigger or produces the installer's documented fail-closed result. The test does not infer scheduling from the service exit status alone. |

- Assert enabled state, active state, and arming separately. Read the exact
  timer's `UnitFileState`, `ActiveState`, and
  `NextElapseUSecMonotonic`/`NextElapseUSecRealtime` properties, or its exact
  `systemctl list-timers` row. Treat an empty, zero, `infinity`, `n/a`, or `-`
  next-trigger value as unarmed under the declared target contract.
- Mutation-check both independent defects. Replace the final re-arm operation
  with `enable --now` while the timer is already active, and separately replace
  the independent recurring schedule with one whose next trigger requires a
  condition-skipped service transition. Each mutation must fail the finite-next
  assertion while the enabled and active checks still pass.
- Build the overdue condition-skip fixture from actual lifecycle state. Allow
  the oneshot to complete once, retain its inactive transition as the relative
  anchor, let that deadline pass, then make the test-owned condition false
  before the timer attempts the service. Assert that the skip does not supply a
  new required transition and that the old overdue anchor cannot produce a
  finite next trigger.
- Prefer an isolated target-compatible systemd manager or runtime-installed
  test units for full semantic coverage. Exact transient units may cover a
  narrower condition/next-elapse boundary only when reload and enablement are
  proven separately. If a routine unit test uses an injected command adapter,
  retain a narrow integration check for reload, active-timer restart, condition
  skip, and next-elapse behavior; command-call assertions alone are not
  timer-lifecycle evidence.
- Give live integration fixtures unique test-owned unit names. Register cleanup
  before the first manager mutation, then stop, disable, reset-failed, remove
  only those exact units and drop-ins, reload the manager, and remove the
  temporary root in `finally`.

Follow the installer and schedule contract in
[`systemd-timer-lifecycle.md`](systemd-timer-lifecycle.md).

## Process And Service Cleanup

- Tests that spawn processes must wait for exit, terminate explicitly, or use a controlled fake process object.
- Tests that install or simulate services, timers, hooks, locks, or scheduler state must isolate them under a temp root and remove that root in `finally`.
- Avoid writing to real user or system locations unless the test is explicitly an integration test and the cleanup path is validated.
- For systemd services that combine an interactive physical console with
  structured journal logging, apply the descriptor-routing fakes and isolated
  `isatty` scenarios in
  [`systemd-interactive-descriptors.md`](systemd-interactive-descriptors.md#descriptor-routing-tests).

### Hardened System Unit Namespace Tests

A packaged system unit that combines `User=` with `ProtectHome=`,
`ProtectSystem=`, `ReadWritePaths=`, `BindPaths=`, or related mount-namespace
directives needs both isolated static verification and a final target-compatible
manager start that constructs its runtime namespace. `systemd-analyze verify`
proves syntax and selected dependencies; it does not prove service-user path
specifier expansion, path availability, or mount-namespace construction.

Keep routine fixtures non-privileged and run the installed-unit exercise only in
an explicitly scoped integration environment with prevalidated cleanup. Include
a regression that contrasts a home-relative system-manager specifier with the
supported explicit or systemd-managed path and fails when the start ends in
`226/NAMESPACE` before the probe runs. The canonical system-unit boundary,
diagnostic handling, scenario matrix, and user-manager exclusion live in
[Exercise Hardened System Units At Runtime](packaged-runtime-verification.md#exercise-hardened-system-units-at-runtime);
do not duplicate them in project-specific test guidance.

### Codex Exec Stdin Contract Tests

- For a wrapper that supplies the complete `codex exec` prompt positionally,
  inject a helper executable whose child immediately reads stdin to EOF before
  emitting an observation. Invoke it through the wrapper's real spawn adapter
  and production stdio configuration. Assert that it observes zero input and
  EOF within a short monotonic bound, without the test closing the stream after
  launch. A test that calls `child.stdin.end()` itself can mask the wrapper
  defect it is meant to catch.
- Add an independent watchdog and idempotent `finally` cleanup. As a negative
  control, replace the wrapper's closed or ignored stdin with an open pipe and
  prove that the helper cannot emit the EOF observation until cleanup closes
  that exact pipe. This demonstrates that the regression test fails for the
  original waiting behavior instead of passing for an unrelated fast exit.
- Test an intentional streaming contract separately: send the expected
  appended prompt bytes, explicitly end stdin immediately after the final
  write, and assert that the helper observes the exact bytes followed by EOF.
  Do not apply the zero-input assertion to a wrapper whose documented contract
  intentionally streams stdin.
- Retain a separate narrow smoke against the installed `codex exec` binary
  using the wrapper's exact generated argument list and stdin mode. The helper
  fixture proves EOF ownership deterministically; it does not prove that the
  target CLI version accepts the generated arguments.

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
  leaked processes and temporary files. This is a process-lifetime measurement;
  never persist that reading for a later invocation. Follow
  [Stable Clock Scope Across Executions](general-implementation.md#stable-clock-scope-across-executions)
  when a clock observation crosses a process boundary.

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
- For project lifecycle state, deterministically coordinate simultaneous
  initial claimers, claim attempts against a retained failed or indeterminate
  generation, replacement after an old observer pauses, and delayed release by
  an owner that has already lost its generation. Require one serialized owner
  from initially absent state; require every claimant against unresolved state
  to fail without removing it; require a fresh generation read inside every
  claim/release critical section; and preserve replacement state. Add an unrelated
  listener and an unowned live-PID control that prove neither shared-port nor
  command discovery reaches the signal sink.
- Run the real accepting-child and resistant same-group descendant fixtures on
  every operating-system family advertised by the lifecycle scripts. Parser
  tests for another platform do not replace its real observation, graceful
  shutdown, bounded escalation, and terminal-state evidence; keep the CI
  matrix explicit so one platform cannot silently skip the fixture. In the
  resistant case, make the group leader actually exit and assert that terminal
  state before cleanup begins; a launcher kept alive by a timer does not cover
  descendant-only ownership recovery. Separately cover owner conditional
  self-release after signaling and prove that absence succeeds while a
  replacement generation remains preserved and reported as changed state. Add
  a replacement-publication barrier between manager reconciliation and each
  later dependency-stop effect; the replacement must either remain excluded or
  make the shutdown fail before the first such effect. Finally, inject managed
  child-cleanup failure, let the manager exit, and retry through the production
  outer lifecycle command with a stable test-owned descendant still executing.
  The retry must retain the failed generation, exit nonzero before later stop
  effects, and give bounded manual reconciliation guidance. Mutate away the
  persisted failure check and require this outer fixture to fail. Cover a
  terminal manager whose active record remains separately; that crash window
  is indeterminate and must not be reclassified as successful child cleanup.

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

### Paginated Authorization Evidence Tests

For each collection whose absence can authorize an effect, exercise the
production pagination adapter, authorization boundary, and a recording effect
spy together. Handing the policy function an already-complete array does not
test whether the real reader silently truncated its evidence.

At minimum, exercise this matrix with a documented page size such as 50:

| Scenario | Required result |
| --- | --- |
| Empty terminal page | The negative predicate may pass only when authoritative metadata marks the collection complete. |
| Exactly 50 allow-side records and `hasNextPage: false` | The predicate may pass after validating the terminal metadata; page length alone neither invents nor suppresses another request. |
| More than one page with no deny record | Every page is fetched once in cursor order, and the effect runs only after the authoritative terminal page. |
| A decisive deny or blocker as record 51 | The second page is fetched, the predicate denies, and the protected effect is never called. Temporarily stop after the first page and require this regression to fail. |
| `hasNextPage: true` with a missing or unusable cursor | The result is indeterminate and fails closed before the effect. |
| Repeated cursor, cursor cycle, or unique pages exceeding the configured page or record bound | Loop protection stops traversal, reports incomplete evidence, and does not reinterpret the bound as exhaustion. |
| Transport error, timeout, or cancellation after one or more allow-side pages | Partial results are discarded as authorization evidence; no allow decision is published, cached, or sent to the effect. |
| Malformed or contradictory pagination metadata | The adapter rejects the response as incomplete before authorization or effect execution. |

- Assert the exact requested cursors and page count as well as the policy
  result. Include the empty, exact-boundary, multi-page allow, and second-page
  deny cases so an implementation cannot pass by fetching either zero pages,
  only one page, or one unnecessary page.
- Set a small test-only page or record bound and feed distinct cursors past it;
  separately feed a repeated cursor. Both must settle within an independent
  watchdog and produce the same fail-closed incomplete classification without
  calling the effect.
- Inject failure after the first response and before the next response settles.
  Assert that no partial allow-side aggregate or cached `complete` marker
  survives for a retry. A later successful retry must traverse from a valid
  starting state and reach terminal evidence before the effect can run.
- Keep presentation tests separate. A deliberately truncated display response
  may render with a visible truncation label, but passing that response into the
  authorization boundary must be structurally impossible or explicitly
  rejected.

Follow the implementation contract in
[`general-implementation.md`](general-implementation.md#complete-evidence-for-negative-authorization-predicates).

### Exact Keyset Pagination Cursor Tests

Exercise the production cursor serializer, decoder, query adapter, and database
ordering contract together. A helper-only round trip can preserve bytes while
the production query still compares a normalized or incomplete tuple.

At minimum, cover this matrix:

| Scenario | Required result |
| --- | --- |
| Sort timestamp has precision beyond runtime milliseconds | A value such as `2026-08-13T04:15:55.824731Z` survives encode/decode byte-for-byte, and the next query returns a row whose timestamp sorts between `.824731Z` and `.824000Z`. |
| Equal primary sort values cross a page boundary | The deterministic unique tie-breaker appears in the cursor and continuation predicate; every row appears exactly once in the declared order. |
| Missing, extra, malformed, unsupported, or out-of-range cursor component | Decoding fails before the query adapter executes, with no best-effort normalization or partial predicate. |
| Omitted, invalid, or excessive requested page size | The adapter applies its bounded default or rejects before querying; no path can request an unbounded page. |
| A concurrent row is inserted ahead of the cursor between pages | Continuing from the original cursor returns each remaining original row exactly once and does not repeat a prior row; the new leading row is visible only to a fresh traversal unless snapshot semantics say otherwise. |

- Assert both the decoded tuple and the exact query parameters. Include sort
  directions, null handling, collation-sensitive components when applicable,
  and the exclusive comparison shape so encoder and query defects cannot mask
  each other.
- Use a real database integration test when database parsing, collation, null
  ordering, or timestamp comparison is part of the contract. Keep a focused
  serializer test as the fast byte-preservation diagnostic, but do not use it
  alone to claim query correctness.
- Mutation-check the precision boundary: replace the cursor timestamp with the
  result of a JavaScript `Date.toISOString()` round trip, or equivalently
  truncate its fractional seconds to milliseconds. Require the continuation
  assertion to fail by demonstrating the skipped between-value row. Build the
  expected timestamp independently from the encoder so the same normalization
  defect cannot change both sides of the assertion.
- Also mutate away the unique tie-breaker, make the comparison inclusive, and
  move validation after query construction. Require at least one focused test
  to fail for each mutation before accepting the cursor contract.

Follow the implementation contract in
[`general-implementation.md`](general-implementation.md#preserve-exact-keyset-cursor-tuples).

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

### Readiness-Gated Secret Hydration Tests

- Inject a hydration spy at the orchestration boundary. For every readiness
  failure, cancellation, timeout, and retry result, assert that the spy was
  untouched, no execution process or remote request started, and no ephemeral
  prompt artifact was created. Cover each applicable install, permission,
  version, configuration, profile, and authentication gate rather than one
  representative failure.
- Exercise a fail-then-retry sequence with the same workflow instance. The
  first failed readiness attempt must leave hydration at zero. A later
  successful readiness attempt may hydrate exactly once and only then execute;
  repeated readiness failures must never accumulate hydration calls.
- Keep a compile-time or construction test for the structural boundary where
  the language and tooling support it: readiness accepts only the non-secret
  descriptor and narrowly scoped authentication capability, while execution
  separately requires prompt bytes. A runtime spy proves observed ordering;
  the API-shape test prevents a refactor from making already-hydrated bytes
  available to preflight.
- Exercise the production spawn adapter with a real fake-child sentinel and
  the explicit environment boundary required by
  [Readiness-Gated Secret Hydration](general-implementation.md#readiness-gated-secret-hydration).
  Plant distinct placeholder values in the parent process for every permitted
  startup, authentication-location, and target-provider authentication
  variable, plus a forbidden service credential, workload configuration,
  other-provider credential, and arbitrary unrelated variable. Have the child
  report the keys and placeholder values it can observe. Assert exact
  preservation of the allowlisted set and absence of every forbidden key and
  value; a test that inspects only the constructed environment object does not
  prove what the spawned process received.
- Use placeholders such as `EXAMPLE_ALLOWED_PROVIDER_AUTH`,
  `EXAMPLE_DENIED_SERVICE_AUTH`, and `EXAMPLE_DENIED_UNRELATED_VALUE`, never
  credential-shaped data copied from a host. Capture every process-wide
  environment value before mutation and restore presence, absence, and value
  in `finally`, even when spawn or assertions fail.
- Use generated placeholder markers, never real secrets. Make a readiness fake
  throw or emit a marker, then assert the stable result, logs, checkpoints, and
  diagnostics contain neither that raw marker nor the prompt marker. Also
  confirm that automatic-authentication fakes expose only bounded status or
  error codes, not credential values or raw subprocess output.
- Mutation-check the regression when practical: move hydration before
  readiness, pass the complete execution input into preflight, or let one gate
  skip the readiness-only interface. At least one relevant test must fail for
  each weakened boundary; otherwise the suite proves only the current happy
  path.

### Secret-Bearing CLI And Temporary Namespace Tests

Exercise the production launcher or public entrypoint, its real spawn adapter,
and the supported target CLI together. Reuse the protected-descriptor and
cross-surface sentinel baseline from
[RYA-294](https://linear.app/ryan-hayward/issue/RYA-294/hive-mind-add-post-hygieia-security-and-systemd-publication-gates);
add these distinct hostile-config and namespace controls rather than replacing
or restating that matrix.

For ambient configuration isolation:

- Create an isolated home and plant a harmless default configuration whose
  trace or log directive records requests to a test-owned path. Send a generated
  bearer sentinel through the production stdin or protected-descriptor path to
  a local fake endpoint. Assert that the default config is ignored, no trace
  artifact containing the sentinel appears, and the child receives only the
  reviewed minimal environment.
- For curl, invoke the exact production argv and require `-q`/`--disable` to be
  argument one. Run two mutations—omit it and place it after another option—
  while keeping `.curlrc`, stdin config, endpoint, and sentinel unchanged. The
  hostile trace must make the sentinel-exclusion assertion fail in both
  mutations, proving that the suite detects omission and ordering regressions.
- Include an allowed controlled-config case so the test distinguishes ignored
  ambient input from a deliberately supplied minimal config. Keep endpoint,
  files, and marker local and disposable; never use a real credential, proxy,
  account, or external service.

For temporary credential namespace custody, run the same production entrypoint
against this fixture matrix before any secret-bearing child is launched:

| Existing parent shape | Required evidence |
| --- | --- |
| Owner-only runtime directory and private child | Accept after validating every component; create the leaf exclusively with its private mode and verify the opened object. |
| Direct parent symlink | Reject before leaf creation or cleanup; the test-owned outside target remains unchanged. |
| Symlink at an earlier ancestor | Reject at that component before descending; no descendant appears in the outside target. |
| Non-sticky attacker-writable parent | Reject even when a pre-existing leaf is mode `0600`; the launcher and secret-write spies remain untouched. |
| Explicitly supported root-owned sticky system temporary directory | Accept only through the documented sticky fallback and a private operation-owned child; altered owner, missing sticky bit, or unexpected mode fails closed. |

- Assert component-open, validation, descent, exclusive leaf creation, and
  launcher events in order. Inspect the opened leaf rather than only a path or
  mocked mode value. Make the unsafe-parent cases prove that leaf permissions
  and namespace custody are independent predicates.
- If the implementation claims concurrent-replacement resistance, add a real
  descriptor-relative or equivalent race fixture that swaps a component after
  validation and proves continued use of the pinned object or fail-closed
  rejection. If those primitives are unavailable, assert the documented
  narrower attacker model instead of weakening the expected result to a second
  successful path check.
- Allocate every home, trace, parent, outside target, fake endpoint, and marker
  beneath test-owned temporary state. Register cleanup before launch, restore
  process-wide environment in `finally`, and prove no test-prefixed artifact or
  process remains.

Follow the production boundaries in
[`general-implementation.md`](general-implementation.md#secret-bearing-cli-configuration-isolation)
and
[`general-implementation.md`](general-implementation.md#temporary-credential-namespace-custody).

### No-Echo Credential Handoff And Elevation Tests

Run the production public credential entrypoint, not an injected reader or a
direct storage method, through a real pseudo-terminal. Snapshot the terminal
attributes before launch and assert exact restoration after success, user
cancellation, reader failure, child failure, and every supported signal path.
Send a generated sentinel as the credential and prove the consumer receives
the exact bytes while the PTY transcript does not echo them.

Run the same entrypoint with redirected pipe input and require denial before
reading or hydrating the credential, opening a secret-bearing temporary, or
starting the storage/elevated child. Test EOF and cancellation while input is
pending, plus an error after no-echo mode is enabled; each path must settle
within a watchdog, restore terminal mode, close the PTY and child descriptors,
and leave no process or file residue.

Capture the complete production process tree's argument vectors, bounded
stdout and stderr, structured logs, journal fixture, checkpoints, and
test-owned files. Require the sentinel to be absent from every surface except
the intended protected input and receiving in-process buffer, then clear that
buffer. Reuse the protected-descriptor and cross-surface sentinel matrix from
[RYA-294](https://linear.app/ryan-hayward/issue/RYA-294/hive-mind-add-post-hygieia-security-and-systemd-publication-gates)
instead of restating its complete surface inventory. When systemd supplies the
terminal, also apply the fd-routing contract in
[`systemd-interactive-descriptors.md`](systemd-interactive-descriptors.md).

Exercise the exact elevated launcher from that same entrypoint with the
invoking runtime resolved to a validated absolute executable before input and
with only the documented minimum environment. Make the invoking user's
private runtime available under a directory absent from the elevation
environment's `PATH`; the absolute-runtime path must still succeed. Mutate the
launcher to delegate a bare runtime name to elevated `PATH` lookup and require
failure before hydration or storage mutation. Assert the absolute entrypoint,
non-interactive elevation options, option boundary, and environment allowlist,
but keep every fixture path and marker generated and host-neutral.

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
