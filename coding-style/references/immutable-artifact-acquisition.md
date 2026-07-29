# Immutable Artifact Acquisition

Treat acquisition as one trust boundary from a trusted catalog or manifest to
the bytes returned to the caller. A pathname, completed request, pre-existing
file, or checksum-derived name is not proof that its contents are trusted.

## Contents

- [Pin The Artifact Contract](#pin-the-artifact-contract)
- [Keep Cache States Distinct](#keep-cache-states-distinct)
- [Serialize By Content Identity](#serialize-by-content-identity)
- [Validate Resume Responses](#validate-resume-responses)
- [Verify Before Atomic Promotion](#verify-before-atomic-promotion)
- [Bound Failures And Cleanup](#bound-failures-and-cleanup)
- [Test The Whole Trust Boundary](#test-the-whole-trust-boundary)
- [Related Guidance](#related-guidance)

## Pin The Artifact Contract

Resolve mutable discovery data into an immutable acquisition contract before
touching the cache. Pin at least the accepted source URL or URL policy, exact
byte length, checksum algorithm and digest, and any format identity required by
the consumer. Authenticate or otherwise trust the catalog or manifest through
a separate explicit boundary; transport security alone does not establish
checksum provenance.

Derive the content-cache identity from the algorithm and validated digest, not
from a URL, release label, response header, or caller-supplied filename. Validate
the digest syntax and length before using it in a path. Do not silently resolve
`latest`, refresh the manifest during recovery, or combine a checksum sidecar
with an artifact URL it did not pin.

Make redirect behavior explicit in the transport. Prefer rejecting redirects
and disabling automatic following. If redirects are required, bound the hop
count, validate every target against an allowlist and scheme policy, and keep
the original pinned length and digest authoritative. Disable transparent
content transformations unless the checksum contract explicitly covers the
transformed representation.

## Keep Cache States Distinct

Model these states separately:

- **Partial:** untrusted bytes at a non-final, per-content path. They may be a
  resumable prefix only after their type, size, ownership, and response history
  satisfy the resume policy. Never return or inspect them as a cache hit.
- **Verified final:** a regular final entry whose current bytes have just
  matched both the pinned length and checksum under the content lock. Verification
  is an acquisition event, not a permanent property of the pathname.
- **Quarantined:** a corrupt or structurally invalid former final moved to a
  non-serving area before replacement. Quarantined bytes are evidence or
  cleanup candidates, never acquisition candidates.

Reverify every existing final on every acquisition before returning it,
including offline use. If it fails type, length, checksum, or required format
inspection, quarantine it under the lock and continue as a cache miss. Never
return the corrupt bytes when replacement cannot be downloaded.

Discard oversized and checksum-mismatched partials. Retain an interrupted
partial only when it remains a bounded prefix produced under a validated
response contract. Keep quarantine naming generated and bounded rather than
embedding URLs, response text, or attacker-controlled filenames.

## Serialize By Content Identity

Acquire one exclusive lock keyed by the validated algorithm and digest before
examining final, partial, or quarantine state. Hold it through revalidation,
quarantine, download or resume, whole-file verification, promotion, and owned
cleanup. A waiter must re-run the full final-entry verification after acquiring
the lock; it must not trust the prior writer's outcome or an observed pathname.

Lock cancellation or timeout must not disturb a live owner. If stale takeover
is supported, prove the prior owner identity and serialize recovery rather than
deleting a lock because its age or process number looks stale.

## Validate Resume Responses

Use the validated partial's current length as the resume offset and request the
remaining suffix with `Range: bytes=<offset>-`. Before appending any body bytes:

1. Require `206 Partial Content` for a resumed response. Parse one strict
   `Content-Range`; require its start to equal the requested offset, its total
   to equal the pinned length, and its end to be within that total.
2. Compute the declared range span. If `Content-Length` is present, require it
   to equal that span. Count streamed body bytes independently, reject before
   writing past the declared span or pinned total, and require the completed
   body length to equal the declared span.
3. For a one-response suffix contract, require the range end to be the final
   pinned byte. If shorter valid ranges are supported, persist only the proven
   prefix and repeat the same validation for every subsequent request.
4. Treat `200 OK` after a ranged request as a server that ignored `Range`.
   Reopen or truncate the partial and process the response as a full download
   from byte zero; never append it at the old offset.
5. Reject redirects according to the explicit redirect policy. For any other
   status, malformed or inconsistent range, invalid declared length, or
   oversized body, append nothing. Either fail or discard the partial and make
   one bounded full request with no `Range`.

For a full `200` response, validate any declared length against the pinned
length and independently require the observed body to be exactly that length.
A missing length header never removes the observed-length and checksum gates.
Give the transport an explicit bounded body-disposal contract. Drain or cancel
and close every accepted or rejected response before retrying or releasing the
content lock; throwing before iteration must not leave a socket or stream
active. Also settle and close the file handle on interruption or cancellation.

## Verify Before Atomic Promotion

After the complete partial is closed and synced, read it from byte zero. Require
its exact pinned length and checksum, plus any required format inspection,
before it can enter the final namespace. A successful HTTP status, matching
suffix length, or checksum of only the resumed bytes is insufficient.
A pre-existing partial that already has the pinned length follows these same
whole-file gates; it is not a cache hit merely because no more bytes are needed.

Create the partial on the final entry's filesystem and promote it with one
atomic rename only after all gates pass. Never copy into the final pathname,
rename before verification, or expose a temporary name that consumers treat as
final. After promotion, callers still receive the final entry only through the
verified acquisition path.

## Bound Failures And Cleanup

Use stable error codes and bounded messages. Do not include raw URLs, redirect
locations, response bodies, proxy errors, cache paths, manifest contents, or
other transport diagnostics that may contain credentials or private host
facts.

On failure, preserve only a policy-valid resumable prefix. Remove oversized,
structurally invalid, or checksum-mismatched completed partials, release owned
handles and locks, and limit cleanup to exact operation-owned paths. Give
quarantined finals an explicit retention or eviction policy so repeated
corruption cannot grow storage without bound.

## Test The Whole Trust Boundary

Use an injected fake transport for precise response and interruption faults,
plus a loopback HTTP server for the real client's status, header, range,
redirect, streaming, and cancellation behavior. Allocate each scenario under a
test-created temporary root, close servers and streams, restore process-wide
state, and remove the root in `finally`.

At minimum, prove:

| Scenario | Required evidence |
| --- | --- |
| Catalog and cache identity | Mutable releases, malformed digests, mismatched checksum sources, and unpinned URLs fail before cache mutation; equivalent pinned content shares one digest-keyed entry. |
| Full download | Exact bytes, pinned length, whole-file checksum, and required format inspection pass before the final path appears. |
| Interruption and resume | Only the validated prefix remains; the next request uses its exact offset and verifies the completed file from byte zero. |
| Ignored `Range` | A resumed `200` truncates and safely restarts from zero rather than appending a full body. |
| Invalid range or length | Wrong status, range start/end/total, declared length, short body, and oversized body never promote or expose bytes. |
| Redirect policy | Automatic following is disabled; rejected and explicitly allowed hops both follow the configured policy without leaking locations. |
| Checksum failure | A full-length mismatch is discarded and no final entry appears. |
| Corrupt final | The entry is reverified, quarantined before replacement, and never returned, including when replacement is offline. |
| Concurrency | Two callers cause at most one writer; waiters see no partial final and independently verify the promoted entry. |
| Atomic visibility | A reader observes either no final entry or the complete verified bytes, never a prefix, across injected promotion boundaries. |
| Offline hit | A pre-existing final is reverified and returned without transport access only when both pinned gates pass. |
| Cancellation and cleanup | Requests, streams, handles, waiters, and locks settle; retained partials obey policy and no unowned fixture remains. |

Record the event order as well as the result. A test that sees the expected
final bytes does not prove that verification preceded rename or that another
caller could not observe the final path early.

## Related Guidance

Before an adapter's first destructive or production use, apply
[Pinned External-Artifact Fixture Conformance](automated-testing.md#pinned-external-artifact-fixture-conformance)
to prove that the catalog lock, metadata from the exact verified bytes, and the
checked-in semantic fixture agree. This is separate from transport, checksum,
cache, and atomic-promotion correctness.

Apply
[RYA-158](https://linear.app/ryan-hayward/issue/RYA-158/hive-mind-verify-directory-durability-on-atomic-write-recovery)
for directory-sync and crash-durability requirements after atomic rename; do
not infer them from rename alone. Apply
[RYA-74](https://linear.app/ryan-hayward/issue/RYA-74/harden-linear-worker-for-long-running-resumable-downloads-and-network)
when operating a multi-hour transfer as a durable external job rather than
foreground-monitoring it. Keep stale-lock takeover details tied to
[RYA-176](https://linear.app/ryan-hayward/issue/RYA-176/hive-mind-make-stale-file-lock-takeover-identity-safe-and-race-tested).
