# Packaged Runtime Verification

Treat a private runtime bundle as a chain of independently verified boundaries.
An upstream archive checksum, extracted-tree checksum, or final manifest can
prove only the representation it covers. None substitutes for the semantic
checks that make the runtime usable by its target service.

## Contents

- [Keep Source Provenance](#keep-source-provenance)
- [Verify The Extracted Tree](#verify-the-extracted-tree)
- [Verify Runtime Identity Without Execution](#verify-runtime-identity-without-execution)
- [Enforce Entrypoint Semantics](#enforce-entrypoint-semantics)
- [Build And Rescan The Placement Artifact](#build-and-rescan-the-placement-artifact)
- [Package Global Node CLIs From Artifacts](#package-global-node-clis-from-artifacts)
- [Verify Service Assets In An Isolated Root](#verify-service-assets-in-an-isolated-root)
- [Exercise Hardened System Units At Runtime](#exercise-hardened-system-units-at-runtime)
- [Test Every Boundary](#test-every-boundary)
- [Related Guidance](#related-guidance)

## Keep Source Provenance

Resolve runtime discovery to an immutable artifact contract before acquisition.
Pin the exact release, target operating system and architecture, archive length
when available, digest algorithm, and digest. Verify the complete acquired
archive against that contract and retain the immutable upstream digest in the
bundle manifest as provenance.

The archive digest authenticates only the acquired archive representation. It
does not prove that extraction used safe paths, preserved the required modes,
produced the expected tree, or selected the intended executable. Keep archive
verification and extracted-tree verification as separate named results.

Use the acquisition, resume, and cache rules in
[`immutable-artifact-acquisition.md`](immutable-artifact-acquisition.md).
Routine bundle tests should use local generated fixtures rather than downloading
the real release. Keep a deliberate release-update smoke separate when a real
archive must establish new immutable pins.

## Verify The Extracted Tree

Extract into an operation-owned staging directory under an isolated root. Reject
absolute paths, parent traversal, ambiguous separators, duplicate normalized
paths, NUL, special files, and any archive link form that the bundle format
does not model. Do not extract over an existing runtime or directly into a live
installation path.

Inspect the exact extracted tree that will be copied. Produce a canonical,
sorted record for every entry:

- normalized relative path and entry kind;
- exact policy-relevant mode for every directory and regular file;
- byte length and collision-resistant digest for every regular file; and
- exact link target for every symlink.

Allow only relative symlink targets. Resolve each link lexically from its parent
and require it to remain inside the runtime root. Define whether dangling links
are permitted; otherwise require the resolved target to name a recorded entry.
Reject hard links or model their identity and placement semantics explicitly.

Hash an unambiguous canonical serialization of the complete ordered record set.
Compare that extracted-tree digest with its independently pinned value. The
aggregate tree digest does not replace per-entry records, and the upstream
archive digest does not replace the tree digest.

Do not trust a pathname merely because it was included in the scan. Copy from
no-follow handles or recheck kind, mode, size, and digest immediately while
consuming each entry. A source that changes between verification and copying
must fail before publication.

## Verify Runtime Identity Without Execution

Read release identity from a documented embedded metadata file inside the
verified distribution. Parse its expected schema and compare the exact version,
release channel or LTS marker, and codename when applicable with immutable
bundle metadata. Open metadata without following an unexpected symlink.

Parse the executable format header as data. For ELF, verify at least the magic,
class, byte order, and `e_machine` value required by the target architecture;
apply any additional operating-system or ABI policy the bundle promises. Use
equivalent format metadata for another executable format. Do not infer the
target architecture from the archive filename, host architecture, or successful
tree hash.

Never execute foreign target code on the build host as part of static identity
verification. Use the same metadata parser for native and foreign fixtures so
both paths prove identity without requiring emulation. An optional isolated
native build-host smoke can add evidence, but it does not replace static
metadata checks or the mandatory target-compatible final-path smoke required
before claiming installation readiness.

## Enforce Entrypoint Semantics

List every file that a service, launcher shebang, or helper invokes directly.
For each entrypoint or interpreter, independently require:

- the intended canonical relative path;
- a no-follow open of a regular file, not a directory, symlink, or special file;
- the exact immutable executable-mode policy, including rejection of unwanted
  set-user-ID, set-group-ID, or sticky bits; and
- the expected content and executable metadata where that file owns the
  runtime identity.

Keep the required mode as trusted policy, not a value accepted from the runtime
tree or placement manifest. Run this gate even after the complete tree digest
matches. A tree digest can correctly describe a mode such as `0644`; that makes
the description internally consistent, not semantically executable.

Repeat entrypoint checks against the completed target-root artifact. A valid
source runtime can still become unusable when copying or later assembly changes
its kind, path, or mode.

## Build And Rescan The Placement Artifact

Build the target root in an operation-owned staging directory. Derive one
canonical placement manifest from the completed tree, recording every normalized
relative bundle path, absolute target mapping, entry kind, exact mode, file size
and digest, or constrained relative symlink target. Include the source artifact
digest, extracted-tree digest, runtime identity, target architecture, and
manifest schema version in the signed or hashed manifest header.

Before publication, rescan the entire staged target root independently and
reconstruct its entry list. Require exact equality with the canonical manifest:
no missing or extra entry, file-byte drift, mode drift, kind change, renamed
path, or changed symlink target. Re-run the semantic entrypoint checks and
service checks against this rescanned root.

Apply the
[filesystem bundle directory-mode policy](general-implementation.md#filesystem-bundle-directory-modes)
before serializing directory entries. In particular, distinguish shared target
ancestors from private runtime-owned leaves and reject a manifest that inherits
a restrictive leaf mode onto a shared path.

Only then publish with the repository's safe whole-directory replacement
protocol. An adapter consuming the artifact must rescan it again before
placement rather than trusting a manifest that was valid only when the producer
wrote it.

## Package Global Node CLIs From Artifacts

Treat a global Node CLI used by production, scheduled jobs, systemd units, or
other unattended automation as an installed package artifact, not as a live
checkout. A local-directory install such as `npm install -g .` commonly records
the global package as a symlink back to the mutable source directory. That is a
development convenience, not a release identity: later edits, branch switches,
build outputs, dependency changes, or checkout cleanup can change the running
service without an explicit deployment.

For unattended deployment, build and test the reviewed source first, then create
the package artifact with the project-owned packaging command, such as
`npm pack`. Install that tarball or another immutable package artifact into the
target global prefix. Record the artifact filename, package name and version,
source commit or reviewed revision, byte length, and digest as deployment
provenance. Do not claim deployment from a global package whose installed
package root resolves into a mutable working tree.

After installation, verify the installed shape independently:

- resolve the package root reported by the package manager or discovered under
  the global prefix, and require its real path to be outside the source
  checkout and any other mutable development workspace;
- resolve every public launcher with `readlink -f` or an equivalent no-surprise
  real-path check, and confirm that it reaches the installed package artifact,
  not a source-tree script;
- run the final-path launcher smoke from an unrelated working directory with a
  production-like minimal environment; and
- for a scheduled or systemd-managed CLI, run the installed unit or an
  equivalent disposable canary through the same manager namespace and service
  account boundaries before enabling or re-arming unattended execution.

Keep intentional symlinked development installs explicit and isolated. They may
be acceptable for interactive local iteration when the command name, prefix,
unit, environment, or documentation labels it as development-only and no
unattended service, timer, cron job, or production wrapper can resolve to it. A
development symlink must never share the production service namespace or be
presented as a rollback-capable deployment.

## Verify Service Assets In An Isolated Root

Parse each service definition and validate the policy-critical directives.
Resolve every absolute `ExecStart` path and shebang interpreter inside the
staged target root, then apply the regular-file and exact-mode entrypoint checks.
Test generated arguments, environment, account, working-directory, dependency,
restart, output-routing, and target-root selection through injected command and
filesystem fakes.

When `systemd-analyze` is available, use its parser against the disposable root:

```sh
systemd-analyze verify --root="$target_root" example.service
```

Populate only the minimal fake accounts, dependencies, executables, and unit
files needed inside that root. Treat a nonzero verification result as failure.
When the tool is unavailable, report the optional check as skipped rather than
weakening the repository-owned parser and routing tests.

`systemd-analyze verify --root` parses and verifies units in the specified root;
it does not install, enable, or start the service. Routine validation must not
copy into the live system root, invoke `systemctl`, start a service, require
privilege, mount devices, or mutate host service state.

## Exercise Hardened System Units At Runtime

Before claiming installation readiness for a packaged system unit that combines
`User=` with mount-namespace directives such as `ProtectHome=`,
`ProtectSystem=`, `ReadWritePaths=`, or `BindPaths=`, exercise the exact
installed unit on the target system manager. An equivalent transient exercise
is acceptable only when it preserves the manager type, service account,
namespace directives, resolved paths, and path existence and ownership
conditions of the installed unit. Direct execution as the service account does
not construct the unit's mount namespace and is not equivalent evidence.

For a system unit, `%h` denotes the home directory of the account running the
system manager, normally `/root`; systemd explicitly does not derive it from
the unit's `User=` account. Changing the credentials used for `ExecStart` does
not redefine that specifier. This boundary is specific to system units and must
not be generalized to units run by a per-user manager.

When a service needs a literal path beneath its configured account home, render
an explicit absolute path from a validated account or installation contract
into the installed unit or drop-in, or use a root-owned alias whose target is
validated by that contract. Test the exact installed artifact and resolved
target. If the data does not need to remain home-relative, prefer a
systemd-managed `StateDirectory=`, `CacheDirectory=`, `LogsDirectory=`, or
`RuntimeDirectory=` as appropriate. Rely on another specifier or indirection
only after the target manager version and runtime start prove its expansion for
that unit.

Keep static verification and runtime namespace construction as separate gates:

1. Parse the staged unit and run `systemd-analyze verify` against the disposable
   root when available.
2. Install the exact candidate without enabling unrelated scheduling, reload
   the target system manager, and use a side-effect-free probe or disposable
   fixture configuration.
3. Start the unit through that manager. Prove that `ExecStart` was reached with
   the configured service identity and that the required namespace path is
   writable or readable as promised.
4. Stop and remove test-owned state through a prevalidated cleanup path.

An exit report of `226/NAMESPACE` means systemd failed while constructing a
mount, UTS, or IPC namespace before `ExecStart`. For a unit with filesystem
sandboxing, inspect the privileged unit status and journal for the exact
rejected path and directive; application logging and entrypoint debugging are
downstream until namespace construction succeeds. Keep privileged journal
output out of ordinary test artifacts, and record only bounded, non-sensitive
evidence.

Use this focused regression scenario:

| Candidate system unit | Static gate | Runtime namespace gate |
| --- | --- | --- |
| `User=example-service`, account home `/srv/example-service-home`, `ProtectHome=read-only`, `ProtectSystem=strict`, and `ReadWritePaths=%h/.example` | Syntax and dependency verification may pass. It does not prove that `%h` follows `User=`. | The system-manager start must fail the test if `%h` resolves outside the configured account home; `226/NAMESPACE` and the bounded rejected-path evidence prove `ExecStart` was not reached. |
| The same fixture with an installer-rendered `ReadWritePaths=/srv/example-service-home/.example`, or a suitable systemd-managed directory when home-relative storage is unnecessary | Static verification still passes. | The real or equivalent manager start reaches the probe under `example-service` and proves the promised access. Mutating the fixture back to `%h` must make this gate fail. |

## Test Every Boundary

Keep routine tests download-free, non-privileged, and confined to a
test-created temporary root removed in `finally`. Generate minimal metadata and
executable headers as inert bytes. Use injected fakes for acquisition and
service-command routing, and snapshot the temporary prefix before and after the
suite when residue is a risk.

At minimum, prove this matrix:

| Scenario | Required evidence |
| --- | --- |
| Native runtime | Archive provenance, extracted-tree hash, embedded release metadata, executable header, entrypoint policy, placement rescan, and service checks all pass without relying on execution. |
| Foreign-architecture runtime | The target machine header and release metadata pass through static parsing while an execution spy remains untouched. |
| Correctly hashed non-executable entrypoint | Change the interpreter to a non-executable mode, recompute the advertised tree hash so it matches, and require fail-closed semantic rejection before copy, publication, or service verification succeeds. |
| Tampered extracted tree | Change one file after pinning; the extracted-tree gate fails even though the retained source-archive digest still matches its own artifact. |
| Escaping symlink | Add a relative link whose lexical resolution leaves the runtime root; reject it before hashing, copying, or reading the outside target, and prove the outside fixture is unchanged. |
| Invalid systemd unit | Route the generated unit to the isolated-root verifier or a deterministic failing fake; reject the bundle without installing, enabling, or starting anything. |
| Global Node CLI service | Install a generated fixture once from a local directory and once from `npm pack` output into isolated global prefixes. Prove that the local-directory install leaves a package-root symlink into the checkout, while the artifact install resolves launcher and package-root paths inside the global prefix. Mutate the checkout and require the artifact-backed launcher and disposable service canary to keep reporting the reviewed package identity. |

Also mutate every placement field independently: file bytes, mode, kind, path,
extra or missing entry, and symlink target. Each complete-root rescan must fail.
Record gate order so a final rejection cannot hide that untrusted bytes were
copied, foreign code was executed, or a live service command ran first.

## Related Guidance

Keep network acquisition and cache behavior canonical in
[`immutable-artifact-acquisition.md`](immutable-artifact-acquisition.md).
Apply the staged publication and rollback rules in
[`general-implementation.md`](general-implementation.md#safe-whole-directory-replacement);
an exact placement rescan does not itself make directory publication atomic or
crash-durable.
Keep two validation stages distinct:

1. On the build host, complete static runtime identity, entrypoint, placement,
   and service-definition verification without executing foreign target code.
2. Before claiming installation readiness, execute every generated command or
   service entrypoint through its staged or installed pathname on the actual
   target or under a target-compatible emulator. For a hardened system unit,
   include the
   [runtime namespace exercise](#exercise-hardened-system-units-at-runtime);
   for other entrypoints, use the
   [final-path launcher smoke tests](automated-testing.md#final-path-launcher-smoke-tests).

Static verification does not prove runtime specifier expansion, mount-namespace
construction, module, interpreter, working-directory, or relative-resource
resolution at startup; target-compatible execution does not replace the static
gates.
