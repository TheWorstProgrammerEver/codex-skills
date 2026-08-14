from __future__ import annotations

import unittest
from dataclasses import dataclass
from enum import Enum
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILL = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")


class CleanupOutcome(Enum):
    COMPLETE = "complete"
    INCOMPLETE = "incomplete"
    PRESERVED = "preserved"


@dataclass(frozen=True)
class CleanupPlan:
    head_repository: str
    head_ref: str
    base_ref: str
    authorized_repository: str
    preserve_ref: bool = False


@dataclass(frozen=True)
class RefResponse:
    status: int
    message: str = ""


def reconcile_post_merge_branch_cleanup(
    plan: CleanupPlan,
    reads: list[RefResponse],
    delete: RefResponse | None,
) -> CleanupOutcome:
    if (
        plan.head_repository != plan.authorized_repository
        or plan.head_ref == plan.base_ref
        or plan.preserve_ref
    ):
        return CleanupOutcome.PRESERVED

    initial_read, *follow_up_reads = reads
    if initial_read.status == 404:
        return CleanupOutcome.COMPLETE
    if initial_read.status != 200 or delete is None:
        return CleanupOutcome.INCOMPLETE

    if delete.status == 204:
        return cleanup_outcome_from_follow_up(follow_up_reads)
    if delete.status == 422 and "Reference does not exist" in delete.message:
        return cleanup_outcome_from_follow_up(follow_up_reads)

    return CleanupOutcome.INCOMPLETE


def cleanup_outcome_from_follow_up(reads: list[RefResponse]) -> CleanupOutcome:
    if not reads:
        return CleanupOutcome.INCOMPLETE
    return CleanupOutcome.COMPLETE if reads[0].status == 404 else CleanupOutcome.INCOMPLETE


class PostMergeBranchCleanupContractTest(unittest.TestCase):
    def test_guidance_is_exact_and_authoritative(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("Re-read the merged PR", SKILL)
        self.assertIn("`head.repo.full_name`", SKILL)
        self.assertIn("`head.ref`", SKILL)
        self.assertIn("never derive the deletion target from memory", SKILL)
        self.assertIn("a branch prefix", SKILL)
        self.assertIn("the local checkout", SKILL)
        self.assertIn("fork branch", compact_skill)
        self.assertIn("stacked branch", compact_skill)
        self.assertIn("release branch", compact_skill)
        self.assertIn("HTTP 422", SKILL)
        self.assertIn("HTTP 404", SKILL)

    def test_state_matrix(self) -> None:
        plan = CleanupPlan(
            head_repository="owner/repo",
            head_ref="feature",
            base_ref="main",
            authorized_repository="owner/repo",
        )

        cases = (
            (
                "retained ref then successful delete",
                [RefResponse(200), RefResponse(404)],
                RefResponse(204),
                CleanupOutcome.COMPLETE,
            ),
            (
                "ref already absent",
                [RefResponse(404)],
                None,
                CleanupOutcome.COMPLETE,
            ),
            (
                "ref disappears between read and delete",
                [RefResponse(200), RefResponse(404)],
                RefResponse(422, "Reference does not exist"),
                CleanupOutcome.COMPLETE,
            ),
            (
                "unexpected permission failure",
                [RefResponse(200)],
                RefResponse(403, "Resource not accessible by integration"),
                CleanupOutcome.INCOMPLETE,
            ),
            (
                "still present after deletion",
                [RefResponse(200), RefResponse(200)],
                RefResponse(204),
                CleanupOutcome.INCOMPLETE,
            ),
        )

        for name, reads, delete, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(
                    expected,
                    reconcile_post_merge_branch_cleanup(plan, reads, delete),
                )

    def test_preserves_refs_outside_authority(self) -> None:
        preserved_plans = (
            CleanupPlan(
                head_repository="contributor/repo",
                head_ref="feature",
                base_ref="main",
                authorized_repository="owner/repo",
            ),
            CleanupPlan(
                head_repository="owner/repo",
                head_ref="main",
                base_ref="main",
                authorized_repository="owner/repo",
            ),
            CleanupPlan(
                head_repository="owner/repo",
                head_ref="release/2026-08",
                base_ref="main",
                authorized_repository="owner/repo",
                preserve_ref=True,
            ),
        )

        for plan in preserved_plans:
            with self.subTest(plan=plan):
                self.assertEqual(
                    CleanupOutcome.PRESERVED,
                    reconcile_post_merge_branch_cleanup(
                        plan,
                        [RefResponse(200), RefResponse(404)],
                        RefResponse(204),
                    ),
                )


if __name__ == "__main__":
    unittest.main()
