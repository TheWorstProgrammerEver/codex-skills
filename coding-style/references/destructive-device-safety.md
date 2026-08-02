# Destructive Block-Device Safety

Treat imaging, provisioning, recovery, sanitization, and on-device
customization as one fail-closed protocol. A warning prompt around a writer is
not an authorization boundary, and a successful write is not success until
the exact intended bytes have been flushed and read back.

Keep inspection and effecting adapters separate. Before acknowledgement, the
workflow may collect topology and source metadata, but it must not acquire an
operation lock, unmount, mount, write, customize, or invoke any adapter that can
change device or host state. Every rejection in this phase must leave the
effecting-adapter call trace empty.

## Pre-Acknowledgement Authorization

Accept an explicit stable alias; do not infer a target from enumeration order,
a transient kernel name, the only removable device, or a partition path.
Resolve the alias through symlinks and require it to identify a real,
whole-device block node. Reject an unresolved alias, a partition, a non-block
object, or a resolution that escapes the supported device namespace.

Build one immutable authorization snapshot containing:

- the stable alias and canonical whole-device identity, including the device
  number, authoritative system-device path, size, and available hardware
  identity fields;
- every configured expectation for model, serial, removable state, transport,
  and maximum size;
- the complete dependency graph, mount topology, protected active mounts, and
  the exact mounted descendants eligible for later unmount; and
- the pinned source identity and expected byte length used by the writer.

A configured expectation is a guardrail, not a hint. Missing metadata, an
unexpected value, or an oversized device rejects authorization. Keep serials
and similarly identifying values out of ordinary logs and diagnostics.

### `lsblk` collection and identity parsing

Treat command output as a transport representation, not as an identity string.
In particular, `lsblk --raw` and `--pairs` can hex-escape unsafe bytes as
`\xHH`; behavior also varies by util-linux version and output column. A model
rendered for a human as `EXAMPLE SSD` can therefore arrive as
`EXAMPLE\x20SSD`. Comparing that escaped text directly with an unescaped
configured expectation is not a valid identity check, even though it fails
closed on a mismatch.

Prefer one structured invocation shaped like:

```text
lsblk --json --tree --bytes --paths --output NAME,KNAME,PKNAME,TYPE,MAJ:MIN,SIZE,RM,RO,MODEL,SERIAL,TRAN,MOUNTPOINTS <device>
```

Pass arguments without a shell, explicitly select every consumed column, and
sanitize output-shaping environment variables, including unsetting
`LIBSMARTCOLS_JSON`, so the adapter receives one JSON document in its tested
form. `--bytes` removes display units and `--paths` removes basename ambiguity;
neither proves that the JSON schema, dependency graph, or hardware metadata is
complete. Pin or probe the supported util-linux contract, and keep the
total-topology proof above authoritative.

Decode stdout as strict UTF-8 and parse JSON with duplicate-object-member
detection before constructing an identity. Require exactly the documented root
shape, field names, scalar types, and record cardinality for the selected
device. Reject malformed or trailing JSON, duplicate member names even when
their values agree, missing or `null` required fields, unexpected scalar or
container forms, invalid Unicode, and duplicate or contradictory device
records. A parser that silently keeps the first or last duplicate key is not
an authorization parser.

Compare configured and observed identity values in the same decoded domain.
Default to exact, case-sensitive comparison of decoded JSON strings. If a
supported field source needs normalization, specify it per field, apply it to
both values, and bound it. For example, an adapter may remove at most a tested
number of trailing ASCII padding spaces from `MODEL`; it must preserve leading
and internal spaces and must not silently trim controls, case-fold, or apply
open-ended Unicode normalization. Reject forbidden controls and normalization
overflow.

If compatibility requires raw or pairs output, give it a separate strict
decoder: validate every `\xHH` escape, decode to bytes, require valid UTF-8,
then apply the same field policy. Truncated escapes, non-hex escapes,
undecodable bytes, or an unexpected mixture of encoded and display forms deny
authorization. Never switch only one side of a comparison between decoded and
transport forms.

Model device dependencies as a graph, not as a tree with one parent field.
Preserve every edge for N:M stacks such as RAID, multipath, and multi-device
filesystems, even when a flat topology command repeats nodes. Establish total
ancestry for every mounted node before presenting any candidate: missing
parents, unresolved references, cycles, contradictory records, or an adapter
that cannot prove it returned the complete graph are unknown topology and must
fail closed.

Reject a candidate that is, contains, or backs the active root or any other
configured protected active mount. Traverse all dependency edges so a direct
root device, a device-mapper layer, and every backing disk in an N:M stack are
equally protected. Do not treat a mounted node as unrelated to the candidate
until its total ancestry has been proved. Non-protected mounted descendants may
be authorized only when their exact identities and mountpoints are enumerated
for narrow later cleanup.

After all guardrails pass, render a bounded, redacted plan from the immutable
snapshot. Show enough target, constraint, source-length, and descendant
information for an operator to recognize the operation without emitting full
serials, raw topology dumps, credentials, private mount paths, or unrelated
host state. Present that plan before requesting one exact acknowledgement tied
to its identity. Non-interactive `--yes` may supply the acknowledgement, but it
must execute the same inspection, guardrails, plan construction, locking,
rechecks, write, verification, and cleanup as the interactive path.

## Post-Acknowledgement Transaction

After exact acknowledgement, enter one transaction and keep it open through
final cleanup:

1. Acquire an exclusive operation lock keyed by the canonical whole-device
   target so two aliases cannot create independent locks for the same device.
   Lock contention fails without unmounting or writing.
2. While holding the lock, resolve the stable alias again and collect a fresh
   identity and complete topology snapshot. Require an exact match with the
   authorized whole-device identity and constraints.
3. Immediately before each authorized descendant unmount, refresh identity and
   topology under the lock. Require the same target and the same exact
   descendant identity, then unmount only that descendant in safe reverse
   dependency order through a cancellable adapter. Await each result; any
   refusal, topology change, or failure prevents the writer from starting.
4. Immediately before opening the writer, repeat the locked identity and
   topology check. A changed alias, reused device number, replaced descendant,
   new unsafe mount, incomplete graph, or newly protected dependency aborts.
5. Stream exactly the authorized source length from the pinned source, require
   truthful exact source/read/write byte counts, flush and sync the target, and
   then compare the full image-sized target range byte-for-byte with those same
   authorized source bytes. Revalidate the pinned source identity before reuse.
   A short or long source, source-identity or length drift, short read or write,
   inexact adapter report, sync failure, or mismatch prevents success.
6. Keep the same lock and identity discipline across any later target
   acquisition or customization effects, then perform final cleanup before
   releasing the lock.

Use structured process and stream adapters with explicit start, cancel, await,
and byte-count contracts. Put external writers and producers in owned process
groups where the platform supports it. On cancellation or failure, stop active
producers and descendants and await their terminal events; do not let a shell
pipeline, background process, or unobserved promise continue writing while
cleanup proceeds.

## Acquisition And Cleanup Ownership

An acquisition command can create a mount, mapping, loop attachment, or other
resource and still report failure, timeout, signal, or cancellation. Record the
exact potential cleanup responsibility before invoking such a command. Retain
that responsibility across ambiguous completion and clear it only after
proving no acquisition occurred or after verified cleanup succeeds. Recording
ownership only after a successful return leaves the side-effect-then-failure
window unowned.

Cleanup runs in a separate bounded context that is not already canceled by the
primary operation. It must:

- stop and await every active producer or owned process group before touching
  device state;
- revalidate the canonical whole-device and descendant identities before each
  cleanup mutation, and never unmount, detach, or remove a replacement object;
- retry only the exact enumerated, operation-owned descendant cleanup that is
  safe for the still-matching identity;
- preserve unresolved ownership and recovery state when safe cleanup cannot be
  proved;
- remove signal listeners and other process-wide hooks; and
- release the exclusive lock only after active work has settled and cleanup
  has reached a terminal state.

Signal handling enters the same cancellation and cleanup path as ordinary
failure. Incomplete, unverified, or unsuccessfully cleaned media must never be
relabeled successful. When the primary phase and cleanup both fail, report a
structured aggregate that preserves the primary error, cleanup errors, phase
names, and bounded recovery state. Do not replace the causal writer or
customization error with the last cleanup exception.

## Deterministic Validation Without Devices

Routine tests and CI must use recorded topology fixtures, injected fakes,
temporary operation locks, and regular files only. Do not require loop devices,
real mount namespaces, removable media, or privileged destructive commands.

For every authorization rejection, assert the complete effecting-adapter trace
is empty. Cover at least:

- direct, device-mapper, partition-alias, RAID, multipath, and multi-device
  active-root ancestry;
- all parents in N:M graphs, plus missing-parent, missing-edge, repeated-node,
  contradictory, and cyclic mounted-node fixtures;
- protected mounts, allowed mounted descendants, every configured identity or
  constraint mismatch, unresolved and partition aliases, oversized targets,
  redacted-plan construction, and rejected or malformed acknowledgement;
- the `lsblk` identity parsing fixtures below, including the raw-output
  negative control; and
- the non-interactive path, proving `--yes` acknowledges an authorized plan but
  cannot bypass a guardrail.

Exercise the production collector, strict parser, authorization boundary, and
recording effect spy together with synthetic fixtures such as:

| Fixture | Required result |
| --- | --- |
| Ordinary JSON model `"EXAMPLE-SSD"` | Decodes and compares exactly; later effects remain subject to every other authorization gate. |
| Spaced JSON model `"EXAMPLE SSD"` | Matches the same decoded configured value without transport-level rewriting. |
| JSON-escaped model `"EXAMPLE \"BRIDGE\""` | JSON decoding produces `EXAMPLE "BRIDGE"` and exact decoded comparison succeeds. |
| Raw model `EXAMPLE\x20SSD` versus configured `EXAMPLE SSD` | A deliberately unsafe direct string comparison denies and leaves the effect trace empty; the separately tested strict raw decoder may produce the decoded value. |
| Raw tab escape `EXAMPLE\x09SSD` | Decoding reaches the field policy, which rejects the forbidden control and leaves the effect trace empty. |
| Missing, `null`, or non-string required model | Parsing or authorization denies and leaves the effect trace empty. |
| Duplicate `model` member, duplicate selected-device record, or contradictory record | Parsing denies before first-value/last-value selection and leaves the effect trace empty. |
| Malformed JSON, invalid UTF-8 or Unicode, `\x2`, `\xGG`, or an incomplete encoded byte sequence | Decoding or parsing denies and leaves the effect trace empty. |

Build expected decoded values independently of collector output. Mutation-check
the duplicate-member rejection and the raw direct-comparison negative control
so a permissive parser or accidental transport comparison makes the focused
suite fail.

Use deterministic hooks between acknowledgement and every effect boundary.
Prove lock contention, alias or identity replacement before the locked recheck,
replacement before every individual unmount, topology changes, unmount order,
unmount failure preventing write, and replacement immediately before writer or
customization acquisition.

Exercise regular-file streaming with a known byte pattern and faults for short
source, longer source, source-length drift, short write, short read, dishonest
adapter counts, flush or sync failure, and a mismatch at the beginning, middle,
and end of the full comparison range. Success requires the exact counts, sync,
and full read-back gate in that order.

Cancel and signal at every blocking phase. Assert bounded settlement, awaited
process completion, no writer surviving cleanup, exact lock release, listener
removal, and no unowned fixture residue. Include acquisition fakes that
side-effect and then throw, time out, or observe cancellation; each must remain
owned until cleanup is verified. Finally, inject simultaneous primary and
cleanup failures and assert both remain independently inspectable with the
correct primary phase.

Use synthetic aliases, identities, serials, and mount labels in fixtures and
documentation. Never copy a real device identifier, local mount path,
credential, or host-only fact into shared examples.

Keep this guidance tied to the generalized safety contract in
[RYA-174](https://linear.app/ryan-hayward/issue/RYA-174/hive-mind-add-fail-closed-destructive-device-guardrail-guidance);
platform-specific adapters still need separate review against their current
kernel and tool contracts.
