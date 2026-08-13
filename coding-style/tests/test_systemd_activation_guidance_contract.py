import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
REFERENCE = ROOT / "references" / "systemd-service-activation.md"
AUTOMATED = ROOT / "references" / "automated-testing.md"

REQUIRED_ACTIVATION_CONTRACT = {
    "exact unit allowlist": "Finish this authority check before `enable`, `restart`, `stop`, `disable`, or",
    "cleanup state read": "Regardless of cleanup-command results, read authoritative manager state for",
    "original cause retention": "retaining the original activation stage and code as separate fields",
    "disable cleanup": "disable when",
    "stop cleanup": "stop it",
    "scoped reset cleanup": "reset only its stale",
}


def validate_activation_guidance(reference):
    missing = [
        name
        for name, anchor in REQUIRED_ACTIVATION_CONTRACT.items()
        if anchor not in reference
    ]
    if missing:
        raise ValueError(f"missing activation contract: {', '.join(missing)}")


class SystemdActivationGuidanceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        cls.reference = REFERENCE.read_text(encoding="utf-8")
        cls.automated = AUTOMATED.read_text(encoding="utf-8")

    def test_skill_routes_activation_to_focused_guidance(self):
        self.assertIn("systemd activation transactions", self.skill)
        self.assertIn("references/systemd-service-activation.md", self.skill)
        self.assertIn("#systemd-service-activation-reconciliation-tests", self.reference)
        self.assertIn("### Systemd Service Activation-Reconciliation Tests", self.automated)
        validate_activation_guidance(self.reference)

    def test_required_boundary_removals_fail_contract_validation(self):
        for name, anchor in REQUIRED_ACTIVATION_CONTRACT.items():
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_activation_guidance(self.reference.replace(anchor, "", 1))

    def test_scenario_matrix_covers_failure_and_redaction_boundaries(self):
        required_scenarios = [
            "Unrelated or shape-valid foreign unit",
            "Each cleanup command fails separately",
            "Cleanup commands return success but final state is active",
            "Stale owned start limit",
            "Native-output sentinels",
            "unit, wants-link, process, credential file, or test-prefixed residue remains",
        ]

        for scenario in required_scenarios:
            with self.subTest(scenario=scenario):
                self.assertIn(scenario, self.automated)


if __name__ == "__main__":
    unittest.main()
