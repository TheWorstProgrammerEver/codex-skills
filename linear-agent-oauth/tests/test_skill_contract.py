from __future__ import annotations

import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILL = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
OPERATIONS = (SKILL_ROOT / "references" / "validation-and-cutover.md").read_text(
    encoding="utf-8"
)


class LinearOAuthSkillContractTest(unittest.TestCase):
    def test_shared_runbook_remains_the_architecture_authority(self) -> None:
        self.assertIn("Codex-Shared-Durable-Notes/blob/main/runbooks/linear-agent-identity.md", SKILL)
        self.assertIn("Treat the runbook as the authority", SKILL)

    def test_graphql_and_mcp_attribution_paths_are_gated(self) -> None:
        compact_skill = " ".join(SKILL.split())
        self.assertIn("validate-attribution", SKILL)
        self.assertIn("same app bearer token", compact_skill)
        self.assertIn("MCP Attribution Path", OPERATIONS)
        self.assertIn("user-authenticated connector", SKILL)

    def test_replacement_revocation_cutover_and_rollback_are_explicit(self) -> None:
        self.assertIn("exactly one new token is minted", OPERATIONS)
        self.assertIn("newly minted disposable token", OPERATIONS)
        self.assertIn("## Staged Cutover", OPERATIONS)
        self.assertIn("## Rollback", OPERATIONS)
        self.assertIn("API-key", OPERATIONS)

    def test_reusable_content_contains_no_private_host_identity(self) -> None:
        combined = SKILL + OPERATIONS
        private_home_paths = ("/" + "home" + "/", "/" + "Users" + "/")
        for private_identity in (*private_home_paths, "private-host.internal"):
            self.assertNotIn(private_identity, combined)


if __name__ == "__main__":
    unittest.main()
