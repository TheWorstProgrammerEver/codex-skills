from __future__ import annotations

import json
import os
import stat
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_ROOT / "scripts" / "fetch_comments.py"
SENSITIVE_MARKER = "credential-marker-must-not-leak"

FAKE_CLI = """\
#!/usr/bin/env python3
import json
import os
import sys

args = sys.argv[1:]
with open(os.environ["FAKE_GH_LOG"], "a", encoding="utf-8") as log:
    log.write(json.dumps(args) + "\\n")

if os.environ.get("FAKE_GH_FAIL") == "1":
    print(os.environ["FAKE_SHORT_LIVED_CREDENTIAL"], file=sys.stderr)
    raise SystemExit(1)

if args == ["auth", "status"]:
    raise SystemExit(0)

if args == ["pr", "view", "--json", "number,url"]:
    print(json.dumps({
        "number": 20,
        "url": "https://github.com/example/project/pull/20"
    }))
    raise SystemExit(0)

if args[:2] != ["api", "graphql"]:
    raise SystemExit(2)

query = sys.stdin.read()
required = [
    "isResolved",
    "viewerCanResolve",
    "isOutdated",
    "path",
    "line",
    "author { login }",
    "url",
]
if not all(field in query for field in required):
    raise SystemExit(3)

reviews_second_page = "reviewsCursor=reviews-cursor-1" in args
threads_second_page = "threadsCursor=threads-cursor-1" in args
reviews_page_info = {
    "hasNextPage": not reviews_second_page,
    "endCursor": None if reviews_second_page else "reviews-cursor-1"
}
threads_page_info = {
    "hasNextPage": not threads_second_page,
    "endCursor": None if threads_second_page else "threads-cursor-1"
}
payload = {
    "data": {
        "repository": {
            "pullRequest": {
                "number": 20,
                "url": "https://github.com/example/project/pull/20",
                "title": "Example",
                "state": "OPEN",
                "comments": {
                    "pageInfo": {"hasNextPage": False, "endCursor": None},
                    "nodes": [{
                        "id": "comment-1",
                        "url": "https://github.com/example/project/pull/20#issuecomment-1",
                        "author": {"login": "reviewer"}
                    }]
                },
                "reviews": {
                    "pageInfo": reviews_page_info,
                    "nodes": [{
                        "id": "review-" + ("2" if reviews_second_page else "1"),
                        "url": "https://github.com/example/project/pull/20#pullrequestreview-" + ("2" if reviews_second_page else "1"),
                        "author": {"login": "reviewer"}
                    }]
                },
                "reviewThreads": {
                    "pageInfo": threads_page_info,
                    "nodes": [{
                        "id": "thread-" + ("2" if threads_second_page else "1"),
                        "isResolved": threads_second_page,
                        "viewerCanResolve": False,
                        "isOutdated": not threads_second_page,
                        "path": "src/example.py",
                        "line": 12,
                        "comments": {
                            "nodes": [{
                                "id": "inline-" + ("2" if threads_second_page else "1"),
                                "url": "https://github.com/example/project/pull/20#discussion_r" + ("2" if threads_second_page else "1"),
                                "author": {"login": "reviewer"}
                            }]
                        }
                    }]
                }
            }
        }
    }
}
print(json.dumps(payload))
"""


class FetchCommentsIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.fake_cli = self.root / "gh"
        self.fake_cli.write_text(textwrap.dedent(FAKE_CLI), encoding="utf-8")
        self.fake_cli.chmod(self.fake_cli.stat().st_mode | stat.S_IXUSR)
        self.log = self.root / "calls.jsonl"
        self.environment = {
            **os.environ,
            "FAKE_GH_LOG": str(self.log),
            "FAKE_SHORT_LIVED_CREDENTIAL": SENSITIVE_MARKER,
        }
        self.environment.pop("GH_CLI", None)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def run_reader(self, *arguments: str) -> tuple[dict[str, object], str]:
        process = subprocess.run(
            [sys.executable, str(SCRIPT), "--gh-cli", str(self.fake_cli), *arguments],
            capture_output=True,
            text=True,
            env=self.environment,
            check=True,
        )
        combined_output = process.stdout + process.stderr
        self.assertNotIn(SENSITIVE_MARKER, combined_output)
        return json.loads(process.stdout), combined_output

    def calls(self) -> list[list[str]]:
        return [
            json.loads(line)
            for line in self.log.read_text(encoding="utf-8").splitlines()
        ]

    def test_default_bare_gh_uses_path_and_discovers_pr(self) -> None:
        environment = {
            **self.environment,
            "PATH": f"{self.root}{os.pathsep}{self.environment['PATH']}",
        }
        process = subprocess.run(
            [sys.executable, str(SCRIPT)],
            capture_output=True,
            text=True,
            env=environment,
            check=True,
        )

        self.assertNotIn(SENSITIVE_MARKER, process.stdout + process.stderr)
        self.assertEqual(20, json.loads(process.stdout)["pull_request"]["number"])
        self.assertIn(["pr", "view", "--json", "number,url"], self.calls())

    def assert_preserved_thread_fields(self, result: dict[str, object]) -> None:
        threads = result["review_threads"]
        self.assertEqual(2, len(threads))
        self.assertEqual(1, len(result["conversation_comments"]))
        self.assertEqual(2, len(result["reviews"]))
        self.assertEqual(
            {
                "isResolved": False,
                "viewerCanResolve": False,
                "isOutdated": True,
                "path": "src/example.py",
                "line": 12,
            },
            {
                key: threads[0][key]
                for key in (
                    "isResolved",
                    "viewerCanResolve",
                    "isOutdated",
                    "path",
                    "line",
                )
            },
        )
        self.assertEqual("reviewer", threads[0]["comments"]["nodes"][0]["author"]["login"])
        self.assertIn("#discussion_r1", threads[0]["comments"]["nodes"][0]["url"])

    def test_explicit_target_uses_wrapper_without_pr_discovery(self) -> None:
        result, _ = self.run_reader("--repo", "example/project", "--pr", "20")

        calls = self.calls()
        self.assertEqual(["auth", "status"], calls[0])
        self.assertFalse(any(call[:2] == ["pr", "view"] for call in calls))
        self.assertEqual(2, sum(call[:2] == ["api", "graphql"] for call in calls))
        self.assert_preserved_thread_fields(result)

    def test_discovery_uses_the_same_wrapper_and_base_pr_url(self) -> None:
        result, _ = self.run_reader()

        calls = self.calls()
        self.assertIn(["pr", "view", "--json", "number,url"], calls)
        self.assertEqual(
            {
                "owner": "example",
                "repo": "project",
                "number": 20,
            },
            {
                key: result["pull_request"][key]
                for key in ("owner", "repo", "number")
            },
        )
        self.assert_preserved_thread_fields(result)

    def test_wrapper_failure_does_not_replay_stderr_or_credentials(self) -> None:
        environment = {**self.environment, "FAKE_GH_FAIL": "1"}
        process = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--gh-cli",
                str(self.fake_cli),
                "--repo",
                "example/project",
                "--pr",
                "20",
            ],
            capture_output=True,
            text=True,
            env=environment,
        )

        self.assertNotEqual(0, process.returncode)
        self.assertNotIn(SENSITIVE_MARKER, process.stdout + process.stderr)
        self.assertIn("authentication check failed", process.stderr)


if __name__ == "__main__":
    unittest.main()
