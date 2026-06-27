---
name: manage-durable-notes
description: Create, inspect, and update durable filesystem notes for Codex continuity across sessions. Use when the user asks Codex to remember, persist, record, save for later, create a durable note, update a local memory/todo store, summarize setup state, maintain a runbook, or standardize notes that future agents should read after context loss.
---

# Manage Durable Notes

## Policy

Use durable notes for user-approved, cross-session facts: host setup, repo access plans, runbooks, open tasks, decisions, and project context. Do not store secrets, private keys, tokens, passwords, recovery codes, or full credential values. For credentials, record only where they are stored, what they are for, and how to revoke or rotate them.

## Standard Layout

Prefer this hierarchy under the user's home directory:

```text
~/codex-notes/
  INDEX.md
  tasks/TODO.md
  state/HOST.md
  projects/
  runbooks/
  decisions/
  credentials/NOTES.md
  archive/
```

Keep root-level entry points for discoverability:

- `~/AGENTS.md`: tells future sessions where the durable notes live.
- `~/CODEX_TODO.md`: compatibility pointer or lightweight mirror for existing workflows.
- `~/REMOTE_ACCESS.md`: compatibility note for SSH/tmux access when present.

## Workflow

1. Read `~/AGENTS.md` first when present.
2. Read `~/codex-notes/INDEX.md` if present; otherwise run the initializer.
3. For user requests to persist something, choose the narrowest target:
   - Active/open work -> `tasks/TODO.md`
   - Current host facts -> `state/HOST.md`
   - Repeatable procedures -> `runbooks/<topic>.md`
   - Stable project context -> `projects/<name>.md`
   - Decisions with rationale -> `decisions/YYYY-MM-DD-<slug>.md`
   - Credential metadata without secrets -> `credentials/NOTES.md`
4. Keep notes concise, dated, and actionable. Prefer bullets with concrete paths, commands, and next steps.
5. If a note supersedes stale content, mark the old content as superseded or move it to `archive/`; do not silently delete useful history.

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
