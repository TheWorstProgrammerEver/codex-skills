# GitHub Actions Job Container Hardening

Use this guidance for non-destructive CI that runs inside a GitHub Actions job
container. Keep ordinary test cleanup in
[`automated-testing.md`](automated-testing.md), and apply
[`shell-safety.md`](shell-safety.md) when workflow scripts inspect or act on
paths. Do not duplicate those rules in individual workflows.

## Contents

- [Runner Command-File Mounts](#runner-command-file-mounts)
- [Discover The Runner Mapping](#discover-the-runner-mapping)
- [Hardened Standard-Runner Example](#hardened-standard-runner-example)

## Runner Command-File Mounts

GitHub mounts the workspace, runner temp directories, and per-step command files
into a job container. Actions and shell steps write files such as
`GITHUB_OUTPUT`, `GITHUB_ENV`, `GITHUB_PATH`, and `GITHUB_STEP_SUMMARY` to
communicate with the runner.

A container running as root normally bypasses restrictive ownership checks
through the `DAC_OVERRIDE` capability. With `--cap-drop=ALL`, root loses that
bypass. If the mounted command-file directory or files belong to the numeric
runner user instead, an action can fail with `EACCES` before install or test
commands run. `actions/checkout` can expose the problem while creating its
runner command or state files.

Do not respond by restoring broad authority with `--privileged`,
`--cap-add=DAC_OVERRIDE`, a host-device mount, or a blanket permission change.
Where the runner and image support it, run the container with the numeric UID
that owns the runner mounts while retaining:

- `--cap-drop=ALL`;
- `--security-opt=no-new-privileges`; and
- no `--privileged` or `--device` option.

The command files' GID can differ from the container user's primary GID; matching
the owner UID is sufficient when owner-write permission is present. Choose and
validate the primary GID separately for the runner and image. The image must also
support running as that numeric identity. Check executable, workspace, cache,
package-manager, and home-directory behavior rather than assuming every image
supports an arbitrary UID/GID.

## Discover The Runner Mapping

Numeric ownership is part of the runner shape, not a portable GitHub Actions
constant. A standard hosted runner, a larger hosted runner, and a self-hosted
runner can use different UID/GID values. Runner-image updates can also change
them.

Before choosing `--user`, run a temporary diagnostic job on the exact runner and
container image without the dropped-capability options:

```yaml
jobs:
  discover-runner-mount-owner:
    runs-on: ubuntu-latest
    container:
      image: node:24-bookworm
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - name: Inspect numeric command-file ownership
        shell: sh
        run: |
          id
          stat -c '%u:%g %a %n' \
            "$GITHUB_WORKSPACE" \
            "$RUNNER_TEMP" \
            "$(dirname "$GITHUB_OUTPUT")" \
            "$GITHUB_OUTPUT" \
            "$GITHUB_ENV" \
            "$GITHUB_PATH" \
            "$GITHUB_STEP_SUMMARY"
```

Inspect metadata only; never print command-file contents. Use the owner UID that
has write permission on the command-file directory and files, then choose a
compatible primary GID for the workspace and image. Do not require the container
GID to equal every mounted path's GID. Repeat the probe for every larger or
self-hosted runner class and after relevant runner or image changes. Fail closed
or keep the job unhardened and isolated when the mapping is inconsistent or the
image cannot run as the discovered identity.

## Hardened Standard-Runner Example

The following `1001:122` mapping was observed for one standard
GitHub-hosted `ubuntu-latest` runner with `node:24-bookworm`. It is an example,
not a universal default. Replace it with the mapping validated for the actual
runner/image combination.

```yaml
permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    container:
      image: node:24-bookworm
      options: >-
        --user 1001:122
        --cap-drop=ALL
        --security-opt=no-new-privileges
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false

      - name: Exercise runner command files
        id: command-files
        shell: sh
        run: |
          printf '%s\n' 'verified=true' >> "$GITHUB_OUTPUT"
          printf '%s\n' 'HARDENED_COMMAND_FILES=verified' >> "$GITHUB_ENV"
          printf '%s\n' '### Hardened container verified' >> "$GITHUB_STEP_SUMMARY"

      - name: Verify the hardening boundary
        shell: sh
        run: |
          test "$HARDENED_COMMAND_FILES" = verified
          test "${{ steps.command-files.outputs.verified }}" = true
          test "$(id -u):$(id -g)" = "1001:122"
          test "$(stat -c '%u' "$(dirname "$GITHUB_OUTPUT")")" = "1001"
          test "$(stat -c '%u' "$GITHUB_OUTPUT")" = "1001"
          awk '
            BEGIN { seen = 0 }
            $1 ~ /^Cap(Inh|Prm|Eff|Bnd|Amb):$/ { seen++ }
            $1 ~ /^Cap(Inh|Prm|Eff|Bnd|Amb):$/ &&
            $2 != "0000000000000000" { exit 1 }
            END { if (seen != 5) exit 1 }
          ' /proc/self/status
          grep -Eq '^NoNewPrivs:[[:space:]]+1$' /proc/self/status
          if find /dev -xdev -type b -print -quit | grep -q .; then
            echo "Unexpected block device node in the job container" >&2
            exit 1
          fi

      # Replace these with the repository's locked install, build, and test commands.
      - run: npm ci --ignore-scripts
      - run: npm run build
      - run: npm test
```

Validate the complete workflow, not only the container startup. Checkout,
command-file output and environment propagation, dependency installation,
build, tests, and post-job action cleanup must all pass. Confirm at runtime that
all capability sets are zero, `NoNewPrivs` is enabled, and `/dev` contains no
block-device nodes. Also inspect the workflow for accidental `--privileged`,
`--device`, added capabilities, privileged commands, host-root or device mounts,
or destructive device operations. Pin actions to reviewed commit SHAs; pin the
container image by digest when reproducibility matters, and re-run ownership and
image-compatibility validation after changing a tag or digest. On self-hosted
runners, also confirm the pinned action version supports the installed runner;
the pinned checkout v6 example requires Actions Runner v2.329.0 or newer.

If a larger or self-hosted runner needs a different mapping, keep its value
scoped to that runner class and document the matching probe. Do not copy the
standard-runner example into a matrix as though it were portable.
