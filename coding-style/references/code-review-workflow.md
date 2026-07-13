# Code Review Workflow

For Linear-tracked agent reviews, use `$linear-review-workflow` for issue refresh,
artifact discovery, no-edit reviewer posture, advise mode, Linear/GitHub output,
verdict routing, and reviewer independence. Use this file for code-specific
review priorities and review-response style.

## Reviewing Code

- Lead with findings: bugs, behavioral regressions, security risks, data loss risks, missing validation, and missing tests.
- Order findings by severity and include concrete file/line references when available.
- Keep summaries brief and secondary to the findings.
- If there are no findings, say so directly and mention residual risk or test gaps.
- Separate correctness concerns from style preferences. Style feedback should explain the maintainability risk or local convention it protects.

## Stacked PR Stale-Base Check

When a PR's base branch is another feature branch rather than the repository's primary branch, verify the downstream head still includes the current upstream work before approving or merging:

- Fetch current refs first, including the upstream base branch and downstream head.
- Inspect `git log --left-right --cherry-pick upstream-base...downstream-head` for commits that only exist on one side after cherry-pick equivalence is removed.
- Review a two-dot diff from the current upstream base to the downstream head, such as `git diff upstream-base..downstream-head`, to spot dropped or reverted upstream fixes.
- Confirm any upstream review-response fixes, regression tests, and command/API corrections are present in the downstream branch.
- Require the downstream branch to be rebased or otherwise refreshed when it drops, reverts, or supersedes upstream fixes accidentally. Mergeability against the declared base is not enough evidence for stacked PR approval.

## Responding To Review

- Prefer multiple small, targeted commits over large omnibus commits.
- Keep each commit focused on one concern, one review thread, or one tightly related group of comments where practical.
- Address individual comments or unique concerns one at a time where possible.
- After addressing a review comment, reply on that thread with the commit reference that fixed it.
- If a comment is not addressed with a code change, reply with a concise rationale, rebuttal, or clarification request rather than silently ignoring it.

## Final PR Comment

At the end of review-response work, leave a top-level PR comment that is brief but concrete:

- major concerns addressed;
- validation commands run;
- remaining caveats or intentionally deferred items;
- whether the PR is ready for another review or approval.
