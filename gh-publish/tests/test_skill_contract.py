from __future__ import annotations

import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILL = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
SCENARIOS = (SKILL_ROOT / "references" / "publication-scenarios.md").read_text(
    encoding="utf-8"
)


class GitHubPublishContractTest(unittest.TestCase):
    def test_trigger_metadata_covers_the_publication_workflow(self) -> None:
        frontmatter = SKILL.split("---", 2)[1]
        for trigger in ("commit", "push", "pull request", "Ready for review"):
            self.assertIn(trigger, frontmatter)

    def test_ready_is_default_and_draft_is_explicit(self) -> None:
        self.assertIn("Create a completed pull request **Ready for review**", SKILL)
        self.assertIn("Pass `draft: false`", SKILL)
        self.assertIn("Use draft only when the user explicitly requests it", SKILL)
        self.assertIn("Completed work, no draft request", SCENARIOS)
        self.assertIn("Explicit draft request", SCENARIOS)

    def test_connector_success_and_wrapper_fallback_are_explicit(self) -> None:
        self.assertIn("Prefer the connected GitHub capability", SKILL)
        self.assertIn("Otherwise use the discovered scoped wrapper", SKILL)
        self.assertIn("Connected GitHub creation succeeds", SCENARIOS)
        self.assertIn("Connector absent or unsuitable", SCENARIOS)

    def test_scoped_helper_discovery_rejects_personal_login_fallback(self) -> None:
        self.assertIn("`gh auth login`", SKILL)
        self.assertIn("Approved helper cannot be found", SCENARIOS)
        private_home_paths = ("/" + "home" + "/", "/" + "Users" + "/")
        for private_identity in (*private_home_paths, "private-host.internal"):
            self.assertNotIn(private_identity, SKILL + SCENARIOS)

    def test_post_merge_branch_cleanup_points_to_authoritative_ref_read(self) -> None:
        self.assertIn("Post-merge source branch cleanup races repository auto-delete", SCENARIOS)
        self.assertIn("Use `$linear-review-workflow` as the canonical", SCENARIOS)
        self.assertIn("exact `head.repo.full_name` and `head.ref`", SCENARIOS)
        self.assertIn("must not derive branch cleanup targets", SCENARIOS)
        self.assertIn("HTTP 422 `Reference does not exist`", SCENARIOS)
        self.assertIn("follow-up exact ref read returns HTTP 404", SCENARIOS)
        self.assertIn("fork branches", SCENARIOS)
        self.assertIn("stacked branches", SCENARIOS)
        self.assertIn("release branches", SCENARIOS)


if __name__ == "__main__":
    unittest.main()
