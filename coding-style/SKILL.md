---
name: coding-style
description: Apply Ryan Hayward's engineering preferences to fixes, refactors, accessibility, tests, security, host-diagnostic evidence, fixtures, pagination and keyset cursors, structured config, artifact conformance, downloadable skill artifacts, lockfiles, artifact caches and promotion, launcher checks, global npm CLIs, filesystem modes, stale locks, destructive devices, secret hydration and CLI isolation, temporary credential namespaces, reversible credential rotation, no-echo PTY handoff, elevated launchers, external effects, persistent host-profile inboxes, atomic replacement, sensitive-file migration, durable-state and recovery validation, replay, retry, clock and process identity, Codex errors, URL/path validation, subprocesses, systemd timers and TTYs, live checkpoints, cancellation and orchestration, GitHub Actions containers, Bash, reviews, templates, React, TypeScript, and validation planning.
---

# Coding Style

Use this skill as shared engineering taste for software work. Let the target repository's existing architecture, tooling, and conventions lead; use these references to fill in judgment calls about structure, review style, and validation.

## Reference Map

Read only the files needed for the current task:

- `references/general-implementation.md`: implementation, refactoring, file organization, helper extraction, type placement, file-size signals, duplication, large query/prompt/template strings, host-neutral reusable content, public example and internal fixture boundaries, complete evidence for negative authorization predicates, exact keyset cursor preservation, structured-configuration mutation, readiness-gated secret hydration, secret-bearing CLI configuration isolation, temporary credential namespace custody, reversible credential rotation, elevated runtime launchers, prompt-driven external-effect execution, persistent host-profile inbox bridges, atomic-file durability, transactional sensitive-file migration, safe whole-directory replacement, filesystem bundle directory modes, durable-state trust boundaries, identity-safe stale file-lock takeover, recovery validation boundaries, Codex error projection contracts, stable clock scope across executions, stable post-crash process identity, subprocess platform contracts, cancellation settlement and orchestration propagation, and external CLI contracts.
- `references/host-diagnostic-evidence.md`: collecting and reporting target-scoped block-device capability evidence, normalizing virtual and memory-backed device identity, resolving effective layered systemd configuration, and separating observations from conclusions.
- `references/immutable-artifact-acquisition.md`: acquiring, resuming, verifying, caching, quarantining, promoting across local or remote filesystems, and fault-testing immutable artifacts without exposing unverified bytes.
- `references/packaged-runtime-verification.md`: packaging native or foreign-architecture runtimes with independent archive, extracted-tree, executable identity and mode, placement-manifest, target-rescan, artifact-backed global npm CLI deployment, isolated service-unit checks, and installed system-service namespace validation.
- `references/systemd-timer-lifecycle.md`: installing, re-arming, and validating system-manager timers across repeat installation, configuration-mode transitions, and condition-skipped services.
- `references/systemd-interactive-descriptors.md`: reviewing, implementing, and testing stdin/stdout/stderr routing for systemd services that combine a physical interactive console with redacted structured journal logging.
- `references/transient-live-checkpoints.md`: planning and reviewing physical or production validations whose required interruption must occur at a transient mid-flight checkpoint before irreversible advancement.
- `references/destructive-device-safety.md`: implementing or testing imaging, provisioning, recovery, customization, or other workflows that can unmount from or write to a block device.
- `references/shell-safety.md`: implementing or reviewing Bash input validation, path handling, and temporary credential namespaces, especially for destructive, administrative, or secret-bearing scripts.
- `references/automated-testing.md`: writing, fixing, or reviewing tests; especially structured-configuration mutation, pinned external-artifact fixture conformance, downloadable skill artifact generation and serving, native optional-dependency lockfile portability, final-path launcher and system-service namespace smoke tests, readiness-gated secret hydration, hostile ambient CLI configuration, temporary credential parent trust, reversible credential-rotation interruption and concurrency tests, no-echo PTY handoff, elevated runtime selection, prompt-driven external effects, persistent host-profile inbox bridges, atomic local and remote file promotion, whole-directory replacement, transactional sensitive-file migration, filesystem bundle directory modes, serialized producer-consumer compatibility, Codex structured error projections, paginated authorization evidence, exact keyset cursor contracts, durable-state trust boundaries, stale file-lock takeover races, recovery semantic invariants, derived-artifact replay, retry budgets, stable clocks, and process identities, security-contract testing, URL-to-filesystem validation, structural secret exclusion, deterministic cancellation races, orchestration cancellation matrices, and cleanup for files, processes, services, timers, and process-wide state.
- `references/github-actions-container-hardening.md`: hardening GitHub Actions job containers without breaking runner-owned command-file mounts, including runner-specific user mapping and runtime validation.
- `references/preferred-tech-stacks.md`: choosing default platforms, dependencies, hosting, frontend, backend, mobile, cloud, deployment, environment strategy, and environment setup documentation.
- `references/accessibility.md`: UI accessibility expectations, light/dark mode, semantic controls, animation preferences, WCAG checks, and web AOM inspection.
- `references/code-review-workflow.md`: reviewing code, responding to PR comments, structuring review-response commits, and writing final PR summaries.
- `references/typescript-style.md`: TypeScript-specific type placement, inference, boundaries, and module shape.
- `references/react-style.md`: React component, hook, state, and UI file organization.

For Supabase-backed React TypeScript apps, also use `$supabase-react-ts` for stack-specific project structure, Supabase Auth, Edge Functions, RLS, local config, and security testing. Use this skill for the broader coding and review preferences that still apply.

## Working Loop

1. Inspect the codebase before editing. Match existing framework choices, naming, module boundaries, test tools, and command scripts unless there is a concrete reason to diverge.
2. Load the relevant reference files from the map above.
3. Keep changes small and coherent. Prefer narrow files, well-named helpers, colocated types, and focused constants/templates over broad dumping grounds.
4. Treat tests, accessibility, and validation as part of the implementation. Choose the narrowest meaningful commands, and add cleanup checks when tests create files, processes, services, timers, databases, or global state.
5. In code review, lead with bugs and risks. In review-response work, address distinct comments with targeted changes and concise thread replies.
