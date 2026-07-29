#!/usr/bin/env python3
"""Fetch conversation comments, reviews, and inline review threads for a PR."""

# Modified from the OpenAI GitHub plugin reader to support configurable CLI
# wrappers, explicit PR targets, credential-safe errors, and stable pagination.

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from dataclasses import dataclass
from typing import Any, Sequence

QUERY = """\
query(
  $owner: String!,
  $repo: String!,
  $number: Int!,
  $commentsCursor: String,
  $reviewsCursor: String,
  $threadsCursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      url
      title
      state
      comments(first: 100, after: $commentsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          url
          body
          createdAt
          updatedAt
          author { login }
        }
      }
      reviews(first: 100, after: $reviewsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          url
          state
          body
          submittedAt
          author { login }
        }
      }
      reviewThreads(first: 100, after: $threadsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          diffSide
          startLine
          startDiffSide
          originalLine
          originalStartLine
          resolvedBy { login }
          comments(first: 100) {
            nodes {
              id
              url
              body
              createdAt
              updatedAt
              author { login }
            }
          }
        }
      }
    }
  }
}
"""

PR_URL_PATTERN = re.compile(
    r"^https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/pull/(?P<number>[1-9][0-9]*)/?$"
)


@dataclass(frozen=True)
class PullRequestRef:
    owner: str
    repo: str
    number: int


class GitHubCli:
    def __init__(self, executable: str) -> None:
        if not executable:
            raise ValueError("GitHub CLI executable must not be empty.")
        self.executable = executable

    def run(self, args: Sequence[str], stdin: str | None = None) -> str:
        process = subprocess.run(
            [self.executable, *args],
            input=stdin,
            capture_output=True,
            text=True,
        )
        if process.returncode != 0:
            raise RuntimeError("Configured GitHub CLI command failed.")
        return process.stdout

    def run_json(
        self, args: Sequence[str], stdin: str | None = None
    ) -> dict[str, Any]:
        output = self.run(args, stdin=stdin)
        try:
            result = json.loads(output)
        except json.JSONDecodeError as error:
            raise RuntimeError(
                f"Configured GitHub CLI returned invalid JSON: {error}"
            ) from error
        if not isinstance(result, dict):
            raise RuntimeError("Configured GitHub CLI returned a non-object JSON value.")
        return result

    def ensure_authenticated(self) -> None:
        try:
            self.run(["auth", "status"])
        except RuntimeError as error:
            raise RuntimeError(
                "GitHub CLI authentication check failed. Authenticate the configured "
                "CLI or refresh its short-lived wrapper credentials."
            ) from error

    def discover_current_pr(self) -> PullRequestRef:
        pr = self.run_json(["pr", "view", "--json", "number,url"])
        url = pr.get("url")
        number = pr.get("number")
        if not isinstance(url, str):
            raise RuntimeError("PR discovery returned no URL.")

        match = PR_URL_PATTERN.fullmatch(url)
        if match is None:
            raise RuntimeError("PR discovery returned an unsupported GitHub URL.")

        discovered_number = int(match.group("number"))
        if not isinstance(number, int) or number != discovered_number:
            raise RuntimeError("PR discovery returned inconsistent PR identifiers.")

        return PullRequestRef(
            owner=match.group("owner"),
            repo=match.group("repo"),
            number=number,
        )

    def graphql(
        self,
        pr: PullRequestRef,
        comments_cursor: str | None = None,
        reviews_cursor: str | None = None,
        threads_cursor: str | None = None,
    ) -> dict[str, Any]:
        args = [
            "api",
            "graphql",
            "-F",
            "query=@-",
            "-F",
            f"owner={pr.owner}",
            "-F",
            f"repo={pr.repo}",
            "-F",
            f"number={pr.number}",
        ]
        if comments_cursor:
            args.extend(["-F", f"commentsCursor={comments_cursor}"])
        if reviews_cursor:
            args.extend(["-F", f"reviewsCursor={reviews_cursor}"])
        if threads_cursor:
            args.extend(["-F", f"threadsCursor={threads_cursor}"])
        return self.run_json(args, stdin=QUERY)


def parse_repository(value: str) -> tuple[str, str]:
    parts = value.split("/")
    if (
        len(parts) != 2
        or not all(parts)
        or any(part in {".", ".."} for part in parts)
    ):
        raise argparse.ArgumentTypeError("repository must use OWNER/REPOSITORY format")
    return parts[0], parts[1]


def fetch_all(cli: GitHubCli, pr_ref: PullRequestRef) -> dict[str, Any]:
    conversation_comments: list[dict[str, Any]] = []
    reviews: list[dict[str, Any]] = []
    review_threads: list[dict[str, Any]] = []
    comments_cursor: str | None = None
    reviews_cursor: str | None = None
    threads_cursor: str | None = None
    comments_complete = False
    reviews_complete = False
    threads_complete = False
    pr_meta: dict[str, Any] | None = None

    while not (comments_complete and reviews_complete and threads_complete):
        payload = cli.graphql(
            pr=pr_ref,
            comments_cursor=comments_cursor,
            reviews_cursor=reviews_cursor,
            threads_cursor=threads_cursor,
        )
        errors = payload.get("errors")
        if errors:
            error_count = len(errors) if isinstance(errors, list) else 1
            raise RuntimeError(f"GitHub GraphQL returned {error_count} error(s).")

        try:
            pr = payload["data"]["repository"]["pullRequest"]
            comments = pr["comments"]
            page_reviews = pr["reviews"]
            threads = pr["reviewThreads"]
        except (KeyError, TypeError) as error:
            raise RuntimeError("GitHub GraphQL returned an unexpected PR payload.") from error
        if pr is None:
            raise RuntimeError("GitHub GraphQL did not find the requested PR.")

        if pr_meta is None:
            pr_meta = {
                "number": pr["number"],
                "url": pr["url"],
                "title": pr["title"],
                "state": pr["state"],
                "owner": pr_ref.owner,
                "repo": pr_ref.repo,
            }

        if not comments_complete:
            conversation_comments.extend(comments.get("nodes") or [])
            comments_cursor, comments_complete = _pagination_state(comments)
        if not reviews_complete:
            reviews.extend(page_reviews.get("nodes") or [])
            reviews_cursor, reviews_complete = _pagination_state(page_reviews)
        if not threads_complete:
            review_threads.extend(threads.get("nodes") or [])
            threads_cursor, threads_complete = _pagination_state(threads)

    if pr_meta is None:
        raise RuntimeError("GitHub GraphQL returned no PR metadata.")
    return {
        "pull_request": pr_meta,
        "conversation_comments": conversation_comments,
        "reviews": reviews,
        "review_threads": review_threads,
    }


def _pagination_state(connection: dict[str, Any]) -> tuple[str | None, bool]:
    page_info = connection["pageInfo"]
    if not page_info["hasNextPage"]:
        return None, True
    cursor = page_info["endCursor"]
    if not isinstance(cursor, str) or not cursor:
        raise RuntimeError("GitHub GraphQL pagination returned no end cursor.")
    return cursor, False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--gh-cli",
        default=os.environ.get("GH_CLI", "gh"),
        help="gh-compatible executable or wrapper path (default: GH_CLI or gh)",
    )
    parser.add_argument(
        "--repo",
        type=parse_repository,
        metavar="OWNER/REPOSITORY",
        help="explicit base repository; requires --pr",
    )
    parser.add_argument(
        "--pr",
        type=int,
        help="explicit pull request number; requires --repo",
    )
    return parser


def resolve_pr_ref(
    parser: argparse.ArgumentParser,
    cli: GitHubCli,
    repository: tuple[str, str] | None,
    number: int | None,
) -> PullRequestRef:
    if (repository is None) != (number is None):
        parser.error("--repo and --pr must be supplied together")
    if number is not None and number <= 0:
        parser.error("--pr must be a positive integer")
    if repository is not None and number is not None:
        return PullRequestRef(repository[0], repository[1], number)
    return cli.discover_current_pr()


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    cli = GitHubCli(args.gh_cli)
    cli.ensure_authenticated()
    pr_ref = resolve_pr_ref(parser, cli, args.repo, args.pr)
    print(json.dumps(fetch_all(cli, pr_ref), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
