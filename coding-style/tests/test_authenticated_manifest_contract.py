import copy
import hashlib
import json
import re
import unittest
from pathlib import Path


FIXTURE = Path(__file__).parent / "fixtures" / "authenticated-manifest-contract.json"

HEAD_FIELDS = {
    "collectionId",
    "generationSequence",
    "generationId",
    "rootSha256",
}
ROOT_CORE_FIELDS = {
    "rootSchemaVersion",
    "rootType",
    "collectionId",
    "generationSequence",
    "generationId",
    "previousRootSha256",
    "creationTime",
    "trustPolicyVersion",
    "artifactManifestDigests",
    "schemaIndexSha256",
    "policyIndexSha256",
    "retentionTombstoneIndexSha256",
    "testEvidenceIndexSha256",
}
CUTOFF_FIELDS = {
    "cutoffSchemaVersion",
    "collectionId",
    "transitionTransactionId",
    "declaredAtPriorHead",
    "subjectRole",
    "subjectKeyId",
    "subjectFingerprint",
    "reason",
    "comparison",
    "firstAffectedSequence",
    "evidenceScope",
}
REPLACEMENT_PROOF_FIELDS = {
    "replacementProofSchemaVersion",
    "proofPurpose",
    "collectionId",
    "transitionTransactionId",
    "priorHead",
    "activationBoundarySequence",
    "subjectRole",
    "subjectKeyId",
    "subjectFingerprint",
    "replacementRole",
    "replacementKeyId",
    "replacementFingerprint",
    "oldCheckpointAuthoritySetId",
    "newCheckpointAuthoritySetId",
    "oldRecoveryAuthoritySetId",
    "newRecoveryAuthoritySetId",
    "oldTrustPolicySha256",
    "newTrustPolicySha256",
    "nextRootCoreSha256",
    "cutoffSha256",
    "lastTrustedHead",
    "suspectHead",
    "affectedEvidenceSha256s",
    "reconstructedChainSha256",
}
AUTHORITY_CORE_FIELDS = {
    "schemaVersion",
    "collectionId",
    "priorHead",
    "subjectRole",
    "subjectKeyId",
    "subjectFingerprint",
    "oldCheckpointAuthoritySetId",
    "newCheckpointAuthoritySetId",
    "oldRecoveryAuthoritySetId",
    "newRecoveryAuthoritySetId",
    "oldTrustPolicySha256",
    "newTrustPolicySha256",
    "activationBoundarySequence",
    "replacementKeyId",
    "replacementFingerprint",
    "replacementProofSha256",
    "cutoff",
    "transitionTransactionId",
    "nextRootCoreSha256",
}
APPROVAL_FIELDS = {
    "approvalSchemaVersion",
    "authorityTransitionCoreSha256",
    "transitionTransactionId",
    "approverRole",
    "approverAuthoritySetId",
    "approverKeyId",
    "approverFingerprint",
    "decision",
}
FINAL_ROOT_FIELDS = ROOT_CORE_FIELDS | {
    "authorityTransitionCoreSha256",
    "authorityApprovalSha256s",
}


def jcs_bytes(value):
    """RFC 8785-compatible encoding for this integer-free ASCII fixture."""
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def sha256(value):
    return hashlib.sha256(jcs_bytes(value)).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def require_exact_fields(value, fields, name):
    require(isinstance(value, dict), f"{name} must be an object")
    require(set(value) == fields, f"{name} has missing or extra fields")


def parse_sequence(value):
    require(isinstance(value, str), "sequence must be a string")
    require(re.fullmatch(r"0|[1-9][0-9]*", value) is not None, "bad sequence")
    return int(value)


def cutoff_covers(cutoff, effective_sequence):
    require(cutoff["comparison"] == "effective-sequence-gte", "bad comparison")
    return parse_sequence(effective_sequence) >= parse_sequence(
        cutoff["firstAffectedSequence"]
    )


def validate_head(head, collection):
    require_exact_fields(head, HEAD_FIELDS, "head")
    require(head["collectionId"] == collection, "wrong head collection")
    parse_sequence(head["generationSequence"])


def validate_bundle(bundle, check_golden=True):
    require_exact_fields(bundle, {"objects", "expectedSha256"}, "bundle")
    objects = bundle["objects"]
    require_exact_fields(
        objects,
        {
            "nextRootCore",
            "cutoff",
            "replacementProof",
            "authorityTransitionCore",
            "authorityApprovals",
            "finalRoot",
        },
        "objects",
    )

    next_root = objects["nextRootCore"]
    cutoff = objects["cutoff"]
    proof = objects["replacementProof"]
    core = objects["authorityTransitionCore"]
    approvals = objects["authorityApprovals"]
    final_root = objects["finalRoot"]

    require_exact_fields(next_root, ROOT_CORE_FIELDS, "nextRootCore")
    require_exact_fields(cutoff, CUTOFF_FIELDS, "cutoff")
    require_exact_fields(proof, REPLACEMENT_PROOF_FIELDS, "replacementProof")
    require_exact_fields(core, AUTHORITY_CORE_FIELDS, "authorityTransitionCore")
    require_exact_fields(final_root, FINAL_ROOT_FIELDS, "finalRoot")
    require(next_root["rootType"] == "authority-transition", "wrong root type")

    collection = next_root["collectionId"]
    transaction = core["transitionTransactionId"]
    prior_head = core["priorHead"]
    validate_head(prior_head, collection)
    validate_head(cutoff["declaredAtPriorHead"], collection)
    validate_head(proof["priorHead"], collection)

    next_sequence = parse_sequence(next_root["generationSequence"])
    prior_sequence = parse_sequence(prior_head["generationSequence"])
    require(next_sequence == prior_sequence + 1, "not an exact successor")
    require(
        next_root["previousRootSha256"] == prior_head["rootSha256"],
        "wrong predecessor digest",
    )
    require(
        core["activationBoundarySequence"] == next_root["generationSequence"],
        "core activation mismatch",
    )
    require(
        proof["activationBoundarySequence"] == next_root["generationSequence"],
        "proof activation mismatch",
    )

    require(cutoff["cutoffSchemaVersion"] == "olympus-authority-evidence-cutoff/1", "bad cutoff schema")
    require(cutoff["reason"] in {"compromise", "revocation"}, "bad cutoff reason")
    require(cutoff["comparison"] == "effective-sequence-gte", "bad cutoff comparison")
    require(
        cutoff["evidenceScope"]
        == "all-authority-evidence-signed-by-subject",
        "bad cutoff scope",
    )
    parse_sequence(cutoff["firstAffectedSequence"])

    require(
        proof["replacementProofSchemaVersion"]
        == "olympus-authority-replacement-proof/1",
        "bad replacement proof schema",
    )
    require(proof["proofPurpose"] == "replacement-key-possession", "bad purpose")
    require(proof["replacementRole"] == proof["subjectRole"], "cross-role proof")
    require(
        proof["lastTrustedHead"] is None
        and proof["suspectHead"] is None
        and proof["affectedEvidenceSha256s"] == []
        and proof["reconstructedChainSha256"] is None,
        "unexpected affected-evidence profile",
    )

    for value in (cutoff, proof, core):
        require(value["collectionId"] == collection, "collection mismatch")
        require(value["transitionTransactionId"] == transaction, "transaction mismatch")
    require(cutoff["declaredAtPriorHead"] == prior_head, "cutoff head mismatch")
    require(proof["priorHead"] == prior_head, "proof head mismatch")

    shared = (
        "subjectRole",
        "subjectKeyId",
        "subjectFingerprint",
        "oldCheckpointAuthoritySetId",
        "newCheckpointAuthoritySetId",
        "oldRecoveryAuthoritySetId",
        "newRecoveryAuthoritySetId",
        "oldTrustPolicySha256",
        "newTrustPolicySha256",
        "replacementKeyId",
        "replacementFingerprint",
        "activationBoundarySequence",
        "nextRootCoreSha256",
    )
    for field in shared:
        require(proof[field] == core[field], f"{field} mismatch")
    for field in ("subjectRole", "subjectKeyId", "subjectFingerprint"):
        require(cutoff[field] == core[field], f"cutoff {field} mismatch")

    require(core["cutoff"] == cutoff, "inline cutoff mismatch")
    require(proof["nextRootCoreSha256"] == sha256(next_root), "wrong next-root link")
    require(proof["cutoffSha256"] == sha256(cutoff), "wrong cutoff link")
    require(core["replacementProofSha256"] == sha256(proof), "wrong proof link")
    require(core["nextRootCoreSha256"] == sha256(next_root), "wrong core root link")

    require(isinstance(approvals, list) and len(approvals) == 4, "wrong approvals")
    expected_order = [
        ("recovery-intent", "recovery-a"),
        ("recovery-intent", "recovery-b"),
        ("checkpoint-preauthorization", "checkpoint-stable"),
        ("checkpoint-preauthorization", "checkpoint-new"),
    ]
    core_digest = sha256(core)
    for approval, expected_identity in zip(approvals, expected_order):
        require_exact_fields(approval, APPROVAL_FIELDS, "authorityApproval")
        require(approval["decision"] == "approve", "non-approval")
        require(approval["transitionTransactionId"] == transaction, "approval transaction mismatch")
        require(approval["authorityTransitionCoreSha256"] == core_digest, "approval core mismatch")
        require(
            (approval["approverRole"], approval["approverKeyId"])
            == expected_identity,
            "approval order or identity mismatch",
        )

    for field in ROOT_CORE_FIELDS:
        require(final_root[field] == next_root[field], f"final root changed {field}")
    require(final_root["authorityTransitionCoreSha256"] == core_digest, "final core mismatch")
    require(
        final_root["authorityApprovalSha256s"] == [sha256(value) for value in approvals],
        "final approval list mismatch",
    )

    if check_golden:
        expected = bundle["expectedSha256"]
        require(
            set(expected)
            == {
                "nextRootCore",
                "cutoff",
                "replacementProof",
                "authorityTransitionCore",
                "authorityApprovals",
                "authorityApprovalPreimages",
                "finalRoot",
                "replacementProofPreimage",
                "finalRootPreimage",
            },
            "wrong expected digest fields",
        )
        for name in (
            "nextRootCore",
            "cutoff",
            "replacementProof",
            "authorityTransitionCore",
            "finalRoot",
        ):
            require(expected[name] == sha256(objects[name]), f"{name} golden drift")
        require(
            expected["authorityApprovals"] == [sha256(value) for value in approvals],
            "approval golden drift",
        )
        approval_preimages = [
            hashlib.sha256(
                b"olympus-authority-approval/v1\0" + jcs_bytes(value)
            ).hexdigest()
            for value in approvals
        ]
        require(
            expected["authorityApprovalPreimages"] == approval_preimages,
            "approval preimage drift",
        )
        proof_preimage = b"olympus-authority-replacement-proof/v1\0" + jcs_bytes(proof)
        root_preimage = b"olympus-artifact-catalog-root/v1\0" + jcs_bytes(final_root)
        require(
            expected["replacementProofPreimage"]
            == hashlib.sha256(proof_preimage).hexdigest(),
            "replacement preimage drift",
        )
        require(
            expected["finalRootPreimage"] == hashlib.sha256(root_preimage).hexdigest(),
            "root preimage drift",
        )


def head(sequence, generation, digest):
    return {
        "collectionId": "fixture-archive",
        "generationSequence": str(sequence),
        "generationId": generation,
        "rootSha256": digest,
    }


def acceptance_gate(presented, checkpoints, receipts):
    return (
        len(checkpoints) == 2
        and len(receipts) == 2
        and all(value == presented for value in checkpoints)
        and all(value["newHead"] == presented for value in receipts)
        and receipts[0]["transactionId"] == receipts[1]["transactionId"]
    )


def may_resume(transaction_status, persisted_core_sha256, offered_core_sha256):
    return transaction_status == "pending" and persisted_core_sha256 == offered_core_sha256


class AuthenticatedManifestContractTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def assert_invalid(self, mutate):
        candidate = copy.deepcopy(self.fixture)
        mutate(candidate["objects"])
        with self.assertRaises(ValueError):
            validate_bundle(candidate, check_golden=False)

    def test_golden_acyclic_contract(self):
        validate_bundle(self.fixture)

    def test_altered_omitted_extra_and_later_links_fail(self):
        mutations = [
            lambda o: o["nextRootCore"].__setitem__("extra", True),
            lambda o: o["nextRootCore"].pop("schemaIndexSha256"),
            lambda o: o["nextRootCore"].__setitem__("authorityTransitionCoreSha256", "0" * 64),
            lambda o: o["replacementProof"].__setitem__("authorityTransitionCoreSha256", "0" * 64),
            lambda o: o["authorityTransitionCore"].__setitem__("authorityApprovalSha256s", []),
            lambda o: o["finalRoot"].pop("authorityApprovalSha256s"),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.assert_invalid(mutation)

    def test_cross_binding_and_replay_mutations_fail(self):
        mutations = [
            lambda o: o["replacementProof"].__setitem__("transitionTransactionId", "wrong"),
            lambda o: o["replacementProof"]["priorHead"].__setitem__("generationId", "wrong"),
            lambda o: o["replacementProof"].__setitem__("subjectRole", "catalog"),
            lambda o: o["replacementProof"].__setitem__("replacementKeyId", "wrong"),
            lambda o: o["replacementProof"].__setitem__("newTrustPolicySha256", "0" * 64),
            lambda o: o["replacementProof"].__setitem__("newCheckpointAuthoritySetId", "wrong"),
            lambda o: o["replacementProof"].__setitem__("nextRootCoreSha256", "0" * 64),
            lambda o: o["replacementProof"].__setitem__("cutoffSha256", "0" * 64),
            lambda o: o["replacementProof"].__setitem__("lastTrustedHead", head(8, "g8", "8" * 64)),
            lambda o: o["authorityApprovals"][0].__setitem__("authorityTransitionCoreSha256", "0" * 64),
            lambda o: o["authorityApprovals"].reverse(),
            lambda o: o["finalRoot"]["authorityApprovalSha256s"].pop(),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.assert_invalid(mutation)

        core = self.fixture["expectedSha256"]["authorityTransitionCore"]
        self.assertTrue(may_resume("pending", core, core))
        self.assertFalse(may_resume("pending", core, "0" * 64))
        self.assertFalse(may_resume("accepted", core, core))
        self.assertFalse(may_resume("aborted", core, core))

    def test_inclusive_arbitrary_precision_cutoff(self):
        cutoff = copy.deepcopy(self.fixture["objects"]["cutoff"])
        cutoff["firstAffectedSequence"] = "90071992547409931234567890"
        self.assertFalse(cutoff_covers(cutoff, "90071992547409931234567889"))
        self.assertTrue(cutoff_covers(cutoff, "90071992547409931234567890"))
        self.assertTrue(cutoff_covers(cutoff, "90071992547409931234567891"))
        for invalid in ("", "00", "01", "+1", "-1", "1.0"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                parse_sequence(invalid)

    def test_exact_two_checkpoint_acceptance_rejects_replay_pending_and_forks(self):
        h9 = head(9, "generation-9", "9" * 64)
        h10 = head(10, "generation-10", "a" * 64)
        h10_fork = head(10, "generation-10-fork", "b" * 64)
        h11_pending = head(11, "generation-11", "c" * 64)
        receipts = [
            {"newHead": h10, "transactionId": "transaction-10"},
            {"newHead": h10, "transactionId": "transaction-10"},
        ]
        self.assertTrue(acceptance_gate(h10, [h10, h10], receipts))
        self.assertFalse(acceptance_gate(h9, [h10, h10], receipts))
        self.assertFalse(acceptance_gate(h11_pending, [h10, h10], receipts))
        self.assertFalse(acceptance_gate(h10_fork, [h10, h10], receipts))
        self.assertFalse(acceptance_gate(h10, [h10, h9], receipts))
        mismatched = copy.deepcopy(receipts)
        mismatched[1]["transactionId"] = "unknown"
        self.assertFalse(acceptance_gate(h10, [h10, h10], mismatched))

    def test_forward_recovery_extends_history_then_allows_ordinary_successor(self):
        h9 = head(9, "generation-9", "9" * 64)
        h10 = head(10, "generation-10", "a" * 64)
        h11 = head(11, "generation-11-recovery", "b" * 64)
        h12 = head(12, "generation-12", "c" * 64)
        recovery = {
            "previousHead": h10,
            "newHead": h11,
            "restoreContentFrom": h9,
        }
        ordinary = {"previousHead": h11, "newHead": h12}
        self.assertEqual(parse_sequence(h11["generationSequence"]), parse_sequence(h10["generationSequence"]) + 1)
        self.assertEqual(recovery["restoreContentFrom"], h9)
        self.assertEqual(ordinary["previousHead"], recovery["newHead"])
        self.assertGreater(parse_sequence(h12["generationSequence"]), parse_sequence(h11["generationSequence"]))
        self.assertNotEqual(recovery["newHead"], recovery["restoreContentFrom"])


if __name__ == "__main__":
    unittest.main()
