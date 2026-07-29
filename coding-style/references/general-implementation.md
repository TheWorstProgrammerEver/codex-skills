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
- Test fixtures and examples may use realistic names or paths when they make the scenario clearer, provided they remain non-secret and are not presented as production defaults.

## External CLI Contracts

- Treat an external CLI's accepted arguments as a versioned integration contract. When implementing or reviewing code that launches a CLI, verify the exact subcommand against the target environment's current `--help` output or current official documentation; support on a parent command, sibling subcommand, or older release is not sufficient evidence.
- Keep mocked process tests for fast coverage, but do not use them alone to claim a live runner works. When the live path is part of the completion claim, run a narrow contract check or dry run against the target binary using the exact generated argument list. Prefer a check that reaches argument parsing without causing external side effects; otherwise use an isolated integration test and state the unverified boundary.
- For wrappers around `codex exec`, inspect `codex exec --help` and exercise the wrapper-shaped arguments against the installed target CLI before claiming the live path works.

## Subprocess Platform Contracts

- Treat timeout, cancellation, escalation, and descendant cleanup guarantees as platform-specific compatibility contracts. Before implementing or reviewing a subprocess adapter, identify every operating-system family advertised by its package or release metadata and public documentation.
- Terminating a direct child or shell process is not evidence that its descendants terminated. POSIX process groups and group-directed signals establish only the process-control model they were tested against; do not infer Windows process-tree cleanup from POSIX lifecycle evidence.
- For every advertised platform, implement a platform-appropriate full-tree termination strategy and validate the claimed lifecycle bounds on that platform. Record the process-control model so shared semantics are explicit, but do not substitute another operating system's test run. Follow the real cleanup coverage in [`automated-testing.md`](automated-testing.md#bounded-subprocess-lifecycle-tests); mocked calls or a single-platform test run are not cross-platform lifecycle evidence.
- When a platform lacks an implemented and validated cleanup strategy, exclude it consistently in package or release metadata, public compatibility and API documentation, and an early runtime guard that rejects before starting a command. A restriction in only one of those surfaces leaves a misleading compatibility contract.
- Keep public implementation wording aligned with the adapter that actually runs. If lifecycle requirements replace `exec` with `spawn(..., { shell: true })`, describe a spawn-based shell adapter rather than claiming the implementation uses `exec`; distinguish a public operation named `exec` from the underlying Node.js primitive when both concepts appear.
- Require review evidence to map each advertised platform to its termination mechanism and lifecycle validation, or to show the matching metadata, documentation, and runtime exclusion. The reviewer should not need source-task history to determine which contract applies.

## Completion Checks

- Re-scan touched files for responsibility creep before finishing.
- Check whether new helpers or types are owned by the right domain.
- Run the smallest meaningful validation command set and state any skipped validation with the reason.
