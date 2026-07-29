---
name: coding-style
description: Apply Ryan Hayward's shared coding, implementation, refactoring, automated testing, CI container hardening, accessibility, preferred tech stack, TypeScript, React, shell-script safety, and code review preferences. Use for software engineering tasks including feature implementation, bug fixes, refactors, stack selection, dependency choices, UI accessibility work, test work, security testing, subprocess lifecycle contracts, GitHub Actions job containers, Bash admin scripts, code review, PR review response, file/type organization, template/query/prompt placement, React components, TypeScript contracts, and validation planning.
---

# Coding Style

Use this skill as shared engineering taste for software work. Let the target repository's existing architecture, tooling, and conventions lead; use these references to fill in judgment calls about structure, review style, and validation.

## Reference Map

Read only the files needed for the current task:

- `references/general-implementation.md`: implementation, refactoring, file organization, helper extraction, type placement, file-size signals, duplication, large query/prompt/template strings, host-neutral reusable content, subprocess platform contracts, and external CLI contracts.
- `references/shell-safety.md`: implementing or reviewing Bash input validation and path handling, especially for destructive or administrative scripts.
- `references/automated-testing.md`: writing, fixing, or reviewing tests; especially cleanup for files, processes, services, timers, and process-wide state.
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
