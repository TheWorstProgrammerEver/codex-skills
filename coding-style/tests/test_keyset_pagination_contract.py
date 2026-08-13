import base64
import json
import re
import unittest
from dataclasses import dataclass
from datetime import datetime


MAX_PAGE_SIZE = 50
TIMESTAMP_PATTERN = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z"
)
ID_PATTERN = re.compile(r"row-[0-9]{3}")
CURSOR_FIELDS = {"createdAt", "id", "version"}


class CursorError(ValueError):
    pass


@dataclass(frozen=True)
class Row:
    created_at: str
    row_id: str

    @property
    def sort_tuple(self):
        return self.created_at, self.row_id


def require_cursor_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CursorError("duplicate cursor component")
        result[key] = value
    return result


def validate_cursor_payload(payload):
    if not isinstance(payload, dict) or set(payload) != CURSOR_FIELDS:
        raise CursorError("cursor must have exact fields")
    if type(payload["version"]) is not int or payload["version"] != 1:
        raise CursorError("unsupported cursor version")
    if not isinstance(payload["createdAt"], str) or not TIMESTAMP_PATTERN.fullmatch(
        payload["createdAt"]
    ):
        raise CursorError("invalid cursor timestamp")
    try:
        datetime.fromisoformat(payload["createdAt"].replace("Z", "+00:00"))
    except ValueError as error:
        raise CursorError("invalid cursor timestamp") from error
    if not isinstance(payload["id"], str) or not ID_PATTERN.fullmatch(payload["id"]):
        raise CursorError("invalid cursor id")
    return payload


def encode_cursor(row):
    payload = {"createdAt": row.created_at, "id": row.row_id, "version": 1}
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(encoded).decode("ascii")


def encode_cursor_after_date_to_iso_mutation(row):
    truncated = re.sub(r"(\.[0-9]{3})[0-9]{3}Z$", r"\g<1>000Z", row.created_at)
    return encode_cursor(Row(truncated, row.row_id))


def decode_cursor(cursor):
    if not isinstance(cursor, str) or not cursor:
        raise CursorError("cursor must be a non-empty string")
    try:
        raw = base64.b64decode(cursor, altchars=b"-_", validate=True)
        payload = json.loads(raw, object_pairs_hook=require_cursor_object)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CursorError("malformed cursor") from error
    return validate_cursor_payload(payload)


def validate_page_size(page_size):
    if isinstance(page_size, bool) or not isinstance(page_size, int):
        raise CursorError("page size must be an integer")
    if not 1 <= page_size <= MAX_PAGE_SIZE:
        raise CursorError("page size is outside the supported range")


def fetch_page(rows, page_size, cursor=None, query_calls=None):
    validate_page_size(page_size)
    after = None
    if cursor is not None:
        payload = decode_cursor(cursor)
        after = payload["createdAt"], payload["id"]

    if query_calls is not None:
        query_calls.append({"after": after, "pageSize": page_size})

    ordered = sorted(rows, key=lambda row: row.sort_tuple, reverse=True)
    remaining = ordered if after is None else [
        row for row in ordered if row.sort_tuple < after
    ]
    page = remaining[:page_size]
    next_cursor = encode_cursor(page[-1]) if page else None
    return page, next_cursor


class KeysetPaginationContractTests(unittest.TestCase):
    def test_skill_routes_exact_keyset_contract_to_linked_guidance(self):
        from pathlib import Path

        root = Path(__file__).parents[1]
        skill = (root / "SKILL.md").read_text(encoding="utf-8")
        implementation = (root / "references" / "general-implementation.md").read_text(
            encoding="utf-8"
        )
        testing = (root / "references" / "automated-testing.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("exact keyset cursor", skill)
        self.assertIn("### Preserve Exact Keyset Cursor Tuples", implementation)
        self.assertIn("### Exact Keyset Pagination Cursor Tests", testing)
        self.assertIn("#exact-keyset-pagination-cursor-tests", implementation)
        self.assertIn("#preserve-exact-keyset-cursor-tuples", testing)
        self.assertIn("JavaScript `Date`", implementation)
        self.assertIn("`toISOString()`", implementation)
        self.assertIn("unique final tie-breaker", implementation)
        self.assertIn("positive server-side page-size maximum", implementation)
        self.assertIn("fails before the query adapter executes", testing)
        self.assertIn("concurrent row is inserted ahead", testing)

    def test_microsecond_timestamp_survives_and_kills_date_mutation(self):
        first = Row("2026-08-13T04:15:55.824731Z", "row-003")
        between = Row("2026-08-13T04:15:55.824500Z", "row-002")
        older = Row("2026-08-13T04:15:55.823999Z", "row-001")
        rows = [older, between, first]

        exact_cursor = encode_cursor(first)
        decoded = decode_cursor(exact_cursor)
        query_calls = []
        self.assertEqual(decoded["createdAt"].encode(), first.created_at.encode())
        self.assertEqual(fetch_page(rows, 1, exact_cursor, query_calls)[0], [between])
        self.assertEqual(
            query_calls,
            [{"after": first.sort_tuple, "pageSize": 1}],
        )

        mutated_cursor = encode_cursor_after_date_to_iso_mutation(first)
        with self.assertRaises(AssertionError):
            self.assertEqual(fetch_page(rows, 1, mutated_cursor)[0], [between])

    def test_equal_primary_values_use_unique_tie_breaker(self):
        timestamp = "2026-08-13T04:15:55.824731Z"
        rows = [Row(timestamp, f"row-{number:03d}") for number in range(1, 4)]

        first_page, cursor = fetch_page(rows, 2)
        second_page, _ = fetch_page(rows, 2, cursor)

        self.assertEqual(
            [row.row_id for row in first_page + second_page],
            ["row-003", "row-002", "row-001"],
        )

    def test_malformed_cursors_and_page_sizes_fail_before_query(self):
        valid = Row("2026-08-13T04:15:55.824731Z", "row-001")
        malformed_payloads = [
            "not-base64",
            base64.urlsafe_b64encode(b"not-json").decode("ascii"),
            base64.urlsafe_b64encode(b'{"createdAt":"bad","id":"row-001","version":1}').decode("ascii"),
            base64.urlsafe_b64encode(b'{"createdAt":"2026-99-99T99:99:99.999999Z","id":"row-001","version":1}').decode("ascii"),
            base64.urlsafe_b64encode(b'{"createdAt":"2026-02-29T04:15:55.824731Z","id":"row-001","version":1}').decode("ascii"),
            base64.urlsafe_b64encode(b'{"createdAt":"2026-08-13T04:15:55.824731Z","id":"row-001","version":true}').decode("ascii"),
            base64.urlsafe_b64encode(b'{"createdAt":"2026-08-13T04:15:55.824731Z","id":"row-001","version":1.0}').decode("ascii"),
            base64.urlsafe_b64encode(b'{"createdAt":"2026-08-13T04:15:55.824731Z","id":"row-001","extra":true,"version":1}').decode("ascii"),
        ]

        for cursor in malformed_payloads:
            with self.subTest(cursor=cursor):
                query_calls = []
                with self.assertRaises(CursorError):
                    fetch_page([valid], 1, cursor, query_calls)
                self.assertEqual(query_calls, [])

        for page_size in (True, 0, -1, 51, 1.5):
            with self.subTest(page_size=page_size):
                query_calls = []
                with self.assertRaises(CursorError):
                    fetch_page([valid], page_size, query_calls=query_calls)
                self.assertEqual(query_calls, [])

    def test_leading_concurrent_insert_does_not_shift_continuation(self):
        original = [
            Row("2026-08-13T04:15:55.824700Z", "row-003"),
            Row("2026-08-13T04:15:55.824600Z", "row-002"),
            Row("2026-08-13T04:15:55.824500Z", "row-001"),
        ]
        first_page, cursor = fetch_page(original, 2)
        leading = Row("2026-08-13T04:15:55.824800Z", "row-004")

        second_page, _ = fetch_page([leading, *original], 2, cursor)

        self.assertEqual(first_page + second_page, original)
        self.assertNotIn(leading, second_page)


if __name__ == "__main__":
    unittest.main()
