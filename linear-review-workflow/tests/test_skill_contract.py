from __future__ import annotations

import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILL = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")


class LinearReviewWorkflowContractTest(unittest.TestCase):
    def test_review_reply_and_resolution_are_separate_boundaries(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("GraphQL `resolveReviewThread` mutation", SKILL)
        self.assertIn("separate authorization boundaries", SKILL)
        self.assertIn("exact minted token permission set", compact_skill)
        self.assertIn("does not prove authority", SKILL)
        self.assertIn("`pull_requests:write`", SKILL)
        self.assertIn("`issues:write`", SKILL)
        self.assertIn("`contents:write`", SKILL)

    def test_resolution_success_requires_authoritative_state_read(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("Treat `viewerCanResolve` as advisory", SKILL)
        self.assertIn("After any `resolveReviewThread` attempt", SKILL)
        self.assertIn("verify `isResolved: true`", SKILL)
        self.assertIn("before claiming resolution", SKILL)
        self.assertIn("mutation reports success but the authoritative re-read", compact_skill)

    def test_forbidden_integration_path_fails_closed_without_identity_switch(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("integration `FORBIDDEN`", SKILL)
        self.assertIn("`Resource not accessible by integration`", SKILL)
        self.assertIn("leave the thread unresolved", SKILL)
        self.assertIn("without retrying through a different GitHub identity", SKILL)
        self.assertIn("authorized collaborator resolves the specific threads manually", compact_skill)

    def test_reusable_content_contains_no_private_host_identity(self) -> None:
        private_home_paths = ("/" + "home" + "/", "/" + "Users" + "/")
        for private_identity in (*private_home_paths, "private-host.internal"):
            self.assertNotIn(private_identity, SKILL)


if __name__ == "__main__":
    unittest.main()
