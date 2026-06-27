---
name: agent-bootstrap-ssh
description: Set up headless SSH access for a dedicated Codex-managed Linux host. Use when bootstrapping a Raspberry Pi or always-on agent machine that should be reachable from a Mac or another workstation via SSH, use tmux for persistent Codex sessions, install a codex-attach helper, harden sshd, add a workstation public key, and optionally disable password SSH after key login is confirmed.
---

# Agent Bootstrap SSH

## Workflow

Use this after `$agent-bootstrap-yolo-permissions` when the host should run headless.

1. Inspect durable state:
   - `~/REMOTE_ACCESS.md`
   - `~/CODEX_TODO.md`
   - `~/AGENTS.md`
   - `~/.ssh/authorized_keys`
2. Run a dry-run:

```bash
python3 ~/.codex/skills/agent-bootstrap-ssh/scripts/bootstrap_ssh.py --dry-run
```

The script prints a `Codex SSH Access` summary with the mDNS name, filtered LAN IPv4 address, SSH user, password-auth state, key file path, workstation connection command, public-key-only test command, and durable note path.

3. Prepare SSH, tmux, and the attach helper. On a fresh Pi where password login is still needed to install a workstation key, explicitly keep password auth enabled:

```bash
python3 ~/.codex/skills/agent-bootstrap-ssh/scripts/bootstrap_ssh.py --enable-password-auth --yes
```

4. Get the workstation public key installed. If the user is on a Mac and has `~/.ssh/id_ed25519.pub`, show this command:

```bash
ssh USER@HOST 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys' < ~/.ssh/id_ed25519.pub
```

5. Confirm public-key-only login from the workstation:

```bash
ssh -o PreferredAuthentications=publickey -o PasswordAuthentication=no USER@HOST
```

6. After key login is confirmed, disable password SSH:

```bash
python3 ~/.codex/skills/agent-bootstrap-ssh/scripts/bootstrap_ssh.py --disable-password-auth --yes
```

## One-Shot Mode

If the user provides the workstation public key up front and accepts disabling password auth immediately, run:

```bash
python3 ~/.codex/skills/agent-bootstrap-ssh/scripts/bootstrap_ssh.py --authorized-key 'ssh-ed25519 AAAA... user@mac' --disable-password-auth --enable-passwordless-sudo --yes
```

Do not disable password auth unless `authorized_keys` contains the intended workstation key and the user accepts the lockout risk. If neither `--enable-password-auth` nor `--disable-password-auth` is passed, the script preserves the existing `PasswordAuthentication` setting when it can detect one.

## Validation

After applying changes:

- Run `sudo sshd -t`.
- Reload `ssh` or `sshd`.
- Check `sudo sshd -T` for `permitrootlogin no`, `pubkeyauthentication yes`, and the intended `passwordauthentication` value.
- Use the script's `Codex SSH Access` summary to tell the user the host name, LAN IP if available, and `codex-attach` command.
