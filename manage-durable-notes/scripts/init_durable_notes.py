#!/usr/bin/env python3
import argparse
import datetime as _dt
import os
from pathlib import Path


DIRS = [
    "tasks",
    "state",
    "projects",
    "runbooks",
    "decisions",
    "credentials",
    "archive",
]


def write_if_missing(path: Path, text: str, dry_run: bool) -> None:
    if path.exists():
        return
    print(f"create {path}")
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)


def append_if_missing(path: Path, marker: str, text: str, dry_run: bool) -> None:
    existing = path.read_text() if path.exists() else ""
    if marker in existing:
        return
    print(f"update {path}")
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a") as handle:
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
    if legacy.exists() and legacy.read_text().strip():
        text = (
            "# TODO\n\n"
            "Imported from `~/CODEX_TODO.md` during durable-notes initialization.\n\n"
            + legacy.read_text()
        )
    else:
        text = "# TODO\n\n## Active\n\n- No active durable tasks.\n\n## Parked\n\n- None.\n"
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
        "## Read First\n\n"
        "- `tasks/TODO.md` - active and parked work.\n"
        "- `state/HOST.md` - host setup and access facts.\n"
        "- `runbooks/` - repeatable procedures.\n"
        "- `projects/` - project-specific context.\n"
        "- `decisions/` - dated decisions and rationale.\n"
        "- `credentials/NOTES.md` - credential metadata only; no secrets.\n"
        "- `archive/` - superseded notes.\n",
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
        "- See `~/REMOTE_ACCESS.md` if present.\n",
        args.dry_run,
    )

    write_if_missing(
        root / "credentials" / "NOTES.md",
        "# Credential Notes\n\n"
        "Do not store secrets, private keys, tokens, passwords, or recovery codes here.\n\n"
        "Record only credential purpose, file location, scope, owner, and revocation or rotation steps.\n",
        args.dry_run,
    )

    agents = home / "AGENTS.md"
    write_if_missing(
        agents,
        "# Codex Home Notes\n\n"
        f"- At the start of work in `{home}`, check `{root}/INDEX.md` and `{root}/tasks/TODO.md`.\n",
        args.dry_run,
    )
    append_if_missing(
        agents,
        "codex-notes/INDEX.md",
        f"- Durable notes live under `{root}`. Read `{root}/INDEX.md` before relying on memory from previous sessions.\n",
        args.dry_run,
    )

    legacy_todo = home / "CODEX_TODO.md"
    if legacy_todo.exists():
        append_if_missing(
            legacy_todo,
            "codex-notes/tasks/TODO.md",
            f"\nDurable notes canonical task file: `{root}/tasks/TODO.md`.\n",
            args.dry_run,
        )
    else:
        write_if_missing(
            legacy_todo,
            "# Codex TODO\n\n"
            f"Canonical durable task file: `{root}/tasks/TODO.md`.\n",
            args.dry_run,
        )

    print(f"durable notes root: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
