# Code Review Workflow

## Reviewing Code

- Lead with findings: bugs, behavioral regressions, security risks, data loss risks, missing validation, and missing tests.
- Order findings by severity and include concrete file/line references when available.
- Keep summaries brief and secondary to the findings.
- If there are no findings, say so directly and mention residual risk or test gaps.
- Separate correctness concerns from style preferences. Style feedback should explain the maintainability risk or local convention it protects.

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
