#!/usr/bin/env python3
import argparse
import datetime as _dt
import getpass
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def toml_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def run(cmd: list[str], *, dry_run: bool = False, check: bool = True) -> subprocess.CompletedProcess:
    print("+ " + " ".join(cmd))
    if dry_run:
        return subprocess.CompletedProcess(cmd, 0, "", "")
    return subprocess.run(cmd, check=check, text=True)


def set_top_level(lines: list[str], key: str, value: str) -> list[str]:
    out: list[str] = []
    replaced = False
    first_table = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if first_table is None and stripped.startswith("["):
            first_table = i
        if first_table is None and stripped.startswith(key + " "):
            out.append(f"{key} = {value}\n")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        insert_at = first_table if first_table is not None else len(out)
        if insert_at > 0 and out[insert_at - 1].strip():
            out.insert(insert_at, "\n")
        out.insert(insert_at, f"{key} = {value}\n")
    return out


def set_project_trust(lines: list[str], workspace: str) -> list[str]:
    header = f"[projects.{toml_string(workspace)}]"
    out: list[str] = []
    i = 0
    found = False
    while i < len(lines):
        if lines[i].strip() == header:
            found = True
            out.append(lines[i])
            i += 1
            section: list[str] = []
            while i < len(lines) and not lines[i].lstrip().startswith("["):
                section.append(lines[i])
                i += 1
            if any(line.strip().startswith("trust_level ") for line in section):
                section = [
                    "trust_level = \"trusted\"\n" if line.strip().startswith("trust_level ") else line
                    for line in section
                ]
            else:
                section.append("trust_level = \"trusted\"\n")
            out.extend(section)
            continue
        out.append(lines[i])
        i += 1
    if not found:
        if out and out[-1].strip():
            out.append("\n")
        out.append(header + "\n")
        out.append("trust_level = \"trusted\"\n")
    return out


def update_codex_config(home: Path, workspace: Path, dry_run: bool) -> None:
    config_dir = home / ".codex"
    config_path = config_dir / "config.toml"
    print(f"Updating {config_path}")
    lines = config_path.read_text().splitlines(keepends=True) if config_path.exists() else []
    lines = set_top_level(lines, "sandbox_mode", toml_string("danger-full-access"))
    lines = set_top_level(lines, "approval_policy", toml_string("never"))
    lines = set_top_level(lines, "web_search", toml_string("live"))
    lines = set_project_trust(lines, str(workspace))
    if dry_run:
        print("Would write Codex config:")
        print("".join(lines))
        return
    config_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    config_path.write_text("".join(lines))
    os.chmod(config_path, 0o600)


def write_if_missing(path: Path, text: str, dry_run: bool) -> None:
    if path.exists():
        return
    print(f"Creating {path}")
    if not dry_run:
        path.write_text(text)


def ensure_line(path: Path, line: str, dry_run: bool, marker: str | None = None) -> None:
    existing = path.read_text() if path.exists() else ""
    if (marker or line) in existing:
        return
    print(f"Adding durable note to {path}")
    if not dry_run:
        with path.open("a") as handle:
            if existing and not existing.endswith("\n"):
                handle.write("\n")
            handle.write(line + "\n")


def update_notes(home: Path, dry_run: bool) -> None:
    today = _dt.date.today().isoformat()
    agents = home / "AGENTS.md"
    todos = home / "CODEX_TODO.md"
    write_if_missing(
        agents,
        "# Codex Home Notes\n\n"
        "- At the start of work in this home directory, check `CODEX_TODO.md` for durable setup tasks and parked work.\n"
        "- Treat this machine as a dedicated Codex-managed host only if the user explicitly says so.\n"
        "- Keep credentials scoped and revocable; prefer GitHub Apps over personal access tokens for GitHub automation.\n",
        dry_run,
    )
    ensure_line(
        agents,
        "- For headless SSH setup details, check `REMOTE_ACCESS.md` when present.",
        dry_run,
        marker="REMOTE_ACCESS.md",
    )
    write_if_missing(
        todos,
        f"# Codex TODO\n\nLast updated: {today}\n\n## Active\n\n- No active durable tasks.\n\n## Parked\n\n- Set up GitHub access using a private GitHub App when requested.\n",
        dry_run,
    )


def install_passwordless_sudo(user: str, dry_run: bool) -> None:
    existing = subprocess.run(["sudo", "-n", "true"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if existing.returncode == 0:
        print("Passwordless sudo already works; not installing a sudoers drop-in.")
        return
    sudoers = f"{user} ALL=(ALL) NOPASSWD:ALL\n"
    target = f"/etc/sudoers.d/90-codex-{user}"
    print(f"Installing passwordless sudo drop-in at {target}")
    with tempfile.NamedTemporaryFile("w", delete=False) as tmp:
        tmp.write(sudoers)
        tmp_path = tmp.name
    try:
        run(["sudo", "visudo", "-cf", tmp_path], dry_run=dry_run)
        run(["sudo", "install", "-o", "root", "-g", "root", "-m", "0440", tmp_path, target], dry_run=dry_run)
        run(["sudo", "-n", "true"], dry_run=dry_run)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure a dedicated Codex host for full-autonomy local operation.")
    parser.add_argument("--home", default=str(Path.home()), help="Home directory to configure.")
    parser.add_argument("--workspace", default=None, help="Workspace path to mark trusted. Defaults to --home.")
    parser.add_argument("--dedicated-host", action="store_true", help="Acknowledge this is a dedicated Codex-managed host.")
    parser.add_argument("--enable-passwordless-sudo", action="store_true", help="Install a NOPASSWD sudoers drop-in for the current user.")
    parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes without writing files.")
    args = parser.parse_args()

    if not args.dedicated_host:
        print("Refusing to continue without --dedicated-host.", file=sys.stderr)
        return 2
    if args.enable_passwordless_sudo and not args.yes and not args.dry_run:
        answer = input("Install passwordless sudo for this user on a dedicated Codex host? Type 'yes': ")
        if answer != "yes":
            print("Aborted.", file=sys.stderr)
            return 3

    home = Path(args.home).expanduser().resolve()
    workspace = Path(args.workspace).expanduser().resolve() if args.workspace else home
    user = getpass.getuser()

    update_codex_config(home, workspace, args.dry_run)
    update_notes(home, args.dry_run)
    if args.enable_passwordless_sudo:
        install_passwordless_sudo(user, args.dry_run)

    codex = shutil.which("codex")
    if codex:
        run([codex, "exec", "--strict-config", "--version"], dry_run=args.dry_run, check=False)
    print("Restart Codex or start a new session so the new sandbox and approval defaults take effect.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
