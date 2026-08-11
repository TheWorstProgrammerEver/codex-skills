---
name: linear-review-workflow
description: Run evidence-backed Linear issue and agent artifact reviews, including GitHub PR reviews, research/spec reviews, ops/local-host reviews, durable-note/shared-guidance reviews, UI/accessibility reviews, security/auth/data reviews, and long-running-job handoff reviews. Use when Codex is asked to review a Linear issue, act as a reviewer agent, validate a submitted artifact without editing it, run no-side-effect advise-mode review, route review outcomes back through Linear/GitHub, or verify reviewer independence and merge readiness.
---

# Linear Review Workflow

Use this skill to review work that is tracked through Linear and may have its concrete artifact in GitHub, documents, durable notes, local host state, logs, or another linked system. Keep the reviewer posture separate from the builder posture: inspect, validate narrowly, report evidence, and route state. Do not patch implementation artifacts unless a human explicitly asks the reviewer to switch roles.

Route detailed domain judgment to the relevant skill instead of duplicating it:

- Use `$coding-style` for code review priorities, tests, TypeScript/React style, stack choices, and accessibility heuristics.
- Use `$supabase-react-ts` for Supabase Auth, RLS, Edge Functions, app config, and security integration tests.
- Use `$manage-durable-notes` for durable-note placement, redaction, and memory updates.
- Use `$agent-hive-mind` after substantial work when reusable collective learning may need a follow-up issue.

## Review Modes

- **Apply mode**: external comments, Linear status changes, GitHub review submission, and GitHub PR merge are allowed when required by the review outcome and permitted by repository rules.
- **Advise mode**: do not create or update Linear comments, GitHub comments, GitHub reviews, issue statuses, branches, commits, files, or PR merges. Refresh state, inspect artifacts, run narrow read-only validation where practical, and write the review result only to the current Codex output.

If the task does not clearly say apply mode, infer mode from the request and runner context. When uncertain, use advise mode or ask before creating side effects.

## Workflow

1. Refresh the Linear issue from tools, not memory: description, comments, labels, links, attachments, documents, status, assignee, branch name, and dependency relations. Treat provided snapshots as fallback only.
2. Check readiness and blockers. Confirm the issue is in a review-ready or review-running state according to the workspace configuration. If unresolved upstream blockers affect review validity, report them before reviewing downstream details.
3. Discover the artifact from Linear comments, links, completion notes, branch names, PR URLs, attachments, documents, durable-note paths, local state/log references, and any explicit artifact URL in the prompt.
4. Classify the artifact before validating it. Use one or more classes from the checklists below.
5. Validate only the claimed artifact and the smallest surrounding context needed to judge correctness. Prefer read-only inspection; run focused tests/builds only when appropriate for the artifact class.
6. Report findings with evidence. Unsupported concerns belong under questions or residual risk, not required changes.
7. Put detailed review output in the natural destination. Use GitHub PR review comments for PRs, document comments for documents when available, and concise Linear comments for Linear-native artifacts or routing summaries.
8. Route the issue state based on verdict without hard-coding workspace status names. Use the configured or discovered statuses that mean review passed, returned for implementation, or blocked.
9. Disclose reviewer independence. State whether the reviewer appears distinct from the builder and whether the review can enforce repository rules.

## Artifact Classes

- **Code PR**: GitHub/GitLab PR, branch diff, code patch, generated code, tests, build scripts, or completion contract evidence.
- **Research/spec**: analysis, plan, architecture/spec document, recommendation, market/legal/technical research, or evidence synthesis.
- **Ops/local-host**: host setup, services, timers, SSH, detached jobs, local logs, backups, migrations, imports, or recovery procedures.
- **Durable-note/shared-guidance**: local durable notes, shared durable notes, AGENTS guidance, skills, runbooks, or collective memory.
- **UI/accessibility**: frontend behavior, screenshots, browser flows, visual regressions, responsiveness, semantics, keyboard use, or contrast.
- **Security/auth/data**: authentication, authorization, credentials, RLS/policies, data migration, deletion, privacy, or rollback.
- **Long-running-job handoff**: incomplete or detached transfer, import, backup, build, migration, model run, or resumable validation path.

## Evidence Rules

Every required-change finding needs concrete evidence:

- file path and line, diff hunk, PR review comment URL, Linear comment URL, document section, command summary, status/check result, log path or excerpt summary, state-file field, screenshot observation, or source citation;
- expected versus actual behavior;
- user impact, data/security impact, or completion-contract impact;
- narrow validation performed, or why validation could not be performed.

Do not include secrets, tokens, private keys, passwords, recovery codes, private local host facts, or unnecessary private paths in review output. Redact or summarize sensitive local evidence. Use exact local paths only when the recipient already operates on that host and the path is needed for recovery.

## Severity Taxonomy

- **Critical**: exploitable security issue, irreversible data loss, destructive operation without recovery, or a merge/release blocker that can immediately harm production or users.
- **High**: correctness, auth, data integrity, or operational failure likely to break a core workflow; required tests or safeguards missing for a risky change.
- **Medium**: real bug, regression, missing validation, unclear recovery path, accessibility failure, or maintainability risk that should be fixed before approval but is not immediately catastrophic.
- **Low**: minor correctness edge case, documentation ambiguity, localized polish issue, or non-blocking maintainability concern.
- **Question/Residual risk**: insufficient evidence for required changes; ask or disclose instead of blocking.

Lead with findings ordered by severity. If there are no findings, say that directly and list validation plus residual risk.

## Checklists

### Code PRs

- Inspect the PR diff, changed tests, nearby ownership boundaries, and claimed validation.
- Use `$coding-style` for code review stance, stacked PR stale-base checks, TypeScript/React patterns, and test expectations.
- Verify the completion contract: dedicated branch, commit, pushed branch, PR URL, validation, and Linear completion evidence unless the issue explicitly chose a different artifact.
- Check failing checks, merge conflicts, draft state, required approvals, unresolved review threads, and ruleset merge requirements.
- If review-thread resolution is required, inspect unresolved threads before merge. Resolve only threads demonstrably addressed by the current artifact; unaddressed required threads are work-caused merge blockers. Treat GitHub review submission, REST thread replies or PR comments, and the GraphQL `resolveReviewThread` mutation as separate authorization boundaries; success in one path does not prove authority for the others.
- For GitHub App backed review work, treat the exact minted token permission set plus repository selection as the effective boundary, not the App identity alone. Record only redacted scope names and outcomes in review notes. Do not infer resolution authority from `pull_requests:write`, `issues:write`, a submitted review, or a posted reply; repository-specific `contents:write` may also be required for `resolveReviewThread`. In apply-mode merge flows where `contents:write` is already authorized for the same dedicated reviewer identity, the same token boundary can cover thread resolution and merge without switching identities.
- Treat `viewerCanResolve` as advisory for App-backed review threads. It may be useful context, but it is not an authoritative denial when the current task already authorizes resolving demonstrably addressed threads; route on the actual mutation result and the post-mutation read.
- After any `resolveReviewThread` attempt, re-read the affected thread IDs and verify `isResolved: true` before claiming resolution or using resolution as merge-readiness evidence. If the mutation reports success but the authoritative re-read is missing, stale, or still false, preserve the thread as unresolved and report the reconciliation gap.
- If the GraphQL mutation fails with an integration `FORBIDDEN` response such as `Resource not accessible by integration`, keep any already-posted review or thread reply as evidence, leave the thread unresolved, and report the capability limitation without retrying through a different GitHub identity or implicitly requesting broader credentials. Provide a bounded handoff: identify the addressed thread URLs, the sanitized permission boundary that failed, and the two permitted next actions, either an authorized collaborator resolves the specific threads manually or the operator explicitly grants the repository-specific minimum scope to the same dedicated reviewer App and reruns verification.
- In apply mode, a passing GitHub PR review is incomplete until the reviewer submits the successful review, confirms merge requirements, merges the PR when permitted, and includes the merged PR URL plus an explicit "PR was merged" statement in Linear.
- In advise mode, do not submit reviews, resolve threads, mark ready, or merge PRs.

### Research/Spec

- Verify conclusions follow from cited evidence and dates are current where timeliness matters.
- Separate facts, assumptions, inferences, and recommendations.
- Check that uncertainty and tradeoffs are explicit and actionable.
- Confirm the output answers the Linear issue and avoids over-broad unrelated research.

### Ops/Local-Host

- Check service/timer state, logs, state files, idempotence, recovery steps, rollback, and cleanup.
- Confirm commands avoid destructive behavior unless the issue explicitly approved it and backups/verification exist.
- Verify local-only host facts and secrets are omitted or redacted from shared outputs.
- Prefer durable, inspectable handoffs for work that may outlive the Codex session.

### Durable Notes/Shared Guidance

- Use `$manage-durable-notes` for placement, redaction, and memory-model rules.
- Verify notes are concise, linked to source artifacts, placed in the narrowest durable location, and not duplicating stale content.
- For skills or shared guidance, confirm host-neutral examples, no secrets/local-only facts, and cross-links to canonical skills instead of copying broad guidance.
- Run skill metadata/install validation when reviewing skill changes.

### UI/Accessibility

- Use `$coding-style` accessibility guidance for semantic controls, keyboard behavior, contrast, reduced motion, and responsive checks.
- Inspect screenshots or run focused browser checks when practical.
- Look for overlapping text, clipped controls, layout shifts, color-only state, missing labels, broken focus order, and mobile/desktop regressions.

### Security/Auth/Data

- Use domain skills such as `$supabase-react-ts` where applicable.
- Prioritize authorization boundaries, denied-access tests, token/secret handling, credential scope, data-loss paths, migration rollback, auditability, and least privilege.
- Treat missing negative tests or unvalidated destructive paths as required changes when risk is material.

### Long-Running-Job Handoffs

- Verify a detached runner, state file, log path, current phase, artifact path or job id, resumability notes, next resume/reconcile command, and validation/checksum plan.
- Confirm partial artifacts are not presented as complete and that future agents can resume without the original Codex process.
- Route missing handoff evidence back to implementation unless the blocker is external access or human input.

## Verdicts And State Routing

Use one verdict:

- **Required changes**: actionable correctness, security, data, validation, merge-readiness, or completion-contract problems exist. Leave detailed findings in the natural destination, add a concise Linear routing comment, and move to the workspace status that returns work to implementation.
- **Passed**: no required changes found. Leave or submit the successful review in the natural destination. For GitHub PRs in apply mode, merge the PR when repository rules permit before the Linear success comment. Move to the configured review-passed status.
- **Blocked**: the artifact cannot be reviewed because required access, status setup, linked artifacts, external state, or human clarification is missing. Comment with the concrete blocker and move to the configured blocked status.

If the review-passed status does not exist, do not silently substitute another status. In apply mode, treat missing review routing as a process blocker. In advise mode, report the missing status in the output.

If a GitHub PR otherwise passes but cannot be merged in apply mode, do not use Passed unless a human explicitly made the artifact no-merge. Route work-caused merge blockers, such as failing checks, conflicts, unresolved required threads, draft state contradicting ready evidence, or missing completion evidence, back to implementation. Route external/access/human-gate blockers, such as missing permissions, unavailable repository state, required human approval, or disallowed merge methods, to Blocked.

## Output Guidance

For GitHub PRs, prefer inline comments for line-specific findings and one overall review summary. Verify the submitted review author/identity after review submission when possible; GitHub App tokens may not support generic identity checks even when PR review APIs work, so the submitted review record is better evidence.

If the same GitHub identity authored the PR and is performing the review, disclose that the review is a self-review fallback and may not satisfy repository approval rules. Prefer a distinct reviewer identity for enforceable approvals.

Keep Linear concise. Link to the external review when one exists and avoid copying full GitHub review text into Linear unless Linear is the expected destination. End Linear comments with the reviewer signature required by the task or workspace.

Use this overall shape:

```markdown
Verdict: Passed | Required changes | Blocked

Findings:
- [severity] file-or-artifact-reference: concise issue and impact.

Validation:
- command or inspection performed;
- command or inspection skipped, with reason.

Residual Risk:
- short caveats, or "None beyond normal review scope."

State Recommendation:
- target Linear status and any external review/comment URL.

Reviewer Independence:
- whether this review appears independent from the builder, and any enforcement caveat.
```
