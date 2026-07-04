# Codex Skills

Personal Codex skills for Ryan Hayward.

Each top-level directory that contains a `SKILL.md` is treated as an installable skill.

## Install

Install every skill into `${CODEX_HOME:-~/.codex}/skills`:

```sh
npm run install:skills
```

Install one skill:

```sh
npm run install:skills -- supabase-react-ts
```

Preview without copying:

```sh
npm run install:skills -- --dry-run
```

Installer output redacts host-local target paths by default. Install previews
and success messages use `<target>/...` labels so unattended maintenance logs
can identify the skill and backup location without recording absolute home
paths. For interactive local debugging, pass `--show-paths` to print the exact
target and backup paths:

```sh
npm run install:skills -- --dry-run --show-paths
```

List repo skills:

```sh
npm run list:skills
```

The installer does not touch unrelated local skills. If an installed skill with the same name already exists, it is moved into `.install-backups/<timestamp>/` before the repo copy is installed.
