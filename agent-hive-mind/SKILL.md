---
name: agent-hive-mind
description: Notice when meaningful agent work should become reusable collective knowledge. Use after substantial implementation, review, debugging, incident recovery, setup, operational discovery, repeated procedures, or when a task reveals a durable pattern, stale guidance, missing skill, shared-note update, or always-loaded AGENTS.md habit worth proposing through Linear instead of silently changing shared knowledge. Do not use for trivial, one-off, or purely local work.
---

# Agent Hive Mind

Use this skill near the end of meaningful work to decide whether a reusable learning should be proposed for the agent collective. The default action is judgment: create a follow-up only when it would reduce future agents' chance of repeating the same investigation or mistake.

Do not directly edit shared collective-knowledge sources just because a task produced an insight. For generalized learnings or epiphanies, create a Linear issue in `Backlog` for human or later-agent review.

## Candidate Test

Create a collective-learning follow-up only when at least one of these is true:

- A reusable procedure, validation habit, troubleshooting path, or implementation pattern belongs in a Codex skill.
- An existing skill proved incomplete, stale, misleading, too broad, too narrow, or noisy.
- A durable operational fact, runbook update, project state, decision, or credential-metadata note should be shared beyond one host.
- A shared durable note became obsolete, misleading, harmful, duplicated, or should be deleted or replaced.
- An always-loaded operating habit belongs in shared `AGENTS.md` guidance because agents should apply it before any skill triggers.
- Existing shared `AGENTS.md` guidance proved incomplete, stale, misleading, too broad, or too noisy.
- The same investigation, setup step, bug pattern, or review correction is likely to recur for future agents.

Before creating an issue, ask:

- Is this broadly reusable across agents, repositories, hosts, or tasks?
- Is the knowledge stable enough to review and preserve, not just a momentary workaround?
- Would future agents benefit from finding this earlier than they would through normal task context?
- Can the proposed change be implemented and validated by someone who was not present for this task?

## Target Choice

Choose one primary target for the Linear issue:

- `codex-skills`: Use for procedures, decision rubrics, validation workflows, domain-specific workflows, reusable scripts, templates, or skill metadata improvements.
- Shared durable notes repo: Use for stable project context, runbooks, operational facts, decisions, historical learning, credential metadata without secrets, or notes that should be searchable across sessions but should not trigger every task.
- Shared `AGENTS.md` guidance source: Use for always-loaded habits, guardrails, or operating rules that should influence agents before any optional skill is selected. Keep this bar high because always-loaded guidance adds noise to every session.

If the learning is local to the current machine, repo checkout, unshared credential location, temporary incident state, or one user's immediate preference, keep it in local durable notes or the task summary instead of opening a shared collective-learning issue.

## When Not To Create An Issue

Do not create an epiphany issue when:

- The task was trivial and produced no reusable learning.
- The observation is already covered clearly by an existing skill, shared note, or shared `AGENTS.md` item.
- The knowledge is only useful for the current host, branch, throwaway experiment, or user-specific local path.
- The proposed change would preserve secrets, private keys, tokens, passwords, recovery codes, or full credential values.
- The learning is speculative, unvalidated, or too vague to produce acceptance criteria.
- The issue would merely restate the completed task rather than proposing a generalized knowledge change.

When in doubt, prefer a short note in the current task summary over creating noisy collective backlog.

## Canonical Linear Classification

Every collective-learning proposal created through this skill must carry the
exact Linear label `type:hive-mind`. Apply it as issue metadata at creation
time, not merely as text in the description. This label is the authoritative,
machine-queryable classification for discovery, routing, deduplication, and
audits.

Use `[Hive Mind] <concise proposal>` as the human-readable title convention.
Keep the label if the title later changes or uses another product-area prefix;
the title is not a source of truth.

Apply `type:hive-mind` only when the Candidate Test passes and the issue proposes
a change to one of the collective sources in Target Choice. A product issue
does not receive the label merely because it uses the Issue Template, contains
a reusable learning, or mentions a shared source. If product implementation and
collective learning are both needed, keep the product issue unclassified and
create a separate classified proposal when the Candidate Test warrants it.

Before creating an issue:

1. Resolve the exact `type:hive-mind` label in the selected Linear team or
   workspace and include it in the create request with the model and reasoning
   labels.
2. If the label is missing and workspace policy permits label creation, create
   it with the description `Canonical classification for collective-learning
   proposals that target shared agent knowledge.` Otherwise, stop and request
   the missing classification instead of creating an unlabeled proposal.
3. Re-fetch the created issue and verify that `type:hive-mind` is present.

## Discovery, Audit, And Legacy Migration

Use the narrow label query as the normal discovery path:

```text
team = <relevant team>
label = type:hive-mind
includeArchived = false
```

For the open proposal set, retain results whose Linear status type is not
completed, canceled, or duplicate. Use the unfiltered classified set when
checking history or deduplicating a new learning. Do not OR title prefixes,
template headings, or description keywords into the authoritative query; a
non-`[Hive Mind]` title with the label must be found, while an identically
structured product issue without the label must be excluded.

Use title and template searches only for drift detection and one-time legacy
migration. Make a migration deterministic by recording a cutoff and a reviewed
identifier set:

1. Seed candidates with issues created before the cutoff whose titles start
   with `[Hive Mind]`.
2. Add explicit legacy identifiers from the reviewed source audit, including
   proposals that used a product-area title.
3. Verify each candidate still satisfies the Candidate Test and targets one of
   the collective sources in Target Choice. Record explicit product-issue
   exclusions; template shape alone never authorizes classification.
4. Apply `type:hive-mind` to every confirmed open proposal while preserving its
   other labels, then re-run the label query and reconcile the exact identifier
   set with the migration record.

After migration, report an open `[Hive Mind]` title without the label as drift
to reconcile. A labeled issue without that title prefix remains discoverable
and is not, by itself, a classification defect.

## Linear Issue Rules

For a useful generalized learning, create a Linear issue with these defaults:

- Team: the relevant team for the work.
- Status: `Backlog`, not `Waiting For Agent`.
- Assignee: none, unless the user explicitly requests assignment.
- Labels: include the required `type:hive-mind` classification, the appropriate
  model label, typically `agent:model:gpt-5.5`, plus a reasoning label that
  matches the implementation complexity, such as `agent:reasoning:low`,
  `agent:reasoning:medium`, `agent:reasoning:high`, or
  `agent:reasoning:xhigh`.
- Links: include source task, PR, incident, file, issue, or discussion links when available.

Use existing labels when they exist. If a required model or reasoning label is
missing, follow the workspace convention for creating labels only when the user
or repo workflow permits it; otherwise mention the missing label in the issue
body. The canonical `type:hive-mind` classification must not be replaced by a
description mention.

## Issue Template

Use this concise template and fill it with enough context for a later agent or human to implement without reconstructing the whole original task:

```markdown
## Learning

What reusable procedure, guardrail, stale guidance, or operational fact did the source task reveal?

## Target

Target shared source: `codex-skills` | shared durable notes repo | shared `AGENTS.md` guidance source

## Source Context

- Source task/issue/PR:
- Relevant files, commands, logs, or comments:
- Why this is broadly useful:

## Proposed Change

Describe the new, updated, or deleted skill/note/guidance item.

## Acceptance Criteria

- [ ] The shared source is updated in the right place.
- [ ] The change avoids secrets and local-only host facts.
- [ ] The guidance is specific enough to be useful without creating noise.
- [ ] Existing stale or duplicated guidance is removed or marked superseded when applicable.

## Validation

- Listing, validator, tests, dry run, scenario review, or grep checks expected for the target repo.
```

## Completion Habit

At the end of substantial work, make an explicit call:

- No issue: state briefly that no broadly reusable collective learning was found.
- Issue needed: create the Linear `Backlog` issue using the template, unassigned
  by default, with `type:hive-mind`, model, and reasoning labels.
- Local-only learning: update the narrowest local durable note instead of opening shared collective backlog.
