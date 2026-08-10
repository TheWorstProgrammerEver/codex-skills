import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "host-diagnostic-evidence.json"


def classify_target_discard(scenario):
    mount = max(
        (
            item
            for item in scenario["mounts"]
            if scenario["target"] == item["target"]
            or scenario["target"].startswith(item["target"].rstrip("/") + "/")
        ),
        key=lambda item: len(item["target"]),
        default=None,
    )
    if mount is None:
        return "unknown"

    devices = {device["id"]: device for device in scenario["devices"]}
    current = devices.get(mount["source"])
    stack = []
    seen = set()
    while current is not None and current["id"] not in seen:
        seen.add(current["id"])
        stack.append(current)
        parent = current.get("parent")
        current = devices.get(parent) if parent else None

    if not stack or any("discardMaxBytes" not in device for device in stack):
        return "unknown"
    return (
        "supported"
        if all(device["discardMaxBytes"] > 0 for device in stack)
        else "not-advertised"
    )


def classify_host_wide_discard_mutation(scenario):
    return (
        "supported"
        if any(device.get("discardMaxBytes", 0) > 0 for device in scenario["devices"])
        else "not-advertised"
    )


def has_disk_backed_swap(scenario):
    families = {
        device["name"]: device["family"]
        for device in scenario["normalizedDevices"]
    }
    return any(
        item["type"] == "file"
        or (
            item["type"] == "partition"
            and families.get(item["name"]) not in {"zram", "ram"}
        )
        for item in scenario["swapon"]
    )


def partition_equals_disk_mutation(scenario):
    return any(item["type"] in {"file", "partition"} for item in scenario["swapon"])


def effective_journald_storage(scenario):
    value = "auto"
    for source in scenario["sources"]:
        if source["section"] == "Journal" and source["key"] == "Storage":
            value = source["value"]
    if value == "auto":
        return "persistent" if scenario["persistentDirectoryPresent"] else "volatile"
    return value


def base_file_only_mutation(scenario):
    base = next(source for source in scenario["sources"] if source["kind"] == "main")
    return base["value"]


class HostDiagnosticEvidenceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_skill_routes_host_diagnostics_to_focused_reference(self):
        skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        reference = (ROOT / "references" / "host-diagnostic-evidence.md").read_text(
            encoding="utf-8"
        )
        automated = (ROOT / "references" / "automated-testing.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("host-diagnostic evidence", skill)
        self.assertIn("references/host-diagnostic-evidence.md", skill)
        self.assertIn("## Scope Block Capabilities To The Target Stack", reference)
        self.assertIn("## Normalize Virtual Device Identity Explicitly", reference)
        self.assertIn("## Resolve Effective Systemd Configuration", reference)
        self.assertIn("## Host-Diagnostic Evidence Tests", automated)

    def test_target_scoped_discard_kills_host_wide_aggregation_mutation(self):
        scenario = self.fixture["discard"]
        self.assertEqual(classify_target_discard(scenario), scenario["expected"])
        with self.assertRaises(AssertionError):
            self.assertEqual(
                classify_host_wide_discard_mutation(scenario),
                scenario["expected"],
            )

    def test_zram_normalization_kills_partition_equals_disk_mutation(self):
        scenario = self.fixture["swap"]
        self.assertEqual(has_disk_backed_swap(scenario), scenario["expectedDiskBacked"])
        with self.assertRaises(AssertionError):
            self.assertEqual(
                partition_equals_disk_mutation(scenario),
                scenario["expectedDiskBacked"],
            )

    def test_effective_merge_kills_base_file_only_mutation(self):
        scenario = self.fixture["journald"]
        self.assertEqual(effective_journald_storage(scenario), scenario["expected"])
        with self.assertRaises(AssertionError):
            self.assertEqual(base_file_only_mutation(scenario), scenario["expected"])


if __name__ == "__main__":
    unittest.main()
