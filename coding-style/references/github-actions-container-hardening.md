# GitHub Actions Job Container Hardening

Use this guidance for non-destructive CI that runs inside a GitHub Actions job
container. Keep ordinary test cleanup in
[`automated-testing.md`](automated-testing.md), and apply
[`shell-safety.md`](shell-safety.md) when workflow scripts inspect or act on
paths. Do not duplicate those rules in individual workflows.

## Contents

- [Runner Command-File Mounts](#runner-command-file-mounts)
- [Discover The Runner Mapping](#discover-the-runner-mapping)
- [Engine Socket Accessibility](#engine-socket-accessibility)
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

## Engine Socket Accessibility

Treat engine-socket presence, usable socket access, block-device nodes, and
Linux capabilities as four separate runtime properties. A hosted runner can
bind-mount a Docker or Podman socket into a job container even when the workflow
uses `--cap-drop=ALL`, `--security-opt=no-new-privileges`, and no `--device` or
`--privileged` option. An inaccessible socket does not weaken those controls,
while a writable socket can let the job ask the host engine to create a more
privileged container and bypass the intended boundary.

Enumerate engine-socket paths from the exact runner's configuration, environment,
and bind mounts. Do not assume that one path is universal or that every engine
socket is below `/var/run`; rootless engines and self-hosted runners commonly
use different locations. For each socket that is present, test read and write
permission as the hardened container identity. An absent candidate is acceptable,
but absence is not a portable hosted-runner invariant.

Choose the primary GID and any `--group-add` supplemental GIDs only after
checking the socket's numeric ownership and mode. A GID chosen for workspace or
image compatibility must not accidentally match an engine-socket group and
grant access. Verify the effective group set with `id -G` at runtime instead of
reasoning from the requested primary GID alone.

On a self-hosted runner, socket ownership, modes, paths, and bind mounts are
operator-controlled and can differ between runner classes. If engine access is
deliberate, document that broader trust boundary, scope the job to an appropriate
dedicated runner, and test that access explicitly; do not describe the job as
isolated from the host engine. Otherwise, fail when any configured engine socket
is readable or writable.

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
          for engine_socket in \
            /var/run/docker.sock \
            /run/docker.sock \
            /run/podman/podman.sock
          do
            if [ -S "$engine_socket" ]; then
              stat -c '%u:%g %a %n' "$engine_socket"
              if [ -r "$engine_socket" ]; then
                echo "Engine socket is unexpectedly readable: $engine_socket" >&2
                exit 1
              fi
              if [ -w "$engine_socket" ]; then
                echo "Engine socket is unexpectedly writable: $engine_socket" >&2
                exit 1
              fi
            fi
          done
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

The socket candidates in this example cover common Docker and rootful Podman
locations; they are not an exhaustive or portable list. Replace or extend them
from the target runner's configuration and bind mounts.

Validate the complete workflow, not only the container startup. Checkout,
command-file output and environment propagation, dependency installation,
build, tests, and post-job action cleanup must all pass. Confirm independently
at runtime that configured engine sockets are inaccessible, all capability sets
are zero, `NoNewPrivs` is enabled, and `/dev` contains no block-device nodes.
Also inspect the workflow for accidental `--privileged`, `--device`, added
capabilities, privileged commands, host-root or device mounts, engine-socket
access, or destructive device operations. Pin actions to reviewed commit SHAs;
pin the container image by digest when reproducibility matters, and re-run
ownership, socket-access, and image-compatibility validation after changing a
tag or digest. On self-hosted runners, also confirm the pinned action version
supports the installed runner; the pinned checkout v6 example requires Actions
Runner v2.329.0 or newer.

If a larger or self-hosted runner needs a different mapping, keep its value
scoped to that runner class and document the matching probe. Do not copy the
standard-runner example into a matrix as though it were portable.
