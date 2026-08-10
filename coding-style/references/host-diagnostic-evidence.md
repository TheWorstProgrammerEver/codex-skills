# Host-Diagnostic Evidence

Host diagnostics often combine several individually correct observations into
a false host-level conclusion. Scope every conclusion to the resource or
setting being diagnosed, retain the provenance of each observation, and make
incomplete or conflicting evidence visible.

## Preserve The Evidence Boundary

Model raw observations separately from derived conclusions. An observation
records its source, collection status, scope, normalized identity, and value;
the conclusion records the target, rule, contributing observation identities,
and confidence or unknown reason. Do not rewrite a generic command's label into
a stronger fact in the collector.

- Keep failed, unsupported, partial, and malformed collection distinct. Do not
  replace missing target evidence with a host-wide default or a convenient
  filesystem artifact.
- Report `unknown` when the target cannot be resolved, a required topology edge
  is absent, normalization is ambiguous, the authoritative merge fails, or
  equally authoritative observations conflict. Include bounded non-sensitive
  reasons and the conflicting source identities.
- Use host-neutral labels in fixtures, examples, logs, and shared guidance. Do
  not preserve serial numbers, real hostnames, private paths, or device IDs.

## Scope Block Capabilities To The Target Stack

Resolve a requested path to the longest containing mount, then resolve that
mount's canonical source to the complete active block-device stack. Traverse
partitions, device-mapper or LVM layers, software RAID fan-out, and physical
parents or slaves according to the platform topology. Keep loops, zram, and
other unrelated devices outside the evidence set even when they advertise the
capability being queried.

- Evaluate discard, rotation, transport, write location, health, and similar
  claims only from the resolved target stack. A positive value on any device
  elsewhere on the host is not evidence about the target.
- Apply the capability's end-to-end semantics at every required active layer.
  A discard-capable physical parent does not prove that an intervening mapped
  layer passes discard; a zero value on the target path is not overridden by a
  capable loop or memory-backed device. If required layer evidence is missing
  or the mount source cannot be mapped uniquely, report `unknown`.
- Preserve the resolved target, containing mount, canonical source, topology
  edges, and per-layer values as observations. Derive the summary only after
  that scoped graph is complete.

## Normalize Virtual Device Identity Explicitly

Treat utility type fields as syntax owned by that utility, not as physical
storage identity. `lsblk` may present zram with a disk-like type and `swapon`
may present it as a partition. Normalize the canonical kernel device through
the topology or an authoritative platform identity source before classifying
physical storage, memory-backed storage, or the write path.

- Recognize loop, zram, ram-backed, device-mapper, LVM, and software RAID
  identities explicitly. Preserve both the raw utility label and normalized
  family so diagnostics remain auditable.
- Do not equate `disk` or `partition` with physical media. In particular, zram
  reported as a partition is memory-backed swap, not disk-backed swap.
- Do not discard mapped or RAID devices merely because they are virtual.
  Traverse their backing graph and distinguish the virtual layer from its
  physical leaves. When identity or backing relationships cannot be proven,
  keep the classification unknown.

## Resolve Effective Systemd Configuration

For a systemd-managed setting, use a systemd-aware merge path that accounts for
the main file, vendor and local overrides, runtime configuration, drop-ins,
precedence, reset assignments, and masking rules. Prefer an authoritative
manager property when it exposes the exact effective setting; otherwise use a
validated command or adapter such as the appropriate `systemd-analyze
cat-config` path and parse its successful merged result with the format's
section semantics.

- Do not parse only the main file when drop-ins can override it. Do not infer
  effective state from the presence of a configuration directory, runtime
  directory, persistent data directory, or stale artifact.
- Treat filesystem artifacts as separate observations. Apply them only when
  the effective setting's documented semantics require them—for example, a
  directory may decide an explicit `auto` mode but cannot override an effective
  `volatile` mode.
- If the systemd-aware merge is unavailable, fails, returns partial output, or
  cannot establish precedence, report the setting as unknown. Do not fall back
  to a plausible value from the base file while silently ignoring drop-ins.

Use the scenario and mutation matrix in
[`automated-testing.md`](automated-testing.md#host-diagnostic-evidence-tests).
