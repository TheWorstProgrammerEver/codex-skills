from __future__ import annotations

import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILL = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")


class GitHubAddressCommentsSkillContractTest(unittest.TestCase):
    def test_thread_state_and_viewer_capability_guidance_are_explicit(self) -> None:
        self.assertIn("Use `isResolved` as the authoritative thread state", SKILL)
        self.assertIn("Treat `viewerCanResolve` as advisory", SKILL)
        self.assertIn("the field can be false", SKILL)
        self.assertIn("`resolveReviewThread` mutation succeeds", SKILL)

    def test_thread_resolution_authorization_boundaries_are_explicit(self) -> None:
        compact_skill = " ".join(SKILL.split())

        self.assertIn("separate authorization boundaries", SKILL)
        self.assertIn("exact minted permission set", compact_skill)
        self.assertIn("`pull_requests:write`", SKILL)
        self.assertIn("`issues:write`", SKILL)
        self.assertIn("`contents:write`", SKILL)
        self.assertIn("re-read each affected thread's `isResolved` value", SKILL)

    def test_forbidden_path_preserves_identity_separation(self) -> None:
        self.assertIn("integration `FORBIDDEN` error", SKILL)
        self.assertIn("`Resource not accessible by integration`", SKILL)
        self.assertIn("leave the thread unresolved", SKILL)
        self.assertIn("authorized collaborator resolves those specific threads manually", SKILL)
        self.assertIn("Do not switch to another GitHub identity", SKILL)

    def test_reusable_content_contains_no_private_host_identity(self) -> None:
        private_home_paths = ("/" + "home" + "/", "/" + "Users" + "/")
        for private_identity in (*private_home_paths, "private-host.internal"):
            self.assertNotIn(private_identity, SKILL)


if __name__ == "__main__":
    unittest.main()
