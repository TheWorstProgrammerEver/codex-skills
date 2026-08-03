#!/usr/bin/env python3
"""Operate a Linear app-user OAuth credential without exposing token values."""

from __future__ import annotations

import argparse
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from linear_oauth_config import ENV_FILENAME, OAuthConfig, SafeFailure, init_env, load_config

TOKEN_URL = "https://api.linear.app/oauth/token"
REVOKE_URL = "https://api.linear.app/oauth/revoke"
GRAPHQL_URL = "https://api.linear.app/graphql"
MAX_RESPONSE_BYTES = 1024 * 1024
ISSUE_ID_RE = re.compile(r"^[A-Za-z0-9-]{1,128}$")
TOKEN_RE = re.compile(r"^[\x21-\x7e]{1,8192}$")


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: bytes


class Transport(Protocol):
    def request(
        self,
        url: str,
        *,
        method: str,
        headers: dict[str, str],
        body: bytes,
    ) -> HttpResponse: ...


class UrllibTransport:
    def request(
        self,
        url: str,
        *,
        method: str,
        headers: dict[str, str],
        body: bytes,
    ) -> HttpResponse:
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return HttpResponse(response.status, _read_bounded(response))
        except urllib.error.HTTPError as error:
            try:
                response_body = _read_bounded(error)
            finally:
                error.close()
            return HttpResponse(error.code, response_body)
        except (OSError, TimeoutError, urllib.error.URLError) as error:
            raise SafeFailure("network_unavailable") from error


@dataclass(frozen=True)
class Token:
    value: str = field(repr=False)
    expires_in_seconds: int


class Unauthorized(Exception):
    pass


def _read_bounded(stream: Any) -> bytes:
    body = stream.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise SafeFailure("response_too_large")
    return body


def _safe_json(body: bytes, failure_code: str) -> dict[str, Any]:
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SafeFailure(failure_code) from error
    if not isinstance(parsed, dict):
        raise SafeFailure(failure_code)
    return parsed


class LinearOAuthOperator:
    def __init__(self, config: OAuthConfig, transport: Transport | None = None) -> None:
        self.config = config
        self.transport = transport or UrllibTransport()

    def mint_token(self) -> Token:
        request_body = urllib.parse.urlencode(
            {
                "grant_type": "client_credentials",
                "scope": ",".join(self.config.scopes),
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
            }
        ).encode("ascii")
        response = self.transport.request(
            TOKEN_URL,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            body=request_body,
        )
        if response.status < 200 or response.status >= 300:
            raise SafeFailure("token_mint_failed")
        payload = _safe_json(response.body, "token_response_invalid")
        value = payload.get("access_token")
        token_type = payload.get("token_type")
        expires_in = payload.get("expires_in")
        returned_scopes = payload.get("scope")
        if not isinstance(value, str) or not TOKEN_RE.fullmatch(value):
            raise SafeFailure("token_response_invalid")
        if not isinstance(token_type, str) or token_type.lower() != "bearer":
            raise SafeFailure("token_response_invalid")
        if type(expires_in) is not int or not 0 < expires_in <= 366 * 24 * 60 * 60:
            raise SafeFailure("token_response_invalid")
        if isinstance(returned_scopes, str):
            returned_scope_set = set(returned_scopes.replace(",", " ").split())
        elif isinstance(returned_scopes, list) and all(isinstance(item, str) for item in returned_scopes):
            returned_scope_set = set(returned_scopes)
        else:
            raise SafeFailure("token_response_invalid")
        if returned_scope_set != set(self.config.scopes):
            raise SafeFailure("token_scope_mismatch")
        return Token(value=value, expires_in_seconds=expires_in)

    def graphql(self, token: Token, query: str, variables: dict[str, object] | None = None) -> dict[str, Any]:
        response = self.transport.request(
            GRAPHQL_URL,
            method="POST",
            headers={
                "Authorization": f"Bearer {token.value}",
                "Content-Type": "application/json",
            },
            body=json.dumps({"query": query, "variables": variables or {}}, separators=(",", ":")).encode(),
        )
        if response.status == 401:
            raise Unauthorized
        if response.status < 200 or response.status >= 300:
            raise SafeFailure("graphql_http_failed")
        payload = _safe_json(response.body, "graphql_response_invalid")
        if payload.get("errors") or not isinstance(payload.get("data"), dict):
            raise SafeFailure("graphql_error")
        return payload["data"]

    def _require_expected_viewer(self, viewer: object, mismatch_code: str = "viewer_mismatch") -> None:
        if not isinstance(viewer, dict):
            raise SafeFailure("viewer_response_invalid")
        if (
            viewer.get("id") != self.config.expected_viewer_id
            or viewer.get("name") != self.config.expected_viewer_name
        ):
            raise SafeFailure(mismatch_code)

    def validated_viewer(self) -> tuple[Token, bool]:
        token = self.mint_token()
        replaced = False
        try:
            data = self.graphql(token, "query ValidateViewer { viewer { id name } }")
        except Unauthorized:
            token = self.mint_token()
            replaced = True
            try:
                data = self.graphql(token, "query ValidateViewer { viewer { id name } }")
            except Unauthorized as error:
                raise SafeFailure("viewer_unauthorized") from error
        self._require_expected_viewer(data.get("viewer"))
        return token, replaced

    def validate_viewer(self) -> dict[str, object]:
        token, replaced = self.validated_viewer()
        return {
            "status": "ok",
            "operation": "viewer_validated",
            "viewer": "matched",
            "token_replaced_after_401": replaced,
            "expires_in_seconds": token.expires_in_seconds,
        }

    def _mutation(
        self,
        token: Token,
        query: str,
        variables: dict[str, object],
        marker: str,
        issue_id: str | None,
    ) -> dict[str, Any]:
        details: dict[str, object] = {"reconciliation_marker": marker}
        if issue_id:
            details["issue_id"] = issue_id
        try:
            return self.graphql(token, query, variables)
        except (Unauthorized, SafeFailure) as error:
            raise SafeFailure("mutation_outcome_ambiguous", details) from error

    def validate_attribution(self, *, issue_id: str | None, create_issue: bool) -> dict[str, object]:
        if issue_id and not ISSUE_ID_RE.fullmatch(issue_id):
            raise SafeFailure("issue_target_invalid")
        token, replaced = self.validated_viewer()
        marker = f"linear-agent-oauth-validation:{uuid.uuid4()}"
        created_issue = False
        if create_issue:
            if not self.config.test_team_id:
                raise SafeFailure("config_missing_test_team")
            issue_data = self._mutation(
                token,
                """mutation CreateDisposableIssue($input: IssueCreateInput!) {
                  issueCreate(input: $input) { success issue { id identifier } }
                }""",
                {
                    "input": {
                        "teamId": self.config.test_team_id,
                        "title": f"[Disposable] Linear OAuth attribution {marker.split(':', 1)[1]}",
                        "description": f"Disposable OAuth attribution validation.\n\nMarker: `{marker}`",
                    }
                },
                marker,
                None,
            )
            payload = issue_data.get("issueCreate")
            if not isinstance(payload, dict) or payload.get("success") is not True:
                raise SafeFailure("graphql_mutation_failed", {"reconciliation_marker": marker})
            issue = payload.get("issue")
            created_issue_id = issue.get("id") if isinstance(issue, dict) else None
            if not isinstance(created_issue_id, str) or not ISSUE_ID_RE.fullmatch(created_issue_id):
                raise SafeFailure("mutation_outcome_ambiguous", {"reconciliation_marker": marker})
            issue_id = created_issue_id
            created_issue = True
        if not issue_id:
            raise SafeFailure("issue_target_required")

        comment_data = self._mutation(
            token,
            """mutation CreateValidationComment($input: CommentCreateInput!) {
              commentCreate(input: $input) { success comment { id user { id name } } }
            }""",
            {"input": {"issueId": issue_id, "body": f"Disposable attribution check. `{marker}`"}},
            marker,
            issue_id,
        )
        payload = comment_data.get("commentCreate")
        if not isinstance(payload, dict) or payload.get("success") is not True:
            raise SafeFailure(
                "graphql_mutation_failed",
                {"reconciliation_marker": marker, "issue_id": issue_id},
            )
        comment = payload.get("comment")
        comment_id = comment.get("id") if isinstance(comment, dict) else None
        if not isinstance(comment_id, str) or not ISSUE_ID_RE.fullmatch(comment_id):
            raise SafeFailure(
                "mutation_outcome_ambiguous",
                {"reconciliation_marker": marker, "issue_id": issue_id},
            )
        try:
            self._require_expected_viewer(comment.get("user"), "attribution_mismatch")
        except SafeFailure as error:
            raise SafeFailure(
                "attribution_mismatch",
                {
                    "reconciliation_marker": marker,
                    "issue_id": issue_id,
                    "comment_id": comment_id,
                },
            ) from error
        return {
            "status": "ok",
            "operation": "graphql_attribution_validated",
            "attribution": "matched",
            "created_disposable_issue": created_issue,
            "issue_id": issue_id,
            "comment_id": comment_id,
            "reconciliation_marker": marker,
            "token_replaced_after_401": replaced,
        }

    def validate_revocation(self) -> dict[str, object]:
        token, replaced = self.validated_viewer()
        response = self.transport.request(
            REVOKE_URL,
            method="POST",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            body=urllib.parse.urlencode({"token": token.value, "token_type_hint": "access_token"}).encode(),
        )
        if response.status != 200:
            raise SafeFailure("revocation_failed")
        response = self.transport.request(
            GRAPHQL_URL,
            method="POST",
            headers={
                "Authorization": f"Bearer {token.value}",
                "Content-Type": "application/json",
            },
            body=json.dumps({"query": "query RevokedViewer { viewer { id } }"}).encode(),
        )
        if response.status != 401:
            raise SafeFailure("revocation_not_effective")
        return {
            "status": "ok",
            "operation": "revocation_validated",
            "revoked_token_rejected": True,
            "token_replaced_after_401": replaced,
        }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init-env", help="Create a protected placeholder env file")
    init_parser.add_argument("--directory", required=True, type=Path)

    for command in ("check-env", "validate-viewer", "validate-revocation"):
        command_parser = subparsers.add_parser(command)
        command_parser.add_argument("--env-file", required=True, type=Path)

    attribution_parser = subparsers.add_parser("validate-attribution")
    attribution_parser.add_argument("--env-file", required=True, type=Path)
    target = attribution_parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--issue-id")
    target.add_argument("--create-disposable-issue", action="store_true")
    attribution_parser.add_argument("--confirm-write", action="store_true", required=True)
    return parser


def run(arguments: argparse.Namespace) -> dict[str, object]:
    if arguments.command == "init-env":
        return init_env(arguments.directory)
    config = load_config(
        arguments.env_file,
        require_test_team=(
            arguments.command == "validate-attribution" and arguments.create_disposable_issue
        ),
    )
    if arguments.command == "check-env":
        return {
            "status": "ok",
            "operation": "env_validated",
            "scope_count": len(config.scopes),
            "test_team_configured": config.test_team_id is not None,
        }
    operator = LinearOAuthOperator(config)
    if arguments.command == "validate-viewer":
        return operator.validate_viewer()
    if arguments.command == "validate-attribution":
        return operator.validate_attribution(
            issue_id=arguments.issue_id,
            create_issue=arguments.create_disposable_issue,
        )
    if arguments.command == "validate-revocation":
        return operator.validate_revocation()
    raise SafeFailure("unsupported_command")


def main(argv: list[str] | None = None) -> int:
    try:
        result = run(_parser().parse_args(argv))
    except SafeFailure as error:
        print(json.dumps({"status": "error", "code": error.code, **error.details}, sort_keys=True))
        return 1
    except Exception:
        print(json.dumps({"status": "error", "code": "internal_error"}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
