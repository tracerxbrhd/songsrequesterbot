"""Thin facade around yandex-music 3.2.2.

No DRM decoding, no alternate credentials/client fallbacks and no API-response logging.
Only unencrypted MP3 (raw) returned for the authenticated account is eligible.
"""
from __future__ import annotations

from dataclasses import dataclass
from io import BufferedIOBase
import re
from tempfile import SpooledTemporaryFile
from urllib.parse import urlsplit

import requests
from yandex_music import Client
from yandex_music.exceptions import BadRequestError, NotFoundError, UnauthorizedError, YandexMusicError

from parse import music_url, valid_track_id


MAX_AUDIO_BYTES = 40 * 1024 * 1024
_ALLOWED_HOSTS = ("strm.yandex.net", "storage.yandex.net")
_ALLOWED_PATHS = ("/music-v2/raw/", "/get-mp3/")
_HTTP_IN_ERROR = re.compile(r"\(([45][0-9]{2})\)(?::|\s|$)")


class MusicError(Exception):
    """Safe, non-sensitive failure code."""


@dataclass(frozen=True)
class Track:
    id: str
    title: str
    artist: str
    album: str
    duration_seconds: int | None
    url: str


def safe_error_code(exc: Exception) -> str:
    if isinstance(exc, MusicError):
        return str(exc)
    # MarshalX may carry status in a NetworkError message. Extract ONLY numeric
    # HTTP code, never log or expose the returned response body or signed URL.
    match = _HTTP_IN_ERROR.search(str(exc))
    if match:
        return "HTTP_" + match.group(1)
    if isinstance(exc, UnauthorizedError):
        return "ACCESS_DENIED"
    if isinstance(exc, BadRequestError):
        return "BAD_REQUEST"
    if isinstance(exc, NotFoundError):
        return "NOT_FOUND"
    if isinstance(exc, (requests.Timeout, requests.ConnectionError)):
        return "NETWORK_ERROR"
    if isinstance(exc, YandexMusicError):
        return "API_ERROR"
    return "UNEXPECTED"


def describe_error(code: str) -> str:
    if code == "HTTP_451":
        return "⛔ Яндекс отклонил запрос (HTTP 451). Возможны региональные или правовые ограничения."
    if code in {"HTTP_403", "ACCESS_DENIED"}:
        return "🔒 Яндекс не разрешил выполнить операцию. Подписка сама по себе не гарантирует доступ к MP3."
    if code == "HTTP_401":
        return "🔑 Яндекс отклонил авторизацию (HTTP 401). Проверь OAuth."
    if code == "HTTP_429":
        return "⏳ Слишком много обращений к Яндекс Музыке. Попробуй позже."
    if code == "NOT_FOUND":
        return "🔎 Трек не найден."
    if code in {"RAW_MP3_UNAVAILABLE", "UNSUPPORTED_CODEC", "UNTRUSTED_AUDIO_URL"}:
        return "🔒 Для этого трека Яндекс не предоставил доступный незашифрованный MP3."
    if code == "AUDIO_TOO_LARGE":
        return "📦 Аудиофайл слишком большой для отправки через Telegram."
    if code == "AUDIO_FORMAT_INVALID":
        return "⚠️ Источник вернул данные, которые не похожи на MP3."
    if re.fullmatch(r"HTTP_[45][0-9]{2}", code):
        return "⚠️ Яндекс ответил ошибкой " + code.replace("_", " ") + "."
    if code in {"NETWORK_ERROR", "AUDIO_FETCH_FAILED"}:
        return "🌐 Не удалось получить ответ Яндекс Музыки."
    return "⚠️ Не удалось выполнить запрос к Яндекс Музыке (код " + re.sub(r"[^A-Z0-9_]", "", code)[:35] + ")."


def trusted_audio_url(url: object) -> bool:
    if not isinstance(url, str) or len(url) > 4096 or "\\" in url:
        return False
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        return (
            parts.scheme == "https"
            and not parts.username and not parts.password and parts.port in (None, 443)
            and any(host == root or host.endswith("." + root) for root in _ALLOWED_HOSTS)
            and parts.path.startswith(_ALLOWED_PATHS)
        )
    except ValueError:
        return False


def _normalise(raw) -> Track | None:
    value = str(getattr(raw, "id", ""))
    if ":" in value:
        value = value.split(":", 1)[0]
    if not valid_track_id(value):
        return None
    artists = [str(getattr(item, "name", "")) for item in (getattr(raw, "artists", None) or [])]
    albums = getattr(raw, "albums", None) or []
    duration = getattr(raw, "duration_ms", None)
    return Track(
        id=value,
        title=str(getattr(raw, "title", None) or "Без названия"),
        artist=", ".join(name for name in artists if name) or "Неизвестный исполнитель",
        album=str(getattr(albums[0], "title", "") or "") if albums else "",
        duration_seconds=int(duration // 1000) if isinstance(duration, (int, float)) else None,
        url=music_url(value),
    )


class YandexProvider:
    def __init__(self, token: str, client=None, session=None):
        if not token:
            raise MusicError("TOKEN_MISSING")
        self.client = client or Client(token)
        self.http = session or requests.Session()

    def _call(self, method, *args, **kwargs):
        try:
            return method(*args, **kwargs)
        except Exception as exc:
            raise MusicError(safe_error_code(exc)) from None

    def account_check(self) -> None:
        status = self._call(self.client.account_status)
        if not getattr(getattr(status, "account", None), "uid", None):
            raise MusicError("ACCOUNT_UNVERIFIED")

    def get_track(self, track_id: str) -> Track | None:
        if not valid_track_id(track_id):
            return None
        tracks = self._call(self.client.tracks, [track_id])
        if not tracks:
            return None
        return _normalise(tracks[0])

    def search(self, query: str, limit: int = 5) -> list[Track]:
        result = self._call(self.client.search, query, type_="track")
        results = (getattr(getattr(result, "tracks", None), "results", None) or [])
        unique: set[str] = set()
        tracks: list[Track] = []
        for raw in results:
            track = _normalise(raw)
            if track and track.id not in unique:
                tracks.append(track)
                unique.add(track.id)
            if len(tracks) >= limit:
                break
        return tracks

    def raw_mp3_url(self, track_id: str) -> str:
        if not valid_track_id(track_id):
            raise MusicError("INVALID_TRACK_ID")
        # Explicitly request raw MP3; never call .download_bytes on encraw.
        for quality in ("hq", "nq"):
            value = self._call(
                self.client.tracks_file_info,
                track_id, quality=quality, codecs=["mp3"], transport="raw",
            )
            info = getattr(value, "download_info", None)
            if info is None:
                continue
            if getattr(info, "transport", None) != "raw" or getattr(info, "codec", None) != "mp3":
                continue
            urls = [getattr(info, "url", None)]
            urls.extend(getattr(info, "urls", None) or [])
            for url in urls:
                if trusted_audio_url(url):
                    return url
            raise MusicError("UNTRUSTED_AUDIO_URL")
        raise MusicError("RAW_MP3_UNAVAILABLE")

    def download_raw_mp3(self, track_id: str):
        url = self.raw_mp3_url(track_id)
        try:
            response = self.http.get(url, timeout=(5, 12), stream=True, allow_redirects=False)
            if response.status_code != 200:
                raise MusicError("HTTP_" + str(response.status_code))
            claimed_size = int(response.headers.get("Content-Length") or 0)
            if claimed_size > MAX_AUDIO_BYTES:
                raise MusicError("AUDIO_TOO_LARGE")
            stream = SpooledTemporaryFile(mode="w+b", max_size=8 * 1024 * 1024)
            try:
                count = 0
                for chunk in response.iter_content(chunk_size=65536):
                    if not chunk:
                        continue
                    count += len(chunk)
                    if count > MAX_AUDIO_BYTES:
                        raise MusicError("AUDIO_TOO_LARGE")
                    stream.write(chunk)
                stream.seek(0)
                header = stream.read(3)
                stream.seek(0)
                if not (header.startswith(b"ID3") or
                        (len(header) >= 2 and header[0] == 0xff and (header[1] & 0xe0) == 0xe0)):
                    raise MusicError("AUDIO_FORMAT_INVALID")
                return stream
            except Exception:
                stream.close()
                raise
        except (requests.RequestException, ValueError) as exc:
            raise MusicError(safe_error_code(exc)) from None
        finally:
            if 'response' in locals():
                response.close()

    def diagnose(self, track_id: str = "126278860") -> list[str]:
        checks = [
            ("OAuth", self.account_check),
            ("Каталог", lambda: self.get_track(track_id)),
            ("Поиск", lambda: self.search("Монеточка", limit=2)),
            ("MP3 raw", lambda: self.raw_mp3_url(track_id)),
        ]
        lines = []
        for name, check in checks:
            try:
                value = check()
                if name == "Каталог" and value is None:
                    lines.append(name + ": ⚪ нет трека")
                elif name == "Поиск" and not value:
                    lines.append(name + ": ⚪ нет результатов")
                else:
                    lines.append(name + ": ✅ OK")
            except Exception as exc:
                lines.append(name + ": ❌ " + safe_error_code(exc))
        return lines
