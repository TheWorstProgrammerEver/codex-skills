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
- For every collection whose apparent absence authorizes an effect, require
  proof that the authorization reader saw the complete collection rather than
  one page or display subset. Apply
  [Complete Evidence For Negative Authorization Predicates](general-implementation.md#complete-evidence-for-negative-authorization-predicates)
  and require the decisive later-page and malformed-pagination cases in
  [Paginated Authorization Evidence Tests](automated-testing.md#paginated-authorization-evidence-tests).
- For durable recovery stores, require the layered checks in
  [Recovery Validation Boundaries](general-implementation.md#recovery-validation-boundaries)
  and the negative and legitimate cases in
  [Recovery Semantic-Invariant Tests](automated-testing.md#recovery-semantic-invariant-tests);
  a strict field schema alone is not evidence that recovered state is safe to
  resume.
- For every artifact rehydrated or recomputed after its producing state
  transition, identify the logical producer and every input that affected its
  output. Replay must reconstruct the producer-time values and context,
  including whether an input was set or absent; reading mutable environment,
  configuration, or workflow state at the later consumer silently changes
  already-produced semantics.
- Require the contract to distinguish replay from deliberate refresh. Replay
  preserves the original producer identity and output semantics. Refresh is a
  new production event or revision that explicitly reads current inputs and
  invalidates or recomputes affected descendants. Verify both contracts with
  [Derived-Artifact Replay Tests](automated-testing.md#derived-artifact-replay-tests)
  after the checkpoint has passed the existing recovery-validity checks.
- For resumable retry engines, distinguish the persisted attempt number from
  the number of executions that may actually have started. Require an explicit
  policy for every persistence/execution crash window, and verify with
  [Ambiguous In-Flight Retry-Budget Tests](automated-testing.md#ambiguous-in-flight-retry-budget-tests)
  that recovery cannot replay one `started` attempt indefinitely under an
  unchanged budget.
- For persisted clock observations, identify whether every monotonic source is
  process-, boot-, or machine-scoped. Reject process-scoped readings compared
  across invocations; require boot-scoped readings to carry a boot ID, with
  reboot behavior and wall-clock synchronization reviewed separately. Follow
  [Stable Clock Scope Across Executions](general-implementation.md#stable-clock-scope-across-executions)
  and require the
  [Persisted Clock-Stability Tests](automated-testing.md#persisted-clock-stability-tests).
- For staged workflows that hydrate secret-bearing prompts or payloads, require
  readiness code to accept only non-secret descriptors and narrowly scoped
  authentication capabilities, and require readiness subprocesses to receive
  an explicit minimal environment instead of the parent service environment.
  Follow the canonical
  [Readiness-Gated Secret Hydration](general-implementation.md#readiness-gated-secret-hydration)
  boundary rather than duplicating it here, and verify every failure, retry,
  and child-environment path with
  [Readiness-Gated Secret Hydration Tests](automated-testing.md#readiness-gated-secret-hydration-tests).
- For systemd-backed interactive services, review stdin, stdout, and stderr
  destinations independently and follow
  [Systemd Interactive Descriptor Routing](systemd-interactive-descriptors.md).
  Physical console display is not proof that inherited output descriptors are
  TTYs or that raw child output stays out of journald.
- For physical or production validation that requires an interruption at a
  transient state, require the blocking runbook and evidence protocol in
  [Transient Live Checkpoint Gates](transient-live-checkpoints.md). Simulation
  and terminal-state restart evidence do not prove live mid-flight recovery.

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
