# General Implementation Style

## Organization

- Prefer small, singly responsible files organized by domain, feature, or concern.
- Avoid broad catch-all dumping grounds such as a root-level `types.ts` that accumulates unrelated concepts.
- Colocate types, constants, fixtures, templates, and helpers with the files or domain folders that own them when practical.
- Keep shared modules narrow. Promote code to shared utilities only after more than one owner clearly needs the same behavior.
- Treat file size as a design signal:
  - below 100 lines is excellent;
  - below 200 lines is usually the sweet spot;
  - above 200 lines deserves a single-responsibility review;
  - above 500 lines is a strong refactor signal.

## Functions And Flow

- Keep complex functions legible with well-named helpers that expose intent.
- Prefer expression-oriented and functional style when it improves readability.
- Avoid clever chaining, abstraction, or point-free style when named intermediate values would make the code easier to audit.
- Avoid unnecessary keywords, symbols, and type declarations when inference is clear and contract strictness remains intact.
- Keep side effects explicit and close to the workflow that owns them.

## Duplication And Abstraction

- Respect SOLID, DRY, and YAGNI together. Do not invent abstractions for a single speculative caller.
- Use the "1, 2, 3 = Refactor" rule: one instance is normal; two similar instances can be acceptable; three repetitions should usually trigger a refactor.
- Prefer a small helper or domain object over a large generalized framework when the repeated shape is local and specific.
- When refactoring, preserve behavior first, then improve naming and boundaries.

## Large Strings

- Avoid inlining large strings that represent queries, prompts, instructions, generated text, or templates inside workflow code.
- Prefer colocated template files or focused constants owned by the same feature/domain.
- Use a small reusable hydration or interpolation helper when templates need variables.
- If a separate template file is not practical, isolate large strings in a focused module with named exports rather than embedding them in unrelated logic.

## Portable Production Content

- In production code, prompts, README/operator content, templates, and reusable docs, prefer role-based or configurable names over agent-specific names, personal hostnames, absolute home paths, or other local-only host facts.
- When reusable Codex agent examples need stable placeholders, use `my-agent` for the durable agent identity and generated hostnames, and use `my-user` for local Unix/SSH usernames and home paths such as `/home/my-user`.
- When env-file, systemd, setup-script, or default-config examples use `$HOME`, `${HOME}`, `~`, `%h`, or similar host-neutral placeholders for executable path defaults, verify that the consuming loader or runtime expands the syntax before use instead of treating it as a literal string. Add a focused parser test, unit test, or dry run when changing reusable defaults from absolute paths to placeholders.
- Avoid real agent names or `codex-agent` as generic host identity examples. Use them only when referring to a fixed service, repository, account, package, binary, or other named artifact rather than an example host.

### Public Examples And Internal Fixtures

Treat visitor-facing examples as a supported public surface, separate from
internal conformance evidence:

- Keep `examples/`, starter templates, copied snippets, and their README files
  current with the supported CLI or SDK. Use fake, role-based identities,
  repository coordinates, paths, hostnames, device labels, and other
  illustrative values. Do not direct visitors to an original scratchpad,
  one-off derivation script, historical repository pin, or operator workspace
  as the current source of truth.
- Keep canonical JSON, recorded trees, goldens, source snapshots, and
  derivation provenance under package or test fixture ownership. Retain useful
  internal origins and realistic non-secret values there when conformance or
  reproducibility needs them, but label the material as fixture data rather
  than an operator template and keep visitor instructions independent of it.
  Do not duplicate or sanitize away provenance that belongs only to this
  internal contract.

Give public examples executable release coverage:

1. Load or compile every example through the current public SDK, schema, or
   command path; a syntax-only parse or stale generated artifact is not enough.
2. Exercise at least one representative example across the product boundary
   the visitor relies on, such as validation plus rendering, synthesis, plan
   generation, or another harmless dry run.
3. When examples contain variables, substitutions, or templates, add a
   fail-closed negative control: remove or corrupt a required value and prove
   the same public path rejects unresolved placeholders, invalid expansion, or
   missing input rather than emitting a plausible partial result.

Run a visitor-surface scan over the explicitly maintained public roots and
copied documentation, not over the entire fixture tree. Check for secret and
private-key patterns, personal or private host identities, absolute operator
home/workspace paths, private repository pins, removable-media paths and device
identifiers, and stale provenance language such as "copied from", "original
scratchpad", or "generated by" when it incorrectly presents history as current
authority. Keep an allowlist narrow, reviewed, and tied to fake illustrative
values. Prove the scan boundary with two controls: a planted visitor-facing
violation must fail, while an internal fixture may retain clearly labelled,
non-secret provenance without entering the visitor scan.

## Structured-Configuration Mutation

Treat TOML, INI, YAML, service files, and similar configuration as structured
documents. A line filter that deletes or replaces a matching key without
tracking its table, section, mapping, or value boundaries can silently cross
into a named profile and remove an independent override. Comments, multiline
values, dotted or nested keys, and equivalent quoted or escaped key spellings
make textual matching still less reliable.

- Prefer a real parser or format-aware editor. Define the exact owned key path
  and section, the replace-versus-reject policy for duplicates or collisions,
  and the preservation contract for unrelated sections, profiles, values,
  comments, and formatting. If preserving presentation is required, choose an
  editor that retains it rather than relying on a parse-and-reserialize cycle.
- If a shell or line-oriented transformation is unavoidable, make it
  deliberately section-aware and support only a documented subset of the
  format. Normalize key identity semantically, including quoted and
  escape-equivalent spellings. Reject ambiguous dotted or nested ownership,
  multiline constructs, duplicate keys, or other unsupported structure before
  changing the destination; do not let unfamiliar valid syntax fall through a
  best-effort rewrite.
- Parse and validate the complete generated candidate with the authoritative
  format parser before publication. Parsing only the original does not prove
  that deleting one spelling and inserting another did not create a duplicate,
  scalar/table collision, or otherwise invalid document. Also assert the
  intended target value and preservation of every unrelated semantic value.
- Write the candidate to an operation-owned temporary file and replace the
  destination atomically only after all validation succeeds. On unsupported
  input or candidate failure, preserve the original bytes and mode, remove the
  temporary output, fail closed, and give bounded operator guidance rather than
  partially repairing the file.

Use the real-path fixture matrix in
[`automated-testing.md`](automated-testing.md#structured-configuration-mutation-tests).
When crash-durable publication is part of the contract, also apply
[Crash-Durable Atomic File Replacement](#crash-durable-atomic-file-replacement).

## Readiness-Gated Secret Hydration

When execution needs installation, permission, version, configuration, profile,
or authentication checks, make readiness and secret-bearing workload
construction separate stages:

```text
non-secret descriptor -> readiness -> secret hydration -> execution
```

Encode the separation in the API instead of relying only on call order. A
convention such as "always call `prepare` first" can regress when a refactor
builds one complete input early, passes it through preflight, or adds diagnostic
logging there. A type, interface, capability, module boundary, or separate
process makes prompt bytes structurally unavailable to readiness code and turns
many ordering regressions into compile-time or construction failures.

For example, a typed implementation can expose a readiness-only input and
return an execution capability that does not exist until readiness succeeds:

```ts
type ReadinessInput = {
  readonly descriptor: NonSecretWorkDescriptor;
  readonly auth: AuthenticationCapability;
};

type ReadyExecutor = {
  execute(input: { readonly prompt: Uint8Array }): Promise<void>;
};

const ready = await provider.prepare(readinessInput);
const prompt = await promptHydrator.hydrate(secretReferences);
await ready.execute({ prompt });
```

`NonSecretWorkDescriptor` may contain provider and step identifiers, public
command shape, required version, profile name, working-directory policy, and
opaque secret references. It must not contain hydrated prompt bytes, expanded
secret values, a general environment snapshot that can carry them, or a
hydrator capable of producing them. Keep those secret-bearing values in the
post-readiness execution input. In languages without static types, enforce the
same rule with separate constructors, capability objects, modules, or process
messages whose readiness schema cannot represent prompt bytes.

Authentication readiness may itself need sensitive credentials. Give preflight
only a narrowly scoped capability that can perform the required authentication
or status operation without returning credential material; do not give it the
prompt hydrator or complete workload. Bound and redact every readiness
diagnostic, including install and authentication failures: return stable stage
or error codes, and do not include raw exceptions, subprocess output,
credentials, hydrated content, or attacker-controlled configuration text.

The same pattern applies outside interactive providers. A deployment workflow,
for example, can validate the client installation, required version, selected
account, and authenticated session from non-secret metadata; only after those
checks succeed should it resolve secret references into a deployment payload
and submit it.

Follow the failure, retry, and mutation checks in
[`automated-testing.md`](automated-testing.md#readiness-gated-secret-hydration-tests).

## Crash-Durable Atomic File Replacement

On POSIX filesystems where reboot-safe persistence is part of the contract,
distinguish file-content atomicity from directory-entry durability. A rename can
make the complete new file visible to the current process without proving that
the renamed directory entry will survive a crash.

- Exclusively create a recognizable, operation-owned temporary file in the
  destination directory with private permissions. Write all content, sync the
  temporary file, close it, rename it over the destination, and then sync the
  containing directory. Do not report a durable commit merely because rename
  succeeded or the destination is visible.
- When the destination directory can be created recursively, anchor recovery at
  a validated, safely bounded root. Either create one directory component at a
  time and sync its containing parent before continuing, or resolve the full
  bounded directory chain and sync it root-to-leaf before opening a temporary
  file.
- On retry, sync that full bounded chain even when recursive directory creation
  reports that it created nothing. A previous attempt may have created several
  visible ancestors and stopped before the first containing-directory sync;
  syncing only the destination's immediate parent does not make the higher
  ancestor entries durable.
- Recover before accepting an existing destination. Re-sync the bounded
  ancestor chain, remove only temporary artifacts that the operation can prove
  it owns, and sync the destination directory after cleanup even when no
  temporary artifact remains. The no-temp case is required after interruption
  between rename and directory sync.
- Keep cleanup and retry idempotent. An absent destination stays absent after a
  pre-rename failure, an old destination remains intact until rename, and
  unrelated files in the directory are never cleanup candidates.

Follow the failure-injection scenarios in
[`automated-testing.md`](automated-testing.md#atomic-file-durability-tests).
If a target platform or filesystem cannot provide the required file or
directory sync primitive, narrow the persistence contract rather than claiming
reboot-safe atomic replacement. Keep rename and directory-sync recovery details
in [RYA-158](https://linear.app/ryan-hayward/issue/RYA-158/hive-mind-verify-directory-durability-on-atomic-write-recovery);
the trust checks below are independent requirements, not substitutes for that
durability protocol.

## Transactional Sensitive-File Migration

Treat a move from bootstrap or staging storage into durable protected storage as
a transaction, not as copy followed by cleanup. The transaction must establish
four separate properties:

| Property | Required evidence |
| --- | --- |
| Secure containment | Every traversed component and leaf is the intended type and identity inside a trusted boundary; no untrusted directory-entry substitution can redirect a read or privileged mutation. |
| Durable publication | The complete destination has the required private ownership and mode, its file is synced, publication is atomic, and the destination directory is synced. |
| Durable unlink | The verified source entry is unlinked and its containing directory is synced. |
| Physical secure erase | A separate storage-specific sanitization contract removes recoverable physical remnants. Ordinary unlink does not provide this property. |

Use this ordered protocol:

1. Open trusted source and destination roots, traverse component by component,
   and retain the verified directory and file descriptors. Reject symlinks,
   special files, unexpected owners or modes, and—when the contract requires
   single-file custody—any source, temporary, or destination regular file whose
   link count is not one. Apply the
   [durable-state directory trust rules](#durable-state-directory-trust).
2. Durably reserve an opaque transaction identifier and the exact generated
   temporary leaf before writing secret bytes. Create that private temporary
   file exclusively in the destination directory, verify its identity, and
   durably add that non-secret identity to the transaction record before
   copying. Copy from the already-open source, set ownership and mode through
   the open file descriptor, verify the result, sync it, and then persist the
   `prepared` checkpoint.
3. Atomically rename the exact prepared temporary entry within the verified
   destination directory, sync that directory, reopen the destination relative
   to its retained descriptor, and verify regular-file type, single-link
   custody, content, ownership, and mode. Only then persist the `installed`
   checkpoint. Reuse the
   [crash-durable atomic-file protocol](#crash-durable-atomic-file-replacement)
   for file and directory sync semantics.
4. Before unlinking, revalidate that the source directory entry still names the
   opened source object, require the source's custody metadata to remain valid,
   and compare the installed destination with that source through their open
   descriptors. Require a durable `installed` checkpoint before unlink. Remove
   the source relative to its verified directory descriptor, sync the source
   directory, and only then persist `source-removed`.
5. Persist `committed` only after recovery can prove the installed destination
   and durable source-entry removal. Transaction-record removal, when required,
   is a later atomic metadata update and must not weaken those invariants.

Make every phase checkpoint an atomic, crash-durable state transition. Persist
only the opaque operation identity, exact operation-owned temporary name,
constrained locators or non-secret file identity needed for recovery, expected
ownership and mode, and phase. Never persist source bytes, destination bytes,
content-derived values, or an unkeyed digest that makes a low-entropy secret
brute-forceable. Follow the
[recovery validation boundaries](#recovery-validation-boundaries) for legal
phase relationships and the
[structural secret-exclusion rules](automated-testing.md#structural-secret-exclusion)
for the serialized contract.

Keep traversal, reads, metadata mutation, publication, verification, unlink,
cleanup, and both directory syncs relative to retained trusted descriptors or
an equivalent race-safe capability. A successful `lstat` followed by
pathname-based `chown`, `chmod`, `rename`, or `unlink` only repeats a check; an
attacker can replace an ancestor or leaf entry after that check and before the
mutation. Descriptor-relative ancestry prevents re-resolution through a
substituted parent, but it does not by itself pin a mutable leaf. If an
untrusted actor can write the verified directory, require a primitive or
exclusion boundary that conditionally consumes the verified leaf identity;
otherwise narrow the attacker and platform contract instead of claiming
race-safe custody.

Recovery must re-establish invariants rather than trust either visible files or
the checkpoint alone:

- At `prepared` or earlier, preserve the source. Resume publication only from
  the exact verified prepared entry; remove partial or abandoned plaintext
  temporaries only when their full generated name and identity belong to the
  recorded transaction, then sync the destination directory. Preserve every
  near-match or unrecognized file.
- At `installed`, reverify the destination before source removal. If the source
  still exists, repeat the identity and live content comparison before unlink.
  If interruption occurred after unlink, use the durable `installed` transition
  and the protected destination identity to reconcile the absent source, sync
  the source directory, and advance; stop for manual reconciliation if the
  destination can no longer be proven to be the installed object.
- At `source-removed`, require the destination invariant and a durably absent
  source entry before committing. Never recreate secret material from
  checkpoint data, and never delete the only remaining valid copy to repair an
  ambiguous phase.

Unlink removes one directory entry. Even after the source-directory sync, data
may remain in another hardlink, filesystem journal, snapshot, copy-on-write
extent, device remapping layer, or flash cell. Rejecting hardlinks enforces the
transaction's custody precondition; it does not turn unlink into physical
erasure. Specify encrypted-storage key destruction or an appropriate
media-sanitization procedure separately when physical erasure is required.

Use the interruption and swap scenarios in
[`automated-testing.md`](automated-testing.md#transactional-sensitive-file-migration-tests).

## Safe Whole-Directory Replacement

Treat replacement of a generated directory as a separate protocol from atomic
single-file replacement. The file protocol above covers one temporary file,
one destination entry, and recovery of its containing-directory sync. A
directory replacement must durably build a complete tree and preserve the
previous tree across two promotion renames.

- Resolve and validate the requested output before allocating temporary state.
  Reject filesystem roots, empty or current-directory targets, and configured
  user, workspace, or other broad destructive roots. Require a specific output
  leaf beneath a validated existing parent, and apply the
  [directory-chain trust checks](#durable-state-directory-trust) before
  inspection, cleanup, or rename.
- Refuse an existing output by default. When replacement is explicitly
  requested, accept only a real directory that is recognizable as this tool's
  output through stable markers and required structure. Reject a symlink,
  special file, unrelated directory, or partial lookalike before moving or
  deleting anything.
- Allocate recognizable, exclusive staging and backup siblings under the
  output's validated parent so every promotion rename stays on the destination
  filesystem. Write only into staging. Sync each file and every created
  directory from the leaves through the staging root before promotion.
- Keep the prior output intact until staging is complete. For replacement, move
  the prior output to the owned backup, promote staging to the requested output,
  and sync the parent directory. Remove the backup only after promotion has
  succeeded; when crash durability is promised, sync the parent again after
  backup removal.
- On a pre-commit failure, remove the operation-owned staging and any unused
  backup artifact. When promotion fails and `backup -> output` restores the
  prior output, sync the validated parent before treating that rollback as
  durably restored, then clean unused operation-owned artifacts. If the sync
  fails, preserve the prior tree at the requested output and surface an
  unresolved recovery result rather than reporting successful restoration.
  Never broaden cleanup to names that are merely prefix-matched or otherwise
  not proven to belong to this operation.
- Treat failed rollback as a distinct recovery result. If another entry has
  appeared at the requested output or restoring the backup otherwise fails,
  do not delete that entry to force the rename and do not remove the backup in
  unconditional cleanup. Preserve the sole recoverable prior tree, sync the
  validated parent to persist the earlier `output -> backup` rename, and only
  then return a structured recovery locator proven to name the generated
  backup directly beneath that parent. If the parent sync fails, keep the
  backup and report that recovery durability is unresolved; never delete the
  only prior copy while handling or reporting the sync failure.
- Keep recovery diagnostics bounded and redacted. Use a generic message and the
  validated operation-owned sibling locator; do not append raw exception text,
  candidate file contents, credentials, or arbitrary attacker-controlled paths.

Use the deterministic scenarios in
[`automated-testing.md`](automated-testing.md#whole-directory-replacement-tests).
Centralize the protocol in one replacement helper rather than duplicating
rename and cleanup sequences across callers.

## Filesystem Bundle Directory Modes

Treat every directory recorded by an image, package, archive, deployment bundle,
or placement manifest as an installation effect. A staging-only ancestor can
become a target `chmod` when an adapter replays the manifest, so a correct
private leaf mode is not enough.

- Separate shared namespace ancestors from application-owned leaves. Create or
  verify shared ancestors under their platform policy, then create the private
  leaf with its own exact mode. For example, `/var`, `/var/lib`, and `/run` are
  shared ancestors; `/var/lib/my-app` and `/run/my-app` can be
  application-owned leaves with mode `0700`.
- Do not pass a private leaf mode to one recursive directory-creation call when
  multiple components may be absent. Some filesystem APIs apply that mode to
  every directory they create, which can make a fresh staging root represent
  `/var`, `/var/lib`, and `/run` as `0700`.
- Give every generated directory entry an explicit ownership and mode policy
  before serialization. Do not infer an ancestor's installation mode from a
  descendant. Omit shared ancestors from the placement manifest when the
  consumer does not own them; when the format requires them, record their
  explicit shared policy rather than whatever mode happened to exist in
  staging.
- Make placement non-destructive for shared ancestors. An adapter must not
  replay private leaf metadata onto an existing shared directory or normalize
  unrelated shared paths as a side effect of installing one application.
  Validate the complete manifest before applying any mode change.

Use the empty-root and existing-shared-root scenarios in
[`automated-testing.md`](automated-testing.md#filesystem-bundle-directory-mode-tests).
Keep crash-durable creation and directory-chain trust as separate contracts;
correct installation modes do not substitute for either.

## Durable State Directory Trust

A private destination file and an atomic replacement protocol do not make its
containing directory trustworthy. Before cleanup, inspection, recovery, or
replacement, fail closed unless the full directory chain is securely
established inside the intended root.

- Validate pre-existing components as rigorously as newly created ones. Require
  real directories rather than symlinks, the expected trusted owner, and a
  permission policy that excludes untrusted write access. Applying a private
  mode during creation says nothing about a directory that already existed.
- Traverse component by component: securely open or create one child, validate
  that component before descending through it, and only then open or create the
  next child. Validating a completed chain after recursive creation is too late;
  an untrusted symlinked ancestor may already have redirected descendant
  creation outside the intended root.
- Bind validation and use to directory handles with no-follow, relative
  operations where the platform supports them. A path-based check followed by
  a separate cleanup, open, or rename can be raced. When the runtime cannot
  provide the primitives needed for the promised attacker model, narrow the
  trust contract explicitly.
- Do not read, remove residue, chmod, or replace state through an unsafe
  component merely because the final file is owned by the expected user and
  mode `0600`. Any repair flow must first establish that it is operating on the
  intended directory entry without following an untrusted redirect.

Use the denied scenarios in
[`automated-testing.md`](automated-testing.md#durable-state-trust-boundary-tests).

## Identity-Safe Stale File-Lock Takeover

Treat stale recovery as a lock-state transition, not as cleanup of an old
pathname. This sequence is unsafe:

```text
read owner A -> decide A is stale -> unlink lock path -> acquire
```

Two recoverers can both observe A. The first can unlink A and acquire as B
before the second performs its delayed unlink; that unlink then removes B's
live lock and lets the second recoverer acquire as C. Both callers can enter the
critical section before either releases.

- Give every acquisition a unique, unguessable nonce and the stable owner
  identity required by the platform. Exclusively create a unique adjacent
  candidate, write and sync the complete identity there, then publish that
  complete inode at the lock path with a hard link, rename-no-replace, or an
  equivalent atomic absent-to-held transition. A bare exclusive create at the
  lock path publishes its name before its contents and is not sufficient. Do
  not expose a zero-byte or partial primary lock that could mean either live
  initialization or abandoned crash residue.
- Bind the identity that was observed stale to the takeover operation. Use a
  platform primitive that atomically compares and removes or replaces that
  exact generation, a kernel-managed lock whose ownership disappears on
  process or handle death, or a separately serialized recovery protocol. A
  pathname rename or unlink is not identity-bound merely because it is atomic:
  after a delayed call, the pathname may name a newer holder.
- In a serialized recovery protocol, acquire the recovery coordinator first,
  then re-read the primary lock and revalidate its complete identity and
  liveness inside that exclusion boundary immediately before removal. Hold the
  coordinator through removal and the atomic primary-lock acquisition, or
  through a settled failed attempt. If the identity changed or is now live, do
  not mutate it. All takeover paths must honor the same coordinator; otherwise
  an uncoordinated remover preserves the race.
- Prefer a crash-released kernel coordinator or no persistent auxiliary lock.
  If recovery uses a file lease, make that lease obey this same complete
  publication, stable-identity, conditional-release, and identity-safe stale
  takeover protocol. Recover finite chains of abandoned recovery leases using
  the caller's original absolute deadline; recursion must not reset or extend
  the timeout. Clean only exact protocol-owned candidates and lease paths after
  their identities are proven.
- Release the primary or recovery lease only when its current complete identity
  still contains the releasing acquisition's nonce. A delayed release after
  ownership loss must leave the replacement holder untouched. Keep the nonce
  check and unlink in the narrow ownership adapter; the protocol's exclusion
  guarantees must make replacement between them impossible.

Do not use age or a numeric PID alone as stale-owner authority. Apply
[RYA-168](https://linear.app/ryan-hayward/issue/RYA-168/hive-mind-verify-stable-process-identity-before-recovery-signaling)
for stable post-crash process identity and PID-reuse decisions. For verified
resumable artifact-cache state and per-content lock scope, apply
[RYA-175](https://linear.app/ryan-hayward/issue/RYA-175/hive-mind-add-verified-resumable-artifact-cache-guidance)
rather than duplicating that acquisition protocol here.

Use the simultaneous-recoverer and crash-residue scenarios in
[`automated-testing.md`](automated-testing.md#stale-file-lock-takeover-tests).

## Recovery Validation Boundaries

A strict field schema proves only that each serialized value has the expected
shape. Review durable recovery as three separate validation layers:

| Layer | Required decision | Owning boundary |
| --- | --- | --- |
| Field validation | Is every individual value structurally valid? | Serialized-state parser or schema. |
| Cross-field semantic validation | Could the complete document have been produced by the transition API and state machine? | Recovery parser, before the document is classified as valid. |
| External source-plan validation | Do persisted step identities, ordering, and revision claims still refer to the authoritative plan being resumed? | Owning runtime where both the parsed checkpoint and source plan are available. |

- Derive cross-field invariants from the transition API rather than inferring
  them from the serialized type. Cover identity equality, legal phase
  combinations, terminal-state completeness, and required or forbidden related
  records. Classify a shape-valid document that violates any invariant as
  corrupt; never send it through the normal retry or resume path.
- A document can therefore pass every field validator and still be corrupt.
  Keep concrete rejected and accepted examples in the linked semantic-invariant
  test matrix so the implementation and test guidance do not drift.
- Keep checks at the narrowest boundary that has the required context. The
  parser can require `transaction.stepId` to equal `currentStep.id`, but it
  cannot prove that the shared identity exists in the current source plan when
  the plan is not an input. Make that cross-reference an explicit runtime
  validation before any resumed transition or side effect.
- Serialized recovery state must also preserve field-level safety constraints
  of the authoritative plan or command it resumes. Reuse the canonical
  validator for copied values whenever dependency direction permits, including
  rejection of traversal components, ambiguous separators, empty components,
  absolutes, and normalization forms.
- If canonical reuse would create an unsuitable dependency, require an
  explicit parity test that sends the same accepted and denied corpus through
  both validators. Also parse the exact serialized recovery record so the test
  covers the real deserialization boundary rather than helper functions alone.
- Treat validator drift or an omitted state-machine invariant as a
  trust-boundary defect even when the recovery file itself has private
  permissions and a trusted location. Safe storage does not make unsafe
  serialized state safe to execute.

Use the mutation matrix in
[`automated-testing.md`](automated-testing.md#recovery-semantic-invariant-tests).

## External CLI Contracts

- Treat an external CLI's accepted arguments as a versioned integration contract. When implementing or reviewing code that launches a CLI, verify the exact subcommand against the target environment's current `--help` output or current official documentation; support on a parent command, sibling subcommand, or older release is not sufficient evidence.
- Keep mocked process tests for fast coverage, but do not use them alone to claim a live runner works. When the live path is part of the completion claim, run a narrow contract check or dry run against the target binary using the exact generated argument list. Prefer a check that reaches argument parsing without causing external side effects; otherwise use an isolated integration test and state the unverified boundary.
- For wrappers around `codex exec`, inspect `codex exec --help` and exercise the wrapper-shaped arguments, including the production stdin mode, against the installed target CLI before claiming the live path works.
- Treat stdin as part of a `codex exec` wrapper's prompt contract. When the complete prompt is already positional, close or ignore child stdin before waiting; do not inherit an accidentally open descriptor or leave the default pipe open, because the CLI can treat it as additional prompt input and wait for EOF. When the wrapper intentionally appends prompt input through stdin, make that streaming mode explicit and close the stream immediately after the final byte. Apply the focused EOF and streaming fixtures in [`automated-testing.md`](automated-testing.md#codex-exec-stdin-contract-tests).

## Subprocess Platform Contracts

- Treat timeout, cancellation, escalation, and descendant cleanup guarantees as platform-specific compatibility contracts. Before implementing or reviewing a subprocess adapter, identify every operating-system family advertised by its package or release metadata and public documentation.
- Terminating a direct child or shell process is not evidence that its descendants terminated. POSIX process groups and group-directed signals establish only the process-control model they were tested against; do not infer Windows process-tree cleanup from POSIX lifecycle evidence.
- For every advertised platform, implement a platform-appropriate full-tree termination strategy and validate the claimed lifecycle bounds on that platform. Record the process-control model so shared semantics are explicit, but do not substitute another operating system's test run. Follow the real cleanup coverage in [`automated-testing.md`](automated-testing.md#bounded-subprocess-lifecycle-tests); mocked calls or a single-platform test run are not cross-platform lifecycle evidence.
- When a platform lacks an implemented and validated cleanup strategy, exclude it consistently in package or release metadata, public compatibility and API documentation, and an early runtime guard that rejects before starting a command. A restriction in only one of those surfaces leaves a misleading compatibility contract.
- Keep public implementation wording aligned with the adapter that actually runs. If lifecycle requirements replace `exec` with `spawn(..., { shell: true })`, describe a spawn-based shell adapter rather than claiming the implementation uses `exec`; distinguish a public operation named `exec` from the underlying Node.js primitive when both concepts appear.
- Require review evidence to map each advertised platform to its termination mechanism and lifecycle validation, or to show the matching metadata, documentation, and runtime exclusion. The reviewer should not need source-task history to determine which contract applies.

### Stable Recovery Process Identity

A retained current-child handle is an in-process capability: use its lifecycle
events and cancellation method while the owning runner remains alive. After a
runner crash, that handle is gone. A persisted numeric PID or a successful
`kill(pid, 0)` probe is not an equivalent adoption capability because Linux can
reuse the PID and the probe also succeeds for an unreaped zombie.

- On Linux, launch a recoverable process as the leader of a new, isolated
  process group and persist a boot-scoped identity containing the boot ID, PID,
  process-group ID, and `/proc/<pid>/stat` start-time ticks. Require the recorded
  process-group ID to equal the leader PID; do not adopt or group-signal a
  process that joined a shared or unrelated group.
- For same-boot adoption, read the current state and compare every tuple field.
  Treat an absent entry or a leader in zombie or dead state as exited rather
  than live. Keep the detailed cleanup-test predicates canonical in
  [RYA-157](https://linear.app/ryan-hayward/issue/RYA-157/hive-mind-distinguish-live-descendants-from-unreaped-zombies-in)
  and the
  [bounded lifecycle tests](automated-testing.md#bounded-subprocess-lifecycle-tests);
  recovery identity is the additional ownership decision.
- Distinguish observations from authority. PID-only and process-group existence
  probes can support waiting or diagnostics, but they cannot authorize
  adoption, cleanup, duplicate suppression, or a signal after interruption.
  A boot-ID mismatch is prior-boot state; a start-time or process-group mismatch
  is a different same-boot process.
- Re-read and compare the complete identity immediately before a recovered
  group-directed signal, with the check and signal kept in one narrow adapter.
  Signal only the recorded isolated group when that fresh comparison succeeds;
  otherwise fail closed or tear down a separately proven enclosing isolation
  boundary. Repeat the ownership check before escalation. If the recorded
  leader has exited, do not treat its stale group number as authority: require
  stable ownership evidence for the remaining targets or decline the signal.

Use the deterministic scenarios in
[`automated-testing.md`](automated-testing.md#recovery-process-identity-tests).

### Cancellation Settlement

For a bounded subprocess adapter that accepts an `AbortSignal`, keep these
ordering guarantees explicit:

- Check `signal.aborted` before starting the child so an already-canceled
  operation does not spawn.
- After the child exists, register one idempotent abort listener and immediately
  recheck `signal.aborted`. Route the listener and recheck through the same
  guarded cancellation path. This precheck/listener/recheck sequence closes the
  window where an abort event can fire before registration and otherwise be
  missed.
- At the adapter's terminal child boundary—normally `close`, or `error` for a
  spawn failure—synchronously mark the operation settled, capture the accepted
  terminal reason, exit code, and signal, and remove cancellation, timeout, and
  forwarded-signal listeners before starting or awaiting asynchronous
  process-tree cleanup. A later abort while cleanup is pending must not rewrite
  the frozen outcome or start a second termination.
- Make cancellation, terminal settlement, listener removal, and descendant
  cleanup idempotent. Define precedence by the first accepted guarded
  transition, not by wall-clock assumptions about nearly simultaneous events.
- Keep this coordination contract separate from platform lifecycle claims. Use
  the adapter's declared termination mechanism on each supported platform and
  follow the deterministic race fixtures in
  [`automated-testing.md`](automated-testing.md#cancellation-settlement-race-fixtures).

### Orchestration Cancellation Propagation

A runner-level `AbortSignal` is not a shutdown contract unless every nested
operation that can keep the runner pending observes the same cancellation
source. A cancellation check after `await executor.run()` cannot help when that
executor is blocked indefinitely.

- Pass one runner-owned signal or cancellation context through every automatic
  foreground command, manual gate, completion probe or polling loop, sleep or
  backoff timer, queue or resource-acquisition wait, and background-supervisor
  join. Do not substitute unrelated per-step controllers unless they are
  explicitly linked to the runner signal.
- Make every nested executor handle an already-aborted signal and an abort that
  arrives after work starts. Stop accepting new work, cancel its owned
  foreground commands, probes, timers, and descendants, and await their
  cleanup before the executor settles. The runner must also cancel and await
  every registered background or supervised resource from its outer cleanup
  path, regardless of which foreground step was active.
- Do not rely on racing a bare, cancellation-blind promise and abandoning it.
  Potentially non-settling work needs a structured cancellation handle or an
  adapter-owned cleanup operation that lets the orchestrator regain control,
  bound escalation, observe the abandoned promise, and release every owned
  resource. If an executor exposes no such control, it cannot participate in a
  bounded shutdown contract.
- Define a bounded settlement target for the runner and each executor cleanup.
  Resistant foreground or supervised work must use the declared
  platform-specific escalation mechanism; a non-settling manual, probe, or
  timer wait must be interrupted by cancellation rather than released by test
  or operator input.
- Register supervised resources before advancing to the next step so an abort
  cannot occur after launch but before ownership is recorded. Keep cleanup
  idempotent for cancellation, ordinary failure, and partial startup. Attempt
  every registered cleanup even when one fails, then report the aggregated
  cleanup outcome.

Exercise the step-kind matrix in
[`automated-testing.md`](automated-testing.md#orchestration-cancellation-matrix).
This is an orchestration propagation requirement. Keep the adapter-level
precheck, listener-registration, outcome-freezing, and cleanup races canonical
in [RYA-155](https://linear.app/ryan-hayward/issue/RYA-155/hive-mind-cover-subprocess-cancellation-settlement-races)
and the [cancellation-settlement fixtures](automated-testing.md#cancellation-settlement-race-fixtures)
rather than duplicating them in runner tests.

## Completion Checks

- Re-scan touched files for responsibility creep before finishing.
- Check whether new helpers or types are owned by the right domain.
- Run the smallest meaningful validation command set and state any skipped validation with the reason.
