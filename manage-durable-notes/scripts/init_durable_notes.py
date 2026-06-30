#!/usr/bin/env python3
import argparse
import datetime as _dt
from pathlib import Path


DIRS = [
    "tasks",
    "state",
    "ledger",
    "projects",
    "runbooks",
    "decisions",
    "preferences",
    "credentials",
    "archive",
]


def write_if_missing(path: Path, text: str, dry_run: bool) -> None:
    if path.exists():
        return
    print(f"create {path}")
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def append_if_missing(path: Path, marker: str, text: str, dry_run: bool) -> None:
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    if marker in existing:
        return
    print(f"update {path}")
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            if existing and not existing.endswith("\n"):
                handle.write("\n")
            if existing:
                handle.write("\n")
            handle.write(text)


def copy_existing_todo(home: Path, root: Path, dry_run: bool) -> None:
    legacy = home / "CODEX_TODO.md"
    target = root / "tasks" / "TODO.md"
    if target.exists():
        return
    if legacy.exists() and legacy.read_text(encoding="utf-8").strip():
        text = (
            "# TODO\n\n"
            "Canonical durable task file for active and parked work.\n\n"
            "`~/CODEX_TODO.md` is a compatibility pointer or short mirror. "
            "Keep durable tasks here to avoid two competing task lists.\n\n"
            "Imported from `~/CODEX_TODO.md` during durable-notes initialization.\n\n"
            + legacy.read_text(encoding="utf-8")
        )
    else:
        text = (
            "# TODO\n\n"
            "Canonical durable task file for active and parked work.\n\n"
            "`~/CODEX_TODO.md` is a compatibility pointer or short mirror. "
            "Keep durable tasks here to avoid two competing task lists.\n\n"
            "## Active\n\n"
            "- No active durable tasks.\n\n"
            "## Parked\n\n"
            "- None.\n"
        )
    write_if_missing(target, text, dry_run)


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize the standard Codex durable-notes hierarchy.")
    parser.add_argument("--home", default=str(Path.home()), help="Home directory to configure.")
    parser.add_argument("--root", default=None, help="Notes root. Defaults to ~/codex-notes.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes without writing files.")
    args = parser.parse_args()

    home = Path(args.home).expanduser().resolve()
    root = Path(args.root).expanduser().resolve() if args.root else home / "codex-notes"
    today = _dt.date.today().isoformat()

    for rel in DIRS:
        path = root / rel
        print(f"mkdir {path}")
        if not args.dry_run:
            path.mkdir(parents=True, exist_ok=True)

    write_if_missing(
        root / "INDEX.md",
        "# Codex Notes Index\n\n"
        f"Initialized: {today}\n\n"
        "## Start Here\n\n"
        "- `tasks/TODO.md` - canonical durable task list for active and parked work.\n"
        "- `state/CURRENT.md` - fast orientation for current host, project, service, and blocker state.\n"
        "- `state/HOST.md` - host setup and access facts.\n"
        "- `ledger/README.md` - append-oriented activity history convention.\n"
        "- `projects/` - project-specific context.\n"
        "- `runbooks/` - repeatable procedures and habits.\n"
        "- `decisions/` - dated decisions and rationale.\n"
        "- `preferences/README.md` - durable user preferences, risk posture, and recurring cautions.\n"
        "- `credentials/NOTES.md` - credential metadata only; no secrets.\n"
        "- `archive/` - superseded notes.\n\n"
        "## Memory Model\n\n"
        "- Current state stays short and easy to scan.\n"
        "- The activity ledger preserves dated history and validation evidence.\n"
        "- Project, runbook, decision, credential, preference, and archive notes form the semantic wiki.\n"
        "- Stable habits should be promoted into runbooks or skills.\n\n"
        "## Root Entry Points\n\n"
        "- `~/AGENTS.md` tells future sessions where durable notes live.\n"
        "- `~/CODEX_TODO.md` is a compatibility pointer or short mirror; `tasks/TODO.md` is canonical.\n",
        args.dry_run,
    )

    copy_existing_todo(home, root, args.dry_run)

    write_if_missing(
        root / "state" / "HOST.md",
        "# Host State\n\n"
        f"Last updated: {today}\n\n"
        "## Identity\n\n"
        f"- Home: `{home}`\n"
        f"- Notes root: `{root}`\n\n"
        "## Access\n\n"
        "- See `~/REMOTE_ACCESS.md` if present.\n\n"
        "## Credential Boundary\n\n"
        "- Record credential metadata in `../credentials/NOTES.md`; never store secret values here.\n",
        args.dry_run,
    )

    write_if_missing(
        root / "state" / "CURRENT.md",
        "# Current State\n\n"
        f"Last updated: {today}\n\n"
        "Use this page for fast orientation. Keep it short, link to supporting notes, "
        "and move detailed history to the activity ledger.\n\n"
        "## Fast Orientation\n\n"
        "- Active tasks: see `../tasks/TODO.md`.\n"
        "- Host facts: see `HOST.md`.\n"
        "- Historical context: see `../ledger/`.\n\n"
        "## Active Projects\n\n"
        "- None recorded yet.\n\n"
        "## Services And Timers\n\n"
        "- None recorded yet.\n\n"
        "## Open Questions And Blockers\n\n"
        "- None recorded yet.\n",
        args.dry_run,
    )

    write_if_missing(
        root / "ledger" / "README.md",
        "# Activity Ledger\n\n"
        "Use the ledger for append-oriented historical memory: meaningful sessions, PRs, "
        "installs, incidents, validations, decisions, and recoveries.\n\n"
        "## Convention\n\n"
        "- Prefer monthly files named `YYYY-MM.md`.\n"
        "- Use entry headings like `## YYYY-MM-DD - Short event title`.\n"
        "- Capture context, actions, validation, links, and follow-up.\n"
        "- Link to project notes, decisions, runbooks, issues, PRs, commits, and logs instead of duplicating long content.\n\n"
        "## Promotion\n\n"
        "- Promote stable current facts to `../state/CURRENT.md`, `../state/HOST.md`, or a project note.\n"
        "- Promote repeated procedures to `../runbooks/` or a skill.\n"
        "- Promote decisions with rationale to `../decisions/`.\n\n"
        "Do not store secrets, private keys, tokens, passwords, recovery codes, or full credential values here.\n",
        args.dry_run,
    )

    write_if_missing(
        root / "preferences" / "README.md",
        "# Preference Memory\n\n"
        "Record durable user preferences, risk posture, recurring cautions, and taste that should guide future work.\n\n"
        "## How To Use\n\n"
        "- Use dated headings for new or changed preferences.\n"
        "- Keep entries concrete and searchable with project names, tools, services, and workflows when relevant.\n"
        "- Promote preferences into runbooks or skills when they become repeatable procedure.\n"
        "- Mark superseded preferences explicitly instead of silently deleting useful history.\n\n"
        "## Known Preferences\n\n"
        "- None recorded yet.\n\n"
        "Do not store secrets, private keys, tokens, passwords, recovery codes, or full credential values here.\n",
        args.dry_run,
    )

    write_if_missing(
        root / "credentials" / "NOTES.md",
        "# Credential Notes\n\n"
        "Do not store secrets, private keys, tokens, passwords, recovery codes, or full credential values here.\n\n"
        "Record only credential purpose, storage location, scope, owner, and revocation or rotation steps.\n",
        args.dry_run,
    )

    agents = home / "AGENTS.md"
    write_if_missing(
        agents,
        "# Codex Home Notes\n\n"
        f"- At the start of work in `{home}`, check `{home / 'CODEX_TODO.md'}` for compatibility tasks or pointers.\n"
        f"- Durable notes live under `{root}`. Read `{root / 'INDEX.md'}` before relying on memory from previous sessions.\n",
        args.dry_run,
    )
    append_if_missing(
        agents,
        str(root / "INDEX.md"),
        f"- Durable notes live under `{root}`. Read `{root / 'INDEX.md'}` before relying on memory from previous sessions.\n",
        args.dry_run,
    )

    legacy_todo = home / "CODEX_TODO.md"
    canonical_task_file = root / "tasks" / "TODO.md"
    if legacy_todo.exists():
        append_if_missing(
            legacy_todo,
            str(canonical_task_file),
            "\n"
            f"Durable notes canonical task file: `{canonical_task_file}`. "
            "Keep this root file as a compatibility pointer or short mirror to avoid task-list drift.\n",
            args.dry_run,
        )
    else:
        write_if_missing(
            legacy_todo,
            "# Codex TODO\n\n"
            f"Durable notes canonical task file: `{canonical_task_file}`.\n\n"
            "Use this root file as a compatibility pointer or short mirror only.\n",
            args.dry_run,
        )

    print(f"durable notes root: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
