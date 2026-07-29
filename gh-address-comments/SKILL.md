---
name: gh-address-comments
description: Address actionable GitHub pull request review feedback. Use when the user wants to inspect unresolved review threads, requested changes, or inline review comments on a PR, then implement selected fixes. Use the GitHub app for PR metadata and flat comment reads, and use the bundled GraphQL script through a compatible GitHub CLI or short-lived GitHub App wrapper whenever thread-level state matters.
---

<!-- Modified from the OpenAI GitHub plugin skill to support configurable CLI wrappers and explicit PR targets. -->

# GitHub PR Comment Handler

Use this skill when the user wants to work through requested changes on a GitHub pull request. Use the GitHub app for PR metadata and patch context when available, but treat thread-aware review data as a GraphQL problem because flat comment surfaces do not preserve full review-thread state.

## Thread Reader

The bundled reader defaults to a persistently authenticated `gh`:

```sh
python scripts/fetch_comments.py
```

For a short-lived GitHub App wrapper, pass the compatible executable plus an explicit base repository and PR number:

```sh
python scripts/fetch_comments.py \
  --gh-cli codex-gh \
  --repo OWNER/REPOSITORY \
  --pr 123
```

`--gh-cli` also defaults from `GH_CLI` when set. The value must be one executable or wrapper path that accepts normal `gh` arguments; the reader never invokes a shell. Set any wrapper-specific environment outside the command. Prefer explicit `--repo` and `--pr` with wrappers so the target does not depend on local branch discovery.

The selected CLI performs both the authentication check and GraphQL calls. A wrapper may mint and inject a short-lived token internally; the reader does not need a stored token or `gh auth login`. Do not print, persist, or pass token values as command-line arguments.

When `--repo` and `--pr` are omitted, the reader uses `gh pr view --json number,url` through the same selected CLI and derives the base `OWNER/REPOSITORY` from the returned PR URL. The two explicit target arguments must be supplied together.

## Workflow

1. Resolve the PR.
   - If the user provides a repository and PR number or URL, pass the repository and number explicitly.
   - Otherwise, use local git context and the configured CLI to resolve the current branch PR.
2. Inspect review context with thread-aware reads.
   - Use the GitHub app to fetch PR metadata and patch context when the repo and PR are known.
   - Use `scripts/fetch_comments.py` whenever the task depends on unresolved review threads, inline review locations, comment URLs, or resolution state.
   - Use connector-only comment reads only for lightweight top-level PR comment summaries.
3. Cluster actionable review threads.
   - Group comments by file or behavior area.
   - Separate actionable change requests from informational comments, approvals, already-resolved threads, and duplicates.
4. Confirm scope before editing.
   - Present numbered actionable threads with a one-line summary of the required change.
   - If the user did not ask to fix everything, ask which threads to address.
   - If the user asks to fix everything, interpret that as all unresolved actionable threads and call out anything ambiguous.
5. Implement the selected fixes locally.
   - Keep each code change traceable back to the thread or feedback cluster it addresses.
   - If a comment calls for explanation rather than code, draft the response rather than forcing a code change.
6. Summarize the result.
   - List which threads were addressed, which were intentionally left open, and what tests or checks support the change.

## Write Safety

- Do not reply on GitHub, resolve review threads, or submit a review unless the user explicitly asks for that write action.
- If review comments conflict or would cause a behavioral regression, surface the tradeoff before making changes.
- If a comment is ambiguous, ask for clarification or draft a proposed response instead of guessing.
- Do not treat flat PR comments as a complete representation of review-thread state.
- If the selected CLI hits authentication or rate-limit issues, refresh its authentication according to the chosen bare-CLI or wrapper flow and retry. Do not default to persistent login when a short-lived wrapper is configured.

## Fallback

If neither the connector nor the configured CLI can resolve the PR cleanly, identify whether the missing scope is the repository, PR number, or CLI authentication. Retry with explicit `--repo` and `--pr` before changing authentication mechanisms.
