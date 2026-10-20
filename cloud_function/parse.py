"""Input validation and HTML formatting; no external services."""
from __future__ import annotations

from dataclasses import dataclass
from html import escape
import re
from urllib.parse import urlsplit


YANDEX_HOSTS = frozenset({"music.yandex.ru", "music.yandex.com", "music.yandex.by"})
TRACK_ID = re.compile(r"^[1-9][0-9]{0,15}$")
ALBUM_PATH = re.compile(r"^/album/[0-9]+/track/([1-9][0-9]{0,15})/?$")
TRACK_PATH = re.compile(r"^/track/([1-9][0-9]{0,15})/?$")
URL_PREFIX = re.compile(r"^[a-z][a-z0-9+.-]*:", re.I)


@dataclass(frozen=True)
class Request:
    kind: str
    value: str = ""


def valid_track_id(value: object) -> bool:
    return isinstance(value, str) and bool(TRACK_ID.fullmatch(value))


def parse_request(raw: object) -> Request:
    if not isinstance(raw, str):
        return Request("invalid")
    text = raw.strip()
    if not text or len(text) > 2048:
        return Request("invalid")
    if URL_PREFIX.match(text):
        if not text.lower().startswith("https://") or any(c.isspace() for c in text):
            return Request("unsupported")
        try:
            parsed = urlsplit(text)
            if (parsed.scheme.lower() != "https" or
                    parsed.hostname not in YANDEX_HOSTS or
                    parsed.username or parsed.password or parsed.port or
                    "\\" in text):
                return Request("unsupported")
        except ValueError:
            return Request("unsupported")
        match = ALBUM_PATH.fullmatch(parsed.path) or TRACK_PATH.fullmatch(parsed.path)
        return Request("track", match.group(1)) if match else Request("unsupported")
    if text.startswith(("/", "@")):
        return Request("invalid")
    query = " ".join(text.split())
    return Request("search", query) if 2 <= len(query) <= 120 else Request("invalid")


def parse_callback(data: object) -> Request:
    if data in ("home", "help"):
        return Request(data)
    if not isinstance(data, str):
        return Request("invalid")
    match = re.fullmatch(r"(?:t|d):([1-9][0-9]{0,15})", data)
    if not match:
        # Allow old Yandex-only callbacks that still exist in Telegram messages.
        match = re.fullmatch(r"(track|download):y:([1-9][0-9]{0,15})", data)
        if match:
            return Request("track" if match.group(1) == "track" else "download", match.group(2))
        return Request("invalid")
    return Request("track" if data.startswith("t:") else "download", match.group(1))


def esc(value: object, limit: int = 160) -> str:
    return escape(str(value or "")[:limit], quote=True)


def duration(seconds: int | None) -> str:
    if seconds is None or seconds < 0:
        return "—"
    return f"{seconds // 60}:{seconds % 60:02d}"


def music_url(track_id: str) -> str:
    if not valid_track_id(track_id):
        raise ValueError("invalid track id")
    return "https://music.yandex.ru/track/" + track_id
