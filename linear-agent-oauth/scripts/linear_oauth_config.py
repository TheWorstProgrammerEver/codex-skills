"""Protected credential-file handling for the Linear OAuth operator."""

from __future__ import annotations

import os
import re
import stat
from dataclasses import dataclass, field
from pathlib import Path

ENV_FILENAME = "linear-agent-oauth.env"
TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "references" / f"{ENV_FILENAME}.example"
MAX_CONFIG_BYTES = 64 * 1024
ALLOWED_KEYS = {
    "LINEAR_CLIENT_ID",
    "LINEAR_CLIENT_SECRET",
    "LINEAR_SCOPES",
    "LINEAR_EXPECTED_VIEWER_ID",
    "LINEAR_EXPECTED_VIEWER_NAME",
    "LINEAR_TEST_TEAM_ID",
}
REQUIRED_KEYS = ALLOWED_KEYS - {"LINEAR_TEST_TEAM_ID"}
PLACEHOLDER_PREFIX = "REPLACE_WITH_"
SCOPE_RE = re.compile(r"^[A-Za-z0-9:_-]+$")


class SafeFailure(Exception):
    def __init__(self, code: str, details: dict[str, object] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details or {}


@dataclass(frozen=True)
class OAuthConfig:
    client_id: str
    client_secret: str = field(repr=False)
    scopes: tuple[str, ...]
    expected_viewer_id: str
    expected_viewer_name: str
    test_team_id: str | None


def _mode(file_stat: os.stat_result) -> int:
    return stat.S_IMODE(file_stat.st_mode)


def _validate_private_directory(directory_stat: os.stat_result) -> None:
    if not stat.S_ISDIR(directory_stat.st_mode):
        raise SafeFailure("config_path_type")
    if directory_stat.st_uid != os.getuid() or _mode(directory_stat) != 0o700:
        raise SafeFailure("config_permissions")


def _require_canonical_directory(directory: Path) -> None:
    requested = Path(os.path.abspath(directory))
    try:
        resolved = directory.resolve(strict=True)
    except OSError as error:
        raise SafeFailure("config_path_invalid") from error
    if resolved != requested:
        raise SafeFailure("config_path_symlink")


def _open_private_directory(directory: Path) -> int:
    _require_canonical_directory(directory)
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        directory_fd = os.open(directory, flags)
    except OSError as error:
        raise SafeFailure("config_path_invalid") from error
    try:
        _validate_private_directory(os.fstat(directory_fd))
    except Exception:
        os.close(directory_fd)
        raise
    return directory_fd


def init_env(directory: Path) -> dict[str, object]:
    try:
        template = TEMPLATE_PATH.read_bytes()
    except OSError as error:
        raise SafeFailure("template_unavailable") from error
    if not template or len(template) > MAX_CONFIG_BYTES:
        raise SafeFailure("template_invalid")
    try:
        template_values = _parse_env(template.decode("utf-8"), allow_placeholders=True)
    except (UnicodeDecodeError, SafeFailure) as error:
        raise SafeFailure("template_invalid") from error
    placeholder_keys = ALLOWED_KEYS - {"LINEAR_SCOPES"}
    if placeholder_keys - template_values.keys() or any(
        not template_values[key].startswith(PLACEHOLDER_PREFIX) for key in placeholder_keys
    ):
        raise SafeFailure("template_invalid")
    template_scopes = template_values["LINEAR_SCOPES"].split(",")
    if (
        any(not SCOPE_RE.fullmatch(scope) for scope in template_scopes)
        or len(template_scopes) != len(set(template_scopes))
        or "admin" in template_scopes
    ):
        raise SafeFailure("template_invalid")

    _require_canonical_directory(directory.parent)
    created_directory = False
    try:
        os.mkdir(directory, 0o700)
        created_directory = True
    except FileExistsError:
        pass
    except OSError as error:
        raise SafeFailure("config_directory_create_failed") from error

    if created_directory:
        try:
            os.chmod(directory, 0o700, follow_symlinks=False)
        except OSError as error:
            raise SafeFailure("config_directory_create_failed") from error

    directory_fd = _open_private_directory(directory)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    created_file = False
    try:
        try:
            env_fd = os.open(ENV_FILENAME, flags, 0o600, dir_fd=directory_fd)
            created_file = True
        except FileExistsError as error:
            raise SafeFailure("config_already_exists") from error
        except OSError as error:
            raise SafeFailure("config_create_failed") from error

        try:
            try:
                os.fchmod(env_fd, 0o600)
                with os.fdopen(env_fd, "wb", closefd=False) as env_file:
                    env_file.write(template)
                    env_file.flush()
                    os.fsync(env_file.fileno())
            finally:
                os.close(env_fd)
            os.fsync(directory_fd)
        except OSError as error:
            raise SafeFailure("config_write_failed") from error
    except Exception:
        if created_file:
            try:
                os.unlink(ENV_FILENAME, dir_fd=directory_fd)
                os.fsync(directory_fd)
            except OSError as cleanup_error:
                raise SafeFailure("config_cleanup_failed") from cleanup_error
        raise
    finally:
        os.close(directory_fd)

    return {"status": "ok", "operation": "env_created", "credential_file": "<credential-file>"}


def _read_private_file(path: Path) -> str:
    if path.name in {"", ".", ".."}:
        raise SafeFailure("config_path_invalid")
    directory_fd = _open_private_directory(path.parent)
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        try:
            file_fd = os.open(path.name, flags, dir_fd=directory_fd)
        except OSError as error:
            raise SafeFailure("config_path_invalid") from error
        try:
            file_stat = os.fstat(file_fd)
            if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_nlink != 1:
                raise SafeFailure("config_path_type")
            if file_stat.st_uid != os.getuid() or _mode(file_stat) != 0o600:
                raise SafeFailure("config_permissions")
            chunks: list[bytes] = []
            total = 0
            while True:
                try:
                    chunk = os.read(file_fd, min(8192, MAX_CONFIG_BYTES + 1 - total))
                except OSError as error:
                    raise SafeFailure("config_read_failed") from error
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
                if total > MAX_CONFIG_BYTES:
                    raise SafeFailure("config_too_large")
        finally:
            os.close(file_fd)
    finally:
        os.close(directory_fd)

    try:
        return b"".join(chunks).decode("utf-8")
    except UnicodeDecodeError as error:
        raise SafeFailure("config_encoding") from error


def _parse_env(text: str, *, allow_placeholders: bool = False) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in raw_line:
            raise SafeFailure("config_syntax")
        key, value = raw_line.split("=", 1)
        if key not in ALLOWED_KEYS or key in values or key != key.strip():
            raise SafeFailure("config_field")
        if not value or value != value.strip() or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise SafeFailure("config_value")
        values[key] = value

    if REQUIRED_KEYS - values.keys():
        raise SafeFailure("config_missing_field")
    if not allow_placeholders and any(value.startswith(PLACEHOLDER_PREFIX) for value in values.values()):
        raise SafeFailure("config_placeholder")
    return values


def load_config(path: Path, *, require_test_team: bool = False) -> OAuthConfig:
    values = _parse_env(_read_private_file(path))
    scope_parts = values["LINEAR_SCOPES"].split(",")
    if (
        any(not SCOPE_RE.fullmatch(scope) for scope in scope_parts)
        or len(scope_parts) != len(set(scope_parts))
        or "admin" in scope_parts
    ):
        raise SafeFailure("config_scope")
    test_team_id = values.get("LINEAR_TEST_TEAM_ID")
    if require_test_team and not test_team_id:
        raise SafeFailure("config_missing_test_team")

    bounded_values = (
        values["LINEAR_CLIENT_ID"],
        values["LINEAR_CLIENT_SECRET"],
        values["LINEAR_EXPECTED_VIEWER_ID"],
        values["LINEAR_EXPECTED_VIEWER_NAME"],
        test_team_id or "",
    )
    if any(len(value) > 4096 for value in bounded_values):
        raise SafeFailure("config_value")

    return OAuthConfig(
        client_id=values["LINEAR_CLIENT_ID"],
        client_secret=values["LINEAR_CLIENT_SECRET"],
        scopes=tuple(scope_parts),
        expected_viewer_id=values["LINEAR_EXPECTED_VIEWER_ID"],
        expected_viewer_name=values["LINEAR_EXPECTED_VIEWER_NAME"],
        test_team_id=test_team_id,
    )
