from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_ROOT / "scripts" / "linear_oauth.py"
sys.path.insert(0, str(SCRIPT.parent))
try:
    SPEC = importlib.util.spec_from_file_location("linear_oauth", SCRIPT)
    assert SPEC and SPEC.loader
    linear_oauth = importlib.util.module_from_spec(SPEC)
    sys.modules[SPEC.name] = linear_oauth
    SPEC.loader.exec_module(linear_oauth)
finally:
    sys.path.remove(str(SCRIPT.parent))

CLIENT_SECRET = "EXAMPLE_CLIENT_SECRET_MUST_NOT_LEAK"
ACCESS_TOKEN_ONE = "EXAMPLE_ACCESS_TOKEN_ONE_MUST_NOT_LEAK"
ACCESS_TOKEN_TWO = "EXAMPLE_ACCESS_TOKEN_TWO_MUST_NOT_LEAK"
WRONG_VIEWER = "EXAMPLE_WRONG_VIEWER_MUST_NOT_LEAK"


def response(status: int, payload: object = None) -> object:
    body = b"" if payload is None else json.dumps(payload).encode()
    return linear_oauth.HttpResponse(status, body)


def token_response(token: str) -> object:
    return response(
        200,
        {
            "access_token": token,
            "token_type": "Bearer",
            "expires_in": 2_591_999,
            "scope": "read issues:create comments:create",
        },
    )


def viewer_response(viewer_id: str = "viewer-id", name: str = "my-agent") -> object:
    return response(200, {"data": {"viewer": {"id": viewer_id, "name": name}}})


class FakeTransport:
    def __init__(self, responses: list[object]) -> None:
        self.responses = responses
        self.requests: list[dict[str, object]] = []

    def request(
        self,
        url: str,
        *,
        method: str,
        headers: dict[str, str],
        body: bytes,
    ) -> object:
        self.requests.append({"url": url, "method": method, "headers": headers, "body": body})
        if not self.responses:
            raise AssertionError("unexpected request")
        return self.responses.pop(0)


class LinearOAuthTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(prefix="linear-oauth-test-")
        self.root = Path(self.temporary_directory.name)
        self.config_directory = self.root / "credential"
        self.config_directory.mkdir(mode=0o700)
        self.config_path = self.config_directory / linear_oauth.ENV_FILENAME

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def write_config(self, **overrides: str) -> None:
        values = {
            "LINEAR_CLIENT_ID": "example-client-id",
            "LINEAR_CLIENT_SECRET": CLIENT_SECRET,
            "LINEAR_SCOPES": "read,issues:create,comments:create",
            "LINEAR_EXPECTED_VIEWER_ID": "viewer-id",
            "LINEAR_EXPECTED_VIEWER_NAME": "my-agent",
            "LINEAR_TEST_TEAM_ID": "test-team-id",
            **overrides,
        }
        self.config_path.write_text(
            "".join(f"{key}={value}\n" for key, value in values.items()),
            encoding="utf-8",
        )
        self.config_path.chmod(0o600)

    def config(self) -> object:
        return linear_oauth.load_config(self.config_path)

    def assert_no_secret(self, value: object) -> None:
        serialized = json.dumps(value, default=str)
        for secret in (CLIENT_SECRET, ACCESS_TOKEN_ONE, ACCESS_TOKEN_TWO, WRONG_VIEWER):
            self.assertNotIn(secret, serialized)

    def test_init_env_creates_restrictive_placeholder_file_without_paths(self) -> None:
        target = self.root / "new-credential"
        result = linear_oauth.init_env(target)

        target_stat = target.stat()
        env_path = target / linear_oauth.ENV_FILENAME
        env_stat = env_path.stat()
        self.assertEqual(0o700, stat.S_IMODE(target_stat.st_mode))
        self.assertEqual(0o600, stat.S_IMODE(env_stat.st_mode))
        self.assertIn("REPLACE_WITH_CLIENT_SECRET", env_path.read_text(encoding="utf-8"))
        self.assertNotIn(str(target), json.dumps(result))
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.load_config(env_path)
        self.assertEqual("config_placeholder", failure.exception.code)

    def test_init_env_refuses_overwrite(self) -> None:
        target = self.root / "new-credential"
        linear_oauth.init_env(target)
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.init_env(target)
        self.assertEqual("config_already_exists", failure.exception.code)

    def test_config_requires_private_file_and_directory_modes(self) -> None:
        self.write_config()
        self.config_path.chmod(0o640)
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.load_config(self.config_path)
        self.assertEqual("config_permissions", failure.exception.code)

        self.config_path.chmod(0o600)
        self.config_directory.chmod(0o750)
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.load_config(self.config_path)
        self.assertEqual("config_permissions", failure.exception.code)

    def test_config_rejects_symlinked_directory_and_hardlinked_file(self) -> None:
        self.write_config()
        linked_directory = self.root / "linked-credential"
        linked_directory.symlink_to(self.config_directory, target_is_directory=True)
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.load_config(linked_directory / linear_oauth.ENV_FILENAME)
        self.assertEqual("config_path_symlink", failure.exception.code)

        hardlink = self.config_directory / "hardlinked.env"
        hardlink.hardlink_to(self.config_path)
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.load_config(self.config_path)
        self.assertEqual("config_path_type", failure.exception.code)

    def test_config_rejects_fifo_without_blocking(self) -> None:
        fifo_path = self.config_directory / "credential-fifo.env"
        os.mkfifo(fifo_path, 0o600)

        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "check-env", "--env-file", str(fifo_path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=1,
        )

        self.assertEqual(1, completed.returncode)
        self.assertEqual(
            {"status": "error", "code": "config_path_type"},
            json.loads(completed.stdout),
        )
        self.assertEqual("", completed.stderr)
        self.assertNotIn(str(self.root), completed.stdout)

    def test_config_rejects_unknown_fields_and_admin_scope(self) -> None:
        self.write_config(LINEAR_UNEXPECTED=CLIENT_SECRET)
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.load_config(self.config_path)
        self.assertEqual("config_field", failure.exception.code)
        self.assert_no_secret(failure.exception)

        self.write_config(LINEAR_SCOPES="read,admin")
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.load_config(self.config_path)
        self.assertEqual("config_scope", failure.exception.code)

    def test_viewer_401_mints_one_replacement_and_redacts_tokens(self) -> None:
        self.write_config()
        transport = FakeTransport(
            [token_response(ACCESS_TOKEN_ONE), response(401), token_response(ACCESS_TOKEN_TWO), viewer_response()]
        )
        result = linear_oauth.LinearOAuthOperator(self.config(), transport).validate_viewer()

        self.assertTrue(result["token_replaced_after_401"])
        self.assertEqual(4, len(transport.requests))
        self.assert_no_secret(result)

    def test_second_viewer_401_stops_after_one_replacement(self) -> None:
        self.write_config()
        transport = FakeTransport(
            [token_response(ACCESS_TOKEN_ONE), response(401), token_response(ACCESS_TOKEN_TWO), response(401)]
        )
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), transport).validate_viewer()
        self.assertEqual("viewer_unauthorized", failure.exception.code)
        self.assertEqual(4, len(transport.requests))
        self.assert_no_secret(failure.exception)

    def test_viewer_mismatch_is_bounded_and_redacted(self) -> None:
        self.write_config()
        transport = FakeTransport([token_response(ACCESS_TOKEN_ONE), viewer_response(WRONG_VIEWER)])
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), transport).validate_viewer()
        self.assertEqual("viewer_mismatch", failure.exception.code)
        self.assert_no_secret(failure.exception)

    def test_graphql_attribution_creates_disposable_issue_and_comment(self) -> None:
        self.write_config()
        transport = FakeTransport(
            [
                token_response(ACCESS_TOKEN_ONE),
                viewer_response(),
                response(200, {"data": {"issueCreate": {"success": True, "issue": {"id": "issue-id"}}}}),
                response(
                    200,
                    {
                        "data": {
                            "commentCreate": {
                                "success": True,
                                "comment": {
                                    "id": "comment-id",
                                    "user": {"id": "viewer-id", "name": "my-agent"},
                                },
                            }
                        }
                    },
                ),
            ]
        )
        result = linear_oauth.LinearOAuthOperator(self.config(), transport).validate_attribution(
            issue_id=None,
            create_issue=True,
        )

        self.assertTrue(result["created_disposable_issue"])
        self.assertEqual("issue-id", result["issue_id"])
        self.assertEqual("comment-id", result["comment_id"])
        self.assertIn("linear-agent-oauth-validation:", result["reconciliation_marker"])
        self.assert_no_secret(result)

    def test_attribution_mismatch_and_ambiguous_mutation_fail_closed(self) -> None:
        self.write_config()
        mismatch = FakeTransport(
            [
                token_response(ACCESS_TOKEN_ONE),
                viewer_response(),
                response(
                    200,
                    {
                        "data": {
                            "commentCreate": {
                                "success": True,
                                "comment": {
                                    "id": "comment-id",
                                    "user": {"id": WRONG_VIEWER, "name": "wrong"},
                                },
                            }
                        }
                    },
                ),
            ]
        )
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), mismatch).validate_attribution(
                issue_id="issue-id",
                create_issue=False,
            )
        self.assertEqual("attribution_mismatch", failure.exception.code)
        self.assert_no_secret(failure.exception)

        ambiguous = FakeTransport([token_response(ACCESS_TOKEN_ONE), viewer_response(), response(401)])
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), ambiguous).validate_attribution(
                issue_id="issue-id",
                create_issue=False,
            )
        self.assertEqual("mutation_outcome_ambiguous", failure.exception.code)
        self.assertIn("reconciliation_marker", failure.exception.details)
        self.assert_no_secret(failure.exception.details)

    def test_successful_issue_mutation_without_id_is_ambiguous(self) -> None:
        self.write_config()
        transport = FakeTransport(
            [
                token_response(ACCESS_TOKEN_ONE),
                viewer_response(),
                response(200, {"data": {"issueCreate": {"success": True, "issue": {}}}}),
            ]
        )

        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), transport).validate_attribution(
                issue_id=None,
                create_issue=True,
            )

        self.assertEqual("mutation_outcome_ambiguous", failure.exception.code)
        self.assertIn("reconciliation_marker", failure.exception.details)
        self.assertNotIn("issue_id", failure.exception.details)
        self.assert_no_secret(failure.exception.details)

    def test_successful_comment_mutation_with_malformed_id_is_ambiguous(self) -> None:
        self.write_config()
        transport = FakeTransport(
            [
                token_response(ACCESS_TOKEN_ONE),
                viewer_response(),
                response(
                    200,
                    {
                        "data": {
                            "commentCreate": {
                                "success": True,
                                "comment": {
                                    "id": "invalid comment id",
                                    "user": {"id": "viewer-id", "name": "my-agent"},
                                },
                            }
                        }
                    },
                ),
            ]
        )

        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), transport).validate_attribution(
                issue_id="issue-id",
                create_issue=False,
            )

        self.assertEqual("mutation_outcome_ambiguous", failure.exception.code)
        self.assertIn("reconciliation_marker", failure.exception.details)
        self.assertEqual("issue-id", failure.exception.details["issue_id"])
        self.assert_no_secret(failure.exception.details)

    def test_revocation_uses_minted_token_and_requires_401(self) -> None:
        self.write_config()
        transport = FakeTransport(
            [token_response(ACCESS_TOKEN_ONE), viewer_response(), response(200), response(401)]
        )
        result = linear_oauth.LinearOAuthOperator(self.config(), transport).validate_revocation()

        self.assertTrue(result["revoked_token_rejected"])
        revoke_request = transport.requests[2]
        self.assertEqual(linear_oauth.REVOKE_URL, revoke_request["url"])
        self.assertIn(ACCESS_TOKEN_ONE.encode(), revoke_request["body"])
        self.assert_no_secret(result)

    def test_revocation_fails_when_token_remains_active(self) -> None:
        self.write_config()
        transport = FakeTransport(
            [token_response(ACCESS_TOKEN_ONE), viewer_response(), response(200), viewer_response()]
        )
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), transport).validate_revocation()
        self.assertEqual("revocation_not_effective", failure.exception.code)
        self.assert_no_secret(failure.exception)

    def test_raw_token_error_body_is_not_projected(self) -> None:
        self.write_config()
        transport = FakeTransport([response(400, {"error_description": CLIENT_SECRET})])
        with self.assertRaises(linear_oauth.SafeFailure) as failure:
            linear_oauth.LinearOAuthOperator(self.config(), transport).validate_viewer()
        self.assertEqual("token_mint_failed", failure.exception.code)
        self.assert_no_secret(failure.exception)

    def test_cli_check_output_contains_no_secret_or_private_path(self) -> None:
        self.write_config()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            exit_code = linear_oauth.main(["check-env", "--env-file", str(self.config_path)])
        self.assertEqual(0, exit_code)
        self.assertNotIn(CLIENT_SECRET, output.getvalue())
        self.assertNotIn(str(self.root), output.getvalue())

    def test_fixture_contains_placeholders_only(self) -> None:
        template = (SKILL_ROOT / "references" / f"{linear_oauth.ENV_FILENAME}.example").read_text(
            encoding="utf-8"
        )
        self.assertIn("LINEAR_CLIENT_SECRET=REPLACE_WITH_CLIENT_SECRET", template)
        values = {
            key: value
            for line in template.splitlines()
            if line and not line.startswith("#")
            for key, value in [line.split("=", 1)]
        }
        for key, value in values.items():
            if key != "LINEAR_SCOPES":
                self.assertTrue(value.startswith("REPLACE_WITH_"))
        for secret in (CLIENT_SECRET, ACCESS_TOKEN_ONE, ACCESS_TOKEN_TWO):
            self.assertNotIn(secret, template)


if __name__ == "__main__":
    unittest.main()
