---
name: agent-bootstrap-yolo-permissions
description: Configure a dedicated Codex-managed Linux host for high-autonomy local operation. Use when bootstrapping a Raspberry Pi or similar always-on agent machine where Codex should default to danger-full-access, approval_policy never, live web search, trusted home workspace, durable local notes, and optionally passwordless sudo.
---

# Agent Bootstrap Yolo Permissions

## Testing Status

This skill has been validated with dry-runs and idempotence checks on an already configured Raspberry Pi 5 host. It has not yet been exercised end-to-end on a fresh OS install, so treat the first fresh-host run as a supervised bootstrap and verify each dry-run before applying changes.

## Workflow

Use this skill only for a host the user explicitly wants to dedicate to Codex-managed work. Do not use it on a shared laptop, production server, or machine with unrelated private data.

1. Inspect the existing Codex config and durable notes if present:
   - `~/.codex/config.toml`
   - `~/AGENTS.md`
   - `~/CODEX_TODO.md`
2. Run the script in dry-run mode first:

```bash
python3 ~/.codex/skills/agent-bootstrap-yolo-permissions/scripts/bootstrap_yolo_permissions.py --dedicated-host --enable-passwordless-sudo --dry-run
```

3. If the dry-run matches the user's intent, apply it:

```bash
python3 ~/.codex/skills/agent-bootstrap-yolo-permissions/scripts/bootstrap_yolo_permissions.py --dedicated-host --enable-passwordless-sudo --yes
```

4. Tell the user to restart Codex or start a new session. The current Codex session keeps the sandbox and approval policy it was launched with.
5. Validate the new session with a harmless command that previously needed approval, then continue setup.

## Behavior

The script sets these top-level Codex defaults:

```toml
sandbox_mode = "danger-full-access"
approval_policy = "never"
web_search = "live"
```

It also marks the selected workspace, defaulting to the user's home directory, trusted:

```toml
[projects."/home/user"]
trust_level = "trusted"
```

When `--enable-passwordless-sudo` is passed, the script installs a validated sudoers drop-in for the current user:

```text
user ALL=(ALL) NOPASSWD:ALL
```

Use `--enable-passwordless-sudo` only on a dedicated host and only after the user has explicitly accepted that Codex can perform root-owned system changes.

## Durable Notes

The script creates or updates:

- `~/AGENTS.md`: future-session guidance to check durable notes.
- `~/CODEX_TODO.md`: backlog for setup tasks and parked work.

If future setup also includes headless SSH, invoke `$agent-bootstrap-ssh` after this skill.
