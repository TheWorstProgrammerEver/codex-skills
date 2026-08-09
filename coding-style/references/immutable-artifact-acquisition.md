# Immutable Artifact Acquisition

Treat acquisition as one trust boundary from a trusted catalog or manifest to
the bytes returned to the caller. A pathname, completed request, pre-existing
file, or checksum-derived name is not proof that its contents are trusted.

## Contents

- [Pin The Artifact Contract](#pin-the-artifact-contract)
- [Authenticate Long-Lived Catalogs](#authenticate-long-lived-catalogs)
- [Advance One Exact Accepted Head](#advance-one-exact-accepted-head)
- [Recover Content Without Rolling Back](#recover-content-without-rolling-back)
- [Bound Signing Authority By Sequence](#bound-signing-authority-by-sequence)
- [Recover A Lost Or Compromised Authority](#recover-a-lost-or-compromised-authority)
- [Rotate Checkpoint And Recovery Authorities](#rotate-checkpoint-and-recovery-authorities)
- [Preserve And Restore The Trust Evidence](#preserve-and-restore-the-trust-evidence)
- [Keep Cache States Distinct](#keep-cache-states-distinct)
- [Serialize By Content Identity](#serialize-by-content-identity)
- [Validate Resume Responses](#validate-resume-responses)
- [Verify Before Atomic Promotion](#verify-before-atomic-promotion)
- [Promote Across Remote Filesystems](#promote-across-remote-filesystems)
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

## Authenticate Long-Lived Catalogs

A collision-resistant digest proves that bytes match the object that names the
digest. It does not prove who authorized that object. If an attacker can replace
both an archive payload and its adjacent checksum or manifest, the replacement
is self-consistent but unauthenticated. Treat payload integrity, catalog
authenticity, and accepted-head freshness as three separate gates.

Use a versioned canonical catalog object that closes over the complete
collection. Its stable artifact-ID-to-manifest-digest map must transitively bind
every payload, dependency, licence record, derivative recipe and parent,
runtime, test fixture and result, retention or tombstone record, and backup
record. Each manifest must in turn bind exact byte lengths and collision-
resistant digests. A local catalog signature attests that the archive custodian
accepted that evidence; it does not invent an upstream publisher signature.
Represent an unsigned upstream release with `upstreamSignatureStatus=absent`
or an equivalent explicit provenance limit while still requiring local custody
authentication.

### Canonical signed object

Choose one canonical encoding and one domain-separated signature preimage for
each version. The interoperable profile used by this guidance is RFC 8785 JSON
Canonicalization Scheme (JCS), SHA-256 object identities, and detached
signatures. A profile may select another reviewed signing product or algorithm,
but it must preserve the same object, lifecycle, checkpoint, and recovery
semantics and must never rely on a serializer's incidental output.

Schema version 1 defines a signature-free `nextRootCore` with exactly these
fields, rejecting every missing or extra field:

| Field | Contract |
| --- | --- |
| `rootSchemaVersion` | Fixed versioned root schema identifier. |
| `rootType` | `ordinary` or `authority-transition`; this selects the signing-authority path independently of whether content is forward-recovered. |
| `collectionId` | Stable trust-domain identifier. |
| `generationSequence` | Canonical ASCII decimal string matching `0|[1-9][0-9]*`; never a JSON number. |
| `generationId` | Unique immutable generation identifier. |
| `previousRootSha256` | Exact predecessor root digest, or the policy-defined genesis value. |
| `creationTime` | Provenance only; it is not an authorization oracle. |
| `trustPolicyVersion` | Exact policy version active for this proposed root. |
| `artifactManifestDigests` | Complete stable-artifact-ID-to-manifest-SHA-256 map in JCS key order. |
| `schemaIndexSha256` | Digest of all active schema identities. |
| `policyIndexSha256` | Digest of the active signing, checkpoint, recovery, and optional time policies. |
| `retentionTombstoneIndexSha256` | Digest of the retention, supersession, revocation, and tombstone set. |
| `testEvidenceIndexSha256` | Digest of the exact test and restore evidence set. |
| `forwardRecovery` | Always present. It is `null` when content advances normally, or the exact forward-recovery object below when this generation restores safe content. |

`nextRootCore` explicitly excludes authority-transition, approval,
preauthorization, receipt, signature-envelope, and final-root-digest links. An
ordinary final root without recovery is the corresponding core fields. An
ordinary final root with recovery adds only ordered
`forwardRecoveryAuthorizationSha256s`; each referenced authorization binds the
exact `nextRootCore` digest. An authority-transition final root, with or without
forward recovery, copies the core fields and adds only
`authorityTransitionCoreSha256` and ordered `authorityApprovalSha256s`. For a
combined authority transition and forward recovery, the recovery-intent
approvals over the authority core authorize the recovery; the earlier
`nextRootCore` must not link forward to them.

A non-null `forwardRecovery` contains exactly these fields:

```text
forwardRecoverySchemaVersion, currentPredecessor, abandonedContentHead,
restoreContentFrom, recoveryPolicySha256, reason, cutoffSha256
```

Require
`forwardRecoverySchemaVersion="olympus-artifact-forward-recovery/1"`. Each
head uses the exact head-tuple schema. `currentPredecessor` and
`abandonedContentHead` equal the root's accepted predecessor;
`restoreContentFrom` is an earlier accepted safe head in the same collection;
`reason` is a non-empty policy-bounded code; and `cutoffSha256` is either `null`
or the digest of the exact applicable cutoff. The object carries substantive
recovery state only. It contains no approval, authorization, preauthorization,
signature, receipt, authority-core, or final-root link.

This makes the two dimensions composable: `rootType="ordinary"` with a
non-null recovery object is a catalog-signer-authorized forward recovery;
`rootType="authority-transition"` with a non-null recovery object is an
authority transition that also restores safe content. A cutoff covering
accepted content or current-head evidence requires the latter object; `null`
or omission fails closed. An ordinary root with `forwardRecovery=null` is the
normal successor after either recovery path.
Detached signatures cover:

```text
UTF8("olympus-artifact-catalog-root/v1") || 0x00 || JCS(finalRoot)
```

The signature envelope records its schema version, algorithm, key ID, complete
public-key fingerprint, signed-root SHA-256, and base64url-without-padding
signature. Verify the exact canonical bytes, digest, domain, algorithm, key,
fingerprint, role, sequence authorization, and threshold before treating the
root as authenticated. Do not accept a signature over a pretty-printed file,
only the manifest map, or an adjacent checksum sidecar as equivalent.

### Independent trust anchors

Distribute the bootstrap trust-policy digest, catalog public keys, checkpoint
authority sets, and recovery-authority sets outside the mutable archive. Use
offline recovery documentation, independently administered read-only media,
or another authenticated configuration channel. A copy inside the archive can
aid reconstruction but cannot bootstrap trust in that same archive. Restore
must require no signing secret: public keys, fingerprints, policies, signed
history, and checkpoint evidence are sufficient for verification.

Each trust policy must bind:

- key ID, complete public-key fingerprint, algorithm and signature domain;
- collection and role, with inclusive generation-sequence authorization
  bounds;
- checkpoint- and recovery-authority set IDs, ordered members, role-specific
  thresholds, and activation boundaries;
- planned rotation, retirement, expiry and emergency-replacement rules;
- inclusive compromise or revocation cutoffs and any last-safe content head;
  and
- whether the optional trusted-calendar-time profile is disabled or names its
  approved time sources and limits.

Reject an unknown algorithm, key, fingerprint, role, policy, set, threshold,
or trust domain. Archive access credentials, storage credentials, and catalog
signing or recovery authority are separate capabilities; never put private
signing material in manifests or backups merely to make restore convenient.

## Advance One Exact Accepted Head

A valid signature chain does not prevent replay of an older validly signed
root. Maintain at least two independently administered accepted-head
checkpoints. The head tuple is exactly:

```text
H = (collectionId, generationSequence, generationId, rootSha256)
```

One promotion owner serializes every transition for a collection. Give each
transaction a collection-global ID and persist its immutable proposal before
checkpoint mutation. A transaction ID may resume only the byte-identical
pending proposal; reuse after acceptance or abort, or with another predecessor,
successor, role, or policy, fails closed.

Use this state transition for `H_N` to `H_N+1`:

1. Read the active collection and every checkpoint authoritatively. Require
   exact equality on `H_N`, the active policy, and authority sets.
2. Verify that the proposed sequence is exactly arbitrary-precision `N+1`, its
   `previousRootSha256` is `H_N.rootSha256`, and no other generation ID or root
   digest claims that sequence. Commit it immutably as pending without moving
   the active pointer.
3. At each checkpoint, perform an exact-predecessor compare-and-swap from
   `H_N` to the identical `H_N+1` transaction. After durable persistence, each
   checkpoint authority signs a location-specific receipt that binds the
   collection, complete prior and new head tuples, transaction ID, authority
   set ID, policy version, key ID, fingerprint, and decision.
4. Re-read both independent checkpoints and receipts. Activate only when every
   required receipt is valid and agrees byte-for-byte on the exact new head,
   predecessor, transaction, policy and authority set.
5. Promotion, replication, periodic scrub, and restore certification require
   the presented active tuple to equal the jointly checkpointed tuple and its
   matching receipt set. A root signature or relative sequence comparison is
   insufficient.

Checkpoint receipts are durable protocol evidence, not mutable log lines.
Back up their signed bytes and the corresponding checkpoint records. A verifier
must reject replay of `H_N` after `H_N+1` is accepted, a signed but unaccepted
pending successor, a same-sequence or same-generation fork, skipped sequence,
missing or mismatched receipts, a mixed authority set, and an unknown
transaction.

### Deterministic partial-failure reconciliation

If no checkpoint advanced, the owner may resume or abort the exact pending
transaction. If one checkpoint advanced, or both advanced but activation or a
receipt write is uncertain, freeze later promotion, replication certification,
scrub certification, and restore certification. Preserve all evidence and
authoritatively re-read every location.

Only the unique byte-identical successor of the former common head may roll
forward. Reverify its root, policy, transaction and existing receipt, advance
the remaining checkpoint from the exact predecessor, recover only an
independently provable missing receipt, then activate after the complete receipt
set agrees. A competing pending successor, fork, unknown checkpoint state,
missing exact evidence, or terminal transaction remains frozen. Never reconcile
by lowering a checkpoint, silently accepting the old head, overwriting a
different head, or creating a corrected root at the same sequence.

## Recover Content Without Rolling Back

Recovery is monotonic. To restore earlier safe content after accepting a bad or
unusable head, create a new recovery-authorized generation that extends the
current head. Its `forwardRecovery` object binds:

- the exact current predecessor and abandoned content head;
- `restoreContentFrom`, the complete previously accepted safe content tuple;
- the recovery-policy digest; the final root separately binds the ordered
  authorization-record digests for an ordinary-authority recovery, while an
  authority transition is authorized by its later recovery-intent approvals;
- the reason and any inclusive compromise cutoff; and
- the fact that manifests and content are restored from the safe tuple while
  lifecycle and history continue from the current head.

The recovery quorum signs the exact forward-recovery authorization. Both
checkpoints then advance normally and issue matching receipts for the new head.
The abandoned root remains immutable history and cannot be reactivated. A
normal successor must extend the recovery root, not the earlier content source.

The required trace is:

```text
accepted H_N+1
  -> recovery-authorized H_N+2 extending H_N+1 but restoring H_N content
  -> ordinary H_N+3 extending H_N+2
```

Reject old `H_N+1` reactivation, a corrected `H_N+1` fork, skipped `H_N+2`, a
future ordinary root that extends `H_N`, or any checkpoint decrease. This
forward-only rule replaces a conventional rollback statement that would move
the accepted head backward.

## Bound Signing Authority By Sequence

Do not decide signing authority from a controller's process clock or from a
root's attacker-chosen `creationTime`. Compare canonical decimal sequences as
arbitrary-precision non-negative integers: shorter digit length is smaller;
equal lengths compare lexicographically. Reject every non-canonical spelling.

Use authenticated lifecycle transitions to give each catalog signer and
authority set inclusive sequence bounds. A planned rotation at sequence `R`
binds and is signed according to the old and new policy, authorizes the old key
through `R`, and authorizes the new key from `R+1`. Planned expiry or retirement
stops new issuance after its accepted boundary without invalidating history
that was signed and accepted inside the key's authorized window. A later
old-key root fails even if its `creationTime` is backdated.

A compromise or revocation cutoff can invalidate subject evidence from a
sequence boundary onward. Preserve covered signatures as immutable historical
evidence but do not count them toward authentication, checkpoint acceptance,
recovery quorum, or replacement bootstrap. Apply the inclusive cutoff contract
defined below; equality is covered.

### Optional calendar-time profile

Sequence authorization is the default. If policy also gates calendar time, it
must pin approved time-source identities, store a non-decreasing trusted-time
floor outside process memory, resynchronize after process restart and reboot,
bound permitted forward steps and source divergence, and require matching
authenticated attestations from both checkpoint authorities. Withhold receipts
and freeze promotion when sources are missing or unapproved, the persisted
floor regresses, restart cannot re-establish confidence, a step exceeds policy,
or checkpoint attestations disagree. Wall-clock timestamps remain provenance
when this complete profile is not active.

## Recover A Lost Or Compromised Authority

Emergency replacement must not require the lost catalog key and must not grant
recovery members ordinary catalog-signing power. The recovery-authority quorum
signs matching exact replacement or cutoff intents, both checkpoint authorities
preauthorize the same transition, and the recovery quorum plus replacement
catalog key sign the exact next transition root. The following root must be an
ordinary successor signed only under the replacement catalog policy.

Build the evidence in this acyclic order:

```text
nextRootCore + optional cutoff
  -> replacementProof -> detached replacement-proof signature
  -> authorityTransitionCore
  -> ordered role approvals and both checkpoint preauthorizations
  -> final transition root
  -> detached recovery-quorum and replacement-key signatures
  -> complete-new-checkpoint-set receipts
```

No earlier object may contain the digest, signature, receipt, approval, or
preauthorization of a later object. Require exact schemas: reject extra,
missing, self-referential, circular, or out-of-stage fields rather than ignoring
them.

### Replacement proof and cutoff

The RFC 8785 JCS `olympus-authority-replacement-proof/1` object contains
exactly:

```text
replacementProofSchemaVersion, proofPurpose, collectionId,
transitionTransactionId, priorHead, activationBoundarySequence,
subjectRole, subjectKeyId, subjectFingerprint,
replacementRole, replacementKeyId, replacementFingerprint,
oldCheckpointAuthoritySetId, newCheckpointAuthoritySetId,
oldRecoveryAuthoritySetId, newRecoveryAuthoritySetId,
oldTrustPolicySha256, newTrustPolicySha256, nextRootCoreSha256,
cutoffSha256, lastTrustedHead, suspectHead,
affectedEvidenceSha256s, reconstructedChainSha256
```

Require
`replacementProofSchemaVersion="olympus-authority-replacement-proof/1"` and
`proofPurpose="replacement-key-possession"`. The full heads use the exact head
tuple schema. Outside an affected-evidence transition, the last four fields are
respectively `null`, `null`, `[]`, and `null`. `cutoffSha256` is `null` if and
only if the authority core cutoff is `null`; otherwise it is SHA-256 over the
cutoff JCS bytes. The proof contains no authority-core or later-object link.

The replacement key signs exactly:

```text
UTF8("olympus-authority-replacement-proof/v1") || 0x00
  || JCS(replacementProof)
```

Its detached envelope contains exactly
`signatureSchemaVersion="olympus-authority-replacement-proof-signature/1"`,
`algorithm="Ed25519"`, `keyId`, `publicKeyFingerprint`,
`signedReplacementProofSha256`, and a base64url-without-padding `signature`.
The key and fingerprint must match both the proof and the member pinned for
`replacementRole` in the new policy. The core binds only the proof digest; the
proof and core never bind the later envelope.

A non-null inline `olympus-authority-evidence-cutoff/1` object contains exactly:

```text
cutoffSchemaVersion, collectionId, transitionTransactionId,
declaredAtPriorHead, subjectRole, subjectKeyId, subjectFingerprint,
reason, comparison, firstAffectedSequence, evidenceScope
```

Require `reason` to be `compromise` or `revocation`,
`comparison="effective-sequence-gte"`, and
`evidenceScope="all-authority-evidence-signed-by-subject"`. Compare the
canonical `firstAffectedSequence` inclusively and at arbitrary precision.
Resolve subject evidence to one effective sequence as follows:

| Evidence | Effective sequence |
| --- | --- |
| Catalog-root signature | The signed root's `generationSequence`. |
| Checkpoint receipt | The receipt's accepted new-head sequence. |
| Checkpoint preauthorization | The uniquely digest-linked candidate transition sequence. |
| Recovery authorization or intent | The uniquely digest-linked candidate or activation sequence. |
| Authority approval | The bound authority core's activation sequence. |
| Replacement proof | Its activation boundary sequence. |
| Policy or signer-lifecycle signature | The uniquely bound activation boundary. |

Evidence without exactly one authenticated mapping is invalid and cannot prove
unaffected history. At cutoff `B`, matching evidence at `B-1` is unaffected and
matching evidence at `B` is covered.

### Exact authority transition core

The signature-free `authorityTransitionCore` contains exactly:

```text
schemaVersion, collectionId, priorHead, subjectRole, subjectKeyId,
subjectFingerprint, oldCheckpointAuthoritySetId,
newCheckpointAuthoritySetId, oldRecoveryAuthoritySetId,
newRecoveryAuthoritySetId, oldTrustPolicySha256, newTrustPolicySha256,
activationBoundarySequence, replacementKeyId, replacementFingerprint,
replacementProofSha256, cutoff, transitionTransactionId,
nextRootCoreSha256
```

Only the affected-evidence profile may also contain `lastTrustedHead`,
`suspectHead`, ordered `affectedEvidenceSha256s`, and
`reconstructedChainSha256`. It contains no approval, preauthorization,
signature, receipt, final-root digest, or other later-object link.

An authority approval contains exactly `approvalSchemaVersion`,
`authorityTransitionCoreSha256`, `transitionTransactionId`, `approverRole`,
`approverAuthoritySetId`, `approverKeyId`, `approverFingerprint`, and
`decision="approve"` before detached signing. Recovery intents and checkpoint
preauthorizations are approval instances whose `approverRole` and authority set
identify the required role; they bind the identical authority-core digest and
transaction. Sign each approval over
`UTF8("olympus-authority-approval/v1") || 0x00 || JCS(approval)` and verify the
signer against that role and authority set. The final transition root copies the
exact
`nextRootCore` fields and adds the authority-core digest plus an ordered list of
approval and preauthorization object digests. Policy defines the role order;
array order is signed and therefore significant.

Require field-for-field equality across the next-root core, proof, cutoff,
authority core, policies, approvals and final root for collection, transaction,
head, subject and replacement roles/keys/fingerprints, authority-set IDs,
policy digests, activation boundary, cutoff digest, and affected-evidence
context. The old policy and sets come from `priorHead`; the new policy permits
exactly the named subject-to-replacement change; and
`activationBoundarySequence = priorHead.sequence + 1 =
nextRootCore.generationSequence`.

For active catalog-signer compromise that covers accepted generations, the
transition must use `rootType="authority-transition"` and a non-null
`forwardRecovery` that restores from the bound last-safe content tuple.
Unsafe cutoff-covered content cannot become safe because replacement keys sign
it. Missing or altered recovery intent, one checkpoint preauthorization, an
insufficient recovery quorum, old-key co-signing as a prerequisite, or recovery
authority on an ordinary root fails closed.

## Rotate Checkpoint And Recovery Authorities

Checkpoint and recovery keys are trust anchors with lifecycles, not permanent
exceptions. Version every authority set and bind its set ID, ordered members,
roles, key fingerprints, threshold, activation boundary, and cutoffs in the
trust policy. Use a recovery quorum such as two of three so one lost member does
not destroy availability and no one member has unilateral power.

Use the same acyclic authority-transition schema for planned or emergency
replacement of exactly one checkpoint or recovery member. Planned replacement
includes valid old-subject and new-subject proof. Emergency replacement excludes
the lost or compromised subject and requires the unchanged role-specific
threshold plus replacement proof. Emergency checkpoint replacement requires
the unaffected checkpoint peer and unaffected recovery quorum. Emergency
recovery-member replacement requires the unchanged recovery threshold and both
checkpoints. After either transition, the complete new checkpoint set must issue
matching receipts for the exact next head before activation.

Reject partial or mixed-set migration, removed-key reuse after the boundary,
competing transitions, multiple simultaneous subjects, insufficient unchanged
quorum, or receipts initialized from the compromised subject. If the required
unaffected threshold cannot be formed, freeze or start a separately named trust
domain; do not claim that continuity survived.

### Last-trusted-boundary recovery

If a new cutoff retroactively covers a checkpoint receipt, recovery approval,
or lifecycle statement used to establish current `H_N`, retain the subject's
signature as evidence but stop counting it. Freeze the collection and:

1. Identify the greatest fully trusted head `H_T` using only unaffected
   evidence.
2. Reconstruct exactly one monotonic authenticated chain from `H_T` to the
   suspect tip `H_N`, again without counting covered evidence or using it to
   initialize replacement checkpoints.
3. Build one `H_N+1` authority transition that extends exact `H_N`, binds
   `H_T`, `H_N`, the ordered affected-evidence digests and reconstructed-chain
   digest, and forward-recovers content from `H_T`.
4. Require the unaffected quorum, replacement proof, new policy and matching
   receipts from the complete new checkpoint set before activation.

If `H_T`, exact `H_N`, the unique chain, or the unaffected threshold cannot be
established, remain frozen or explicitly name a new trust domain. Never hide an
unauthenticated reset behind an operator override, lower a checkpoint, or allow
the affected key to bootstrap its own replacement. A crash during migration
may resume only the same byte-identical pending transaction and must roll
forward deterministically.

## Preserve And Restore The Trust Evidence

Back up payloads, manifests, canonical roots, detached signatures, lifecycle
transitions, recovery records, authority policies, transaction records,
checkpoint records, and all per-location receipts as immutable history. Keep a
verified copy of each checkpoint and the bootstrap public trust anchors in
independent administrative and failure domains. Do not place the only trusted
copy next to the mutable archive, and do not back up private signing keys merely
to make routine restore possible. Document separately whether recovery signing
keys are offline, escrowed, hardware-held, or intentionally non-recoverable.

At promotion, replication, periodic scrub, and restore, start from the
independently distributed bootstrap anchor and verify the unique policy,
lifecycle, root, transaction, signature, and receipt chain. Require the
presented active tuple to equal the exact accepted head in every current
checkpoint and matching receipt. Then verify manifest closure and payload
bytes. Fail closed when only a self-consistent payload-plus-checksum set
remains, when trust evidence is missing or self-referential, or when the chain
is stale, forked, downgraded, pending, partially migrated, or unknown.

Keep golden canonicalization and state-machine fixtures with the schema. The
repository fixture at
`coding-style/tests/fixtures/authenticated-manifest-contract.json` and its
contract test demonstrate the exact version-1 object boundaries; production
schemas should carry equivalent fixtures for every supported implementation.
They
must cover exact JCS bytes and domain-separated preimages for `nextRootCore`,
cutoff, replacement proof, authority core, ordered approvals, and final root;
then independently alter, omit, add, reorder, or introduce a later-object link
at every stage and require rejection. Also cover payload-plus-manifest
substitution; `N` to `N+1` acceptance and replay of `N`; pending and forked
successors; one-checkpoint partial advancement; forward content recovery and
the following ordinary successor; sequence-bound signer retirement; catalog-
signer loss and compromise; planned and emergency checkpoint and recovery-
member replacement; inclusive cutoff equality; last-trusted-boundary recovery;
controller restart, reboot and clock regression; loss of the primary archive;
and an unsigned upstream release.

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

Create the partial in the final entry's destination namespace and promote it
through an adapter whose atomicity and error contract has been established for
that exact filesystem and transport. For a proven local-filesystem adapter,
this is normally one same-directory atomic rename after all gates pass. Never
copy into the final pathname, rename before verification, or expose a temporary
name that consumers treat as final. After promotion, callers still receive the
final entry only through the verified acquisition path.

## Promote Across Remote Filesystems

A successful local POSIX probe does not establish promotion semantics for a
mounted remote filesystem. Likewise, a mounted-client `rename(2)` error does
not prove that the server left both names unchanged. Treat mounted-client and
server-native operations as separate promotion adapters, even when they reach
the same storage.

Before production use, document each adapter's destination namespace,
same-share or same-filesystem precondition, atomic-visibility guarantee,
collision and overwrite behavior, durability guarantee, cache and reconnect
behavior, and error classification. At minimum, distinguish definitely not
started, definitely completed, and ambiguous outcomes. Capability-test a
same-directory rename with generated non-secret bytes in a disposable area of
the exact destination namespace and through the production authentication and
transport shape. Confirm the old name is absent and the new name has the exact
bytes from fresh mounted-client and authoritative server views. Treat the
adapter as unsupported when those views conflict or an outcome remains
ambiguous; repeat the probe after material server, mount, client, or transport
changes.

Model reconciliation states explicitly:

| State | Required evidence and action |
| --- | --- |
| Absent | Neither staging nor final is present in fresh authoritative views. This is safe only before upload or after policy-owned cleanup; it is never promotion success. |
| Staged | The staging name still has the exact verified identity, length, and digest, and the final name is authoritatively absent. Preserve staging as the recovery copy. |
| Final | A fresh read of the final name has the exact expected length and digest. Only this state can become success, subject to any paired-object contract. |
| Ambiguous | Views conflict, a name has unknown bytes, both names have an unexplained relationship, or final absence cannot be proven. Preserve every verified staging object and stop mutation until reconciliation becomes authoritative. |

Use this ordered promotion protocol:

1. Close and sync staging, then verify its exact identity, length, digest, and
   required format from byte zero.
2. Inspect staging and final names through fresh client and authoritative
   server views. Require verified staging and authoritative final-name absence
   before the first promotion attempt.
3. Attempt promotion through the selected capability-tested adapter. After any
   ambiguous return or transport error, do not recopy staging, overwrite final,
   delete either name, or infer the server outcome from the local exception.
   Reconnect or invalidate caches as the adapter contract requires and inspect
   both views again.
4. If final is absent and staging is still exact, a server-native same-share
   rename may recover only when that adapter has its own proven contract.
   Immediately before invoking it, re-read staging to re-establish exact
   identity, length, and digest and recheck authoritative final-name absence.
   Require non-overwrite behavior; if the server API cannot guarantee it, stop
   for reconciliation rather than deleting or replacing final.
5. After any apparent success, open the final name through a fresh destination
   handle or connection, bypass or invalidate stale client caches, read the
   whole object, and require the pinned length and digest. A successful rename
   response or directory listing is insufficient.

For an artifact and checksum-sidecar pair, model each name independently and
publish success only after both finals pass fresh verification and the sidecar
names the expected artifact digest. If one rename succeeds and the other is
staged or ambiguous, preserve the verified remaining staging object, do not
roll back or overwrite the already promoted name blindly, and reconcile the
pair with the same rules. Remove staging residue only after the complete final
contract is proven, and only when exact operation ownership is established.

Use the remote-adapter scenarios in
[`automated-testing.md`](automated-testing.md#remote-filesystem-promotion-tests).
Keep directory-entry crash durability as a separate capability; a server-side
rename and fresh read-back do not by themselves prove the directory-sync
contract described by RYA-158.

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
| Payload plus manifest substitution | Replacing payloads and recomputing every adjacent checksum still fails the independently anchored catalog-root signature and accepted-head gates. |
| Canonical authority graph | Exact golden JCS encodings and domain-separated preimages pass; wrong transaction, head, role/key, policy/set, root, cutoff, context, approval order, omitted/extra field, or cyclic/later-object link fails before commit. |
| Accepted-head advancement | Exact `N` to `N+1` compare-and-swap yields matching two-location receipts; replay of signed `N`, an unaccepted pending successor, a same-sequence/generation fork, unknown transaction, or receipt mismatch fails. One-location advancement freezes until the byte-identical unique successor rolls forward. |
| Monotonic content recovery | Accepted `H_N+1` advances to recovery-authorized `H_N+2` that restores `H_N` content, then ordinary `H_N+3` extends the recovery root. Abandoned-head reactivation, corrected same-sequence fork, skipped successor, or checkpoint decrease fails. |
| Catalog-signer lifecycle | Planned rotation preserves sequence-authorized history but rejects later old-key issuance despite a backdated timestamp. Loss or compromise requires matching recovery-quorum intent, both checkpoint preauthorizations, quorum-plus-replacement transition signing, and the following ordinary replacement-signed root. |
| Checkpoint and recovery authority lifecycle | Planned and emergency replacement each bind one exact subject, old/new sets and policies, replacement proof, cutoff and boundary. Emergency approval excludes the subject; partial or mixed-set receipts, removed-key reuse, unavailable unchanged quorum, or multiple subjects fail. |
| Inclusive cutoff and last-trusted boundary | Evidence at `B-1` remains eligible and subject evidence at `B` is covered. A cutoff covering current-head evidence freezes, reconstructs one unaffected `H_T` to suspect `H_N` chain, and accepts only forward `H_N+1` with complete-new-set receipts; compromised bootstrap or ambiguous evidence fails. |
| Restart and trusted time | Process/controller restart, reboot, wall-clock rollback or reset cannot change sequence authorization. An enabled calendar profile rejects lost confidence, regressed floors, excessive steps, unapproved sources, and checkpoint-attestation disagreement. |
| Primary archive loss and unsigned upstream | Restore begins from independent anchors, checkpoints, receipts and backup, then proves exact head, manifest closure, bytes and format. An unsigned publisher release remains explicit while local custody authentication is required. |
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
