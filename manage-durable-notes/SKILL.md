---
name: manage-durable-notes
description: Create, inspect, and update durable filesystem notes for Codex continuity across sessions. Use when the user asks Codex to remember, persist, record, save for later, create a durable note, update a local memory/todo store, summarize setup state, maintain a runbook, or standardize notes that future agents should read after context loss.
---

# Manage Durable Notes

## Policy

Use durable notes for user-approved, cross-session facts: host setup, repo access plans, runbooks, open tasks, decisions, project context, preferences, and meaningful history. Keep notes as plain Markdown with predictable paths so they remain useful in grep, git, and Markdown vault tools.

Do not store secrets, private keys, tokens, passwords, recovery codes, or full credential values in notes or generated templates. For credentials, record only where they are stored, what they are for, who owns them, their scope, and how to revoke or rotate them.

## Memory Model

Treat durable notes as a practical wiki crossed with an activity ledger:

- Current state: fast orientation for active host, project, task, service, timer, and credential-metadata facts.
- Activity ledger: append-oriented historical memory for meaningful sessions, PRs, installs, incidents, validations, and decisions.
- Semantic wiki: curated project, runbook, decision, credential, state, and archive notes.
- Procedural memory: repeatable habits captured in runbooks and skills.
- Salience and preferences: durable user preferences, risk posture, and recurring cautions that should guide future work.

Use this promotion flow:

1. Raw conversation or task context produces potentially durable facts.
2. Meaningful historical context goes into a dated ledger entry or the relevant project note.
3. Stable current facts update `tasks/TODO.md`, `state/CURRENT.md`, `state/HOST.md`, or a project page.
4. Repeated procedures become runbooks or skills.
5. Architectural or operational choices become decision records.
6. Superseded information is marked historical or moved to `archive/`; useful history is not silently deleted.

## Standard Layout

Prefer this hierarchy under the user's home directory:

```text
~/codex-notes/
  INDEX.md
  tasks/TODO.md
  state/HOST.md
  state/CURRENT.md
  ledger/README.md
  projects/
  runbooks/
  decisions/
  preferences/README.md
  credentials/NOTES.md
  archive/
```

Keep root-level entry points for discoverability:

- `~/AGENTS.md`: tells future sessions where the durable notes live.
- `~/CODEX_TODO.md`: compatibility pointer or lightweight mirror; the canonical durable task file is `~/codex-notes/tasks/TODO.md`.
- `~/REMOTE_ACCESS.md`: compatibility note for SSH/tmux access when present.

## Start-Of-Session Read Path

1. Read `~/AGENTS.md` when present.
2. Read `~/CODEX_TODO.md` when present for compatibility pointers and active durable tasks.
3. Read `~/codex-notes/INDEX.md` if present; otherwise run the initializer.
4. Follow the index to relevant `state/`, `projects/`, `runbooks/`, `decisions/`, `preferences/`, `credentials/`, and `ledger/` files.
5. Use the ledger when narrative history matters or when current-state notes point to an earlier event.

## Workflow

1. Choose the narrowest target:
   - Active/open work -> `tasks/TODO.md`
   - Fast orientation -> `state/CURRENT.md`
   - Host facts -> `state/HOST.md`
   - Historical sequence -> `ledger/YYYY-MM.md`
   - Stable project context -> `projects/<name>.md`
   - Repeatable procedures -> `runbooks/<topic>.md`
   - Decisions with rationale -> `decisions/YYYY-MM-DD-<slug>.md`
   - Preferences or risk posture -> `preferences/README.md` or `preferences/<topic>.md`
   - Credential metadata without secrets -> `credentials/NOTES.md`
2. Keep notes concise, dated, and actionable. Prefer bullets with concrete paths, commands, issue or PR IDs, service names, and next steps.
3. When current state changes, update the current-state note rather than burying the new fact only in a ledger entry.
4. When a note supersedes stale content, mark the old content as superseded or move it to `archive/`; do not silently delete useful history.
5. For root `~/CODEX_TODO.md`, keep either a pointer to the canonical task file or a deliberately short mirror. Avoid maintaining two competing task lists.

## End-Of-Task Memory Check

Before finishing substantial work, ask whether any of these changed:

- current state, active tasks, project state, services, timers, or external integrations;
- a decision, rationale, procedure, runbook, or skill-worthy habit;
- a user preference, risk posture, or recurring caution;
- credential metadata, storage location, scope, owner, revocation, or rotation guidance;
- useful historical context worth preserving separately from current state.

If yes, update the narrowest durable note and link related artifacts. Do not store secrets.

## Searchability Rules

- Use plain Markdown, predictable paths, concrete nouns, and searchable headings.
- Include dates, issue IDs, PR numbers, repo names, host names, service names, timer names, and command names when relevant.
- Link related notes, commits, PRs, issues, logs, and runbooks rather than duplicating long content.
- Keep current-state pages short enough for quick orientation; move long history to the ledger.
- Prefer monthly ledger files named `ledger/YYYY-MM.md` unless the host has an established dated convention.

## Initializer

Run the script before first use on a host:

```bash
python3 ~/.codex/skills/manage-durable-notes/scripts/init_durable_notes.py
```

For a dry run:

```bash
python3 ~/.codex/skills/manage-durable-notes/scripts/init_durable_notes.py --dry-run
```

The initializer creates the hierarchy, preserves existing root notes, and adds pointers so future sessions can find the standard location.
