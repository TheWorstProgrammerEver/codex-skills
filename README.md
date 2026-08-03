# Codex Skills

Personal Codex skills for Ryan Hayward.

Each top-level directory that contains a `SKILL.md` is treated as an installable skill.

## Catalog

| Skill | Purpose |
| --- | --- |
| `agent-hive-mind` | Propose reusable agent learnings through Linear. |
| `coding-style` | Apply shared implementation, testing, and review preferences. |
| `gh-address-comments` | Inspect and address thread-aware GitHub PR feedback. |
| `gh-publish` | Publish intentional changes through a scoped branch and Ready PR. |
| `linear-agent-oauth` | Provision and validate per-agent Linear OAuth app identity. |
| `linear-review-workflow` | Review Linear-tracked artifacts and route outcomes. |
| `manage-durable-notes` | Maintain cross-session filesystem notes. |
| `supabase-react-ts` | Build Supabase-backed React TypeScript apps. |

## Install

Install every skill into `${CODEX_HOME:-~/.codex}/skills`:

```sh
npm run install:skills
```

Install one skill:

```sh
npm run install:skills -- supabase-react-ts
npm run install:skills -- gh-publish
npm run install:skills -- linear-agent-oauth
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
