---
name: gh-publish
description: Publish intentional local repository changes to GitHub through a scoped issue branch, commit, push, and pull request. Use when Codex is asked to commit and push work, open or update a GitHub pull request, publish completed changes for review, or finish a code-change issue that requires a PR. Discover repository and host guidance plus approved GitHub App helpers first, preserve unrelated work, and create completed PRs Ready for review by default.
---

# Publish GitHub Changes

Publish only the changes the user placed in scope. Treat authentication,
branching, committing, pushing, PR creation, and verification as distinct
boundaries.

## 1. Inspect Guidance And State

1. Read every applicable repository `AGENTS.md` and publishing instruction.
2. Inspect `git status --short --branch`, remotes, the current branch, upstream,
   and the intended base. Review the full scoped diff before staging.
3. Follow pointers from host entry notes or explicit environment variables to
   GitHub publishing runbooks. Check conventional durable-note indexes beneath
   the current user's home only when present; do not recursively search a home
   directory or invent a private path.
4. Discover authentication in this order:
   - an already connected GitHub capability suitable for PR metadata or
     creation;
   - a host-approved scoped CLI wrapper named by repository or host guidance;
   - a scoped Git askpass or credential helper named by that guidance or found
     on `PATH`.
5. Prefer approved short-lived GitHub App credentials. Never run or recommend
   `gh auth login`, browser/device login, a personal access token, or a token in
   a remote URL when an approved host helper is available. If no authorized
   publishing path can be discovered, stop and report the missing capability.

Keep connector credentials separate from local Git credentials. A connected
GitHub capability does not imply that `git push` is authenticated.

## 2. Confirm Scope And Branch

Refresh the tracking issue and dependency state when the task is issue-driven.
Stop for an unresolved blocking dependency.

Preserve unrelated user work. Do not switch branches over overlapping dirty
changes, discard files, rewrite unrelated commits, or stage everything without
review. Create or reuse the dedicated issue branch from the current remote
base. Fetch through the discovered scoped helper before basing new work on a
remote branch.

Stage explicit paths or reviewed hunks. Inspect the staged diff and secret scan
before committing. Use a clear commit message tied to the issue when one
exists.

## 3. Push With Scoped Authentication

Use plain Git for local state. For HTTPS push, set `GIT_TERMINAL_PROMPT=0` and
point `GIT_ASKPASS` at the discovered approved helper for that command. Apply
repository and permission scope variables documented by the host wrapper.
Never print, capture, persist, or interpolate a token.

If push fails, diagnose the layers separately:

1. confirm the short-lived helper can mint a redacted expiry/status result;
2. confirm the target repository is in the installation's repository list;
3. confirm the exact askpass helper is active;
4. dry-run the exact issue-branch refspec when the runbook supports it;
5. retry the real issue-branch push only after the cause is understood.

A dry-run validates negotiation and refspec shape, not write authorization.
The real issue-branch push is the write proof.

## 4. Create Or Update The Pull Request

Prefer the connected GitHub capability when it supports the required PR
operation and identity. Otherwise use the discovered scoped wrapper. Do not
fall back from that wrapper to an unscoped bare CLI login.

Create a completed pull request **Ready for review**. Pass `draft: false`
explicitly when the connector accepts a draft field; omit `--draft` with a CLI
whose default is Ready. Use draft only when the user explicitly requests it or
the submitted artifact is deliberately incomplete. State that reason in the PR
body and task handoff.

For an existing PR, update its body/head as needed. Convert a completed draft
to Ready unless a human explicitly requested that it remain draft. Never
silently convert a deliberately incomplete PR.

Include a concise summary, verification commands and outcomes, tracking issue,
and material caveats. Use a body file or connector field rather than shell
interpolation for multiline Markdown.

## 5. Verify Publication

Before claiming completion, verify all of the following from authoritative
local and GitHub state:

- the local committed diff contains exactly the intended changes;
- the remote issue branch resolves to the pushed commit;
- the PR URL, base, head, open state, and draft state are correct;
- completed work is Ready for review;
- relevant checks have run or their absence is stated without calling an empty
  check set successful;
- required reviewers, issue comments, and status transitions are complete.

Read [publication scenarios](references/publication-scenarios.md) when choosing
between connector and wrapper paths or deciding Ready versus draft.
