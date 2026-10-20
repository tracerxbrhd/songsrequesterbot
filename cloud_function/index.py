"""Yandex Cloud Functions entrypoint: index.handler.

The public function is a Telegram webhook. All state-changing HTTP requests
require Telegram's webhook secret header and the configured owner ID.
"""
from __future__ import annotations

import base64
from collections import OrderedDict
import hmac
from html import escape
import json
import logging
import os
import time

from parse import parse_request, parse_callback, esc, duration
from telegram_api import TelegramApi, TelegramError
from yandex_provider import YandexProvider, MusicError, describe_error, safe_error_code


LOG = logging.getLogger("songsrequester")
_MAX_BODY = 256 * 1024
_WARM_SEEN: OrderedDict[int, float] = OrderedDict()
_WARM_AUDIO: OrderedDict[str, str] = OrderedDict()


def reply(code: int, text: str, *, content_type="text/plain") -> dict:
    return {
        "statusCode": code,
        "headers": {"Content-Type": content_type},
        "body": text,
        "isBase64Encoded": False,
    }


def _headers(event: dict) -> dict:
    return {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}


def _authorized(event: dict, expected: str) -> bool:
    provided = _headers(event).get("x-telegram-bot-api-secret-token", "")
    return bool(expected and provided and
                hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8")))


def _body(event: dict) -> dict:
    raw = event.get("body")
    if isinstance(raw, dict):
        # Some synthetic invocation formats already carry JSON in parsed form.
        data = raw
    else:
        if not isinstance(raw, str):
            raise ValueError("invalid update body")
        if len(raw) > _MAX_BODY * 2:
            raise ValueError("body too large")
        if event.get("isBase64Encoded"):
            decoded = base64.b64decode(raw, validate=True)
            if len(decoded) > _MAX_BODY:
                raise ValueError("body too large")
            raw = decoded.decode("utf-8")
        elif len(raw.encode("utf-8")) > _MAX_BODY:
            raise ValueError("body too large")
        data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("invalid JSON object")
    return data


def _seen(update_id: object) -> bool:
    if not isinstance(update_id, int) or update_id < 0:
        return True
    now = time.monotonic()
    for key, timestamp in list(_WARM_SEEN.items()):
        if now - timestamp > 180:
            _WARM_SEEN.pop(key, None)
    if update_id in _WARM_SEEN:
        return True
    _WARM_SEEN[update_id] = now
    while len(_WARM_SEEN) > 512:
        _WARM_SEEN.popitem(last=False)
    # Best-effort warm-instance deduplication, NOT a transactional store.
    return False


def _menu() -> list:
    return [[{"text": "🎵 Как пользоваться", "callback_data": "help"}]]


def _back() -> list:
    return [[{"text": "🏠 В начало", "callback_data": "home"}]]


WELCOME = (
    "<b>🎵 Songs Requester · Яндекс Музыка</b>\n\n"
    "Пришли ссылку на отдельный трек или напиши исполнителя и название.\n\n"
    "Я найду композицию и проверю возможность передачи MP3.\n\n"
    "/help · /status · /diagnose"
)

HELP = (
    "<b>🎧 Инструкция</b>\n\n"
    "1. Пришли ссылку music.yandex.ru/album/123/track/456.\n"
    "2. Или напиши «Исполнитель — Название».\n"
    "3. Выбери композицию и нажми «⬇️ Скачать MP3».\n\n"
    "Доступен только незашифрованный MP3, если Яндекс разрешает его получение.\n"
    "/diagnose — диагностика соединения и прав.\n"
    "/start — главное меню."
)


def _track_text(track) -> str:
    return (
        "<b>🎵 " + esc(track.title) + "</b>\n"
        "👤 " + esc(track.artist) +
        ("\n💿 " + esc(track.album) if track.album else "") +
        "\n⏱ " + duration(track.duration_seconds) +
        "\n📀 Яндекс Музыка\n\n"
        "🎧 Доступность MP3 проверяется при загрузке."
    )


def _show_track(bot: TelegramApi, chat_id: int, track, message_id: int | None = None) -> None:
    keyboard = [
        [{"text": "⬇️ Скачать MP3", "callback_data": "d:" + track.id}],
        [{"text": "🔗 Открыть в Яндекс Музыке", "url": track.url}],
        [{"text": "🏠 В начало", "callback_data": "home"}],
    ]
    if message_id is not None:
        try:
            bot.edit_message(chat_id, message_id, _track_text(track), keyboard)
            return
        except TelegramError:
            pass
    bot.send_message(chat_id, _track_text(track), keyboard)


def _show_results(bot: TelegramApi, chat_id: int, query: str, tracks) -> None:
    if not tracks:
        bot.send_message(chat_id, "🔎 По запросу <b>" + esc(query) +
                         "</b> ничего не найдено.", _back())
        return
    keyboard = []
    for track in tracks[:5]:
        label = (track.artist + " — " + track.title)[:58]
        keyboard.append([{"text": label, "callback_data": "t:" + track.id}])
    keyboard.append([{"text": "🏠 В начало", "callback_data": "home"}])
    bot.send_message(chat_id, "<b>🔎 Результаты Яндекс Музыки</b>\n" +
                     esc(query) + "\n\nВыбери композицию:", keyboard)


def _send_audio(bot: TelegramApi, music: YandexProvider, chat_id: int, track) -> None:
    cached = _WARM_AUDIO.get(track.id)
    if cached:
        # This cache is per warm function instance; file_id persists on Telegram.
        try:
            bot._post("sendAudio", data={"chat_id": chat_id, "audio": cached})
            return
        except TelegramError:
            _WARM_AUDIO.pop(track.id, None)

    stream = music.download_raw_mp3(track.id)
    try:
        sent = bot.send_audio(chat_id, stream, title=track.title, artist=track.artist)
        fid = (sent.get("audio") or {}).get("file_id")
        if isinstance(fid, str) and fid:
            _WARM_AUDIO[track.id] = fid
            _WARM_AUDIO.move_to_end(track.id)
            while len(_WARM_AUDIO) > 64:
                _WARM_AUDIO.popitem(last=False)
    finally:
        stream.close()


def _process_message(update: dict, bot: TelegramApi, music: YandexProvider, chat_id: int) -> None:
    text = update.get("text")
    if not isinstance(text, str):
        return
    text = text.strip()
    command, _, argument = text.partition(" ")
    cmd = command.split("@", 1)[0].lower() if command.startswith("/") else ""
    if cmd in {"/start", "/menu"}:
        bot.send_message(chat_id, WELCOME, _menu())
    elif cmd == "/help":
        bot.send_message(chat_id, HELP, _back())
    elif cmd == "/status":
        bot.send_message(chat_id, "⚙️ <b>Yandex Cloud Functions</b>\n"
                         "OAuth: 🔑 загружен (доступ проверяется через /diagnose)\n"
                         "Режим: личный", _back())
    elif cmd == "/diagnose":
        bot.send_message(chat_id, "<b>🩺 Диагностика из Yandex Cloud</b>\n\n" +
                         "\n".join(music.diagnose()) +
                         "\n\nСтатусы не содержат токенов и данных аккаунта.", _back())
    elif cmd == "/id":
        bot.send_message(chat_id, "🆔 Telegram ID: <code>" + str(chat_id) + "</code>", _back())
    elif cmd and cmd != "/search":
        bot.send_message(chat_id, "Неизвестная команда. Используй /help.", _back())
    else:
        request = parse_request(argument if cmd == "/search" else text)
        try:
            if request.kind == "track":
                track = music.get_track(request.value)
                if track:
                    _show_track(bot, chat_id, track)
                else:
                    bot.send_message(chat_id, "🔎 Трек не найден.", _back())
            elif request.kind == "search":
                _show_results(bot, chat_id, request.value, music.search(request.value))
            else:
                bot.send_message(chat_id, "⚠️ Отправь ссылку на отдельный трек Яндекс Музыки или его название.", _back())
        except MusicError as exc:
            bot.send_message(chat_id, describe_error(safe_error_code(exc)), _back())


def _process_callback(query: dict, bot: TelegramApi, music: YandexProvider, chat_id: int) -> None:
    bot.callback_ack(query.get("id", ""), "Обрабатываю…")
    action = parse_callback(query.get("data"))
    if action.kind == "home":
        bot.send_message(chat_id, WELCOME, _menu())
        return
    if action.kind == "help":
        bot.send_message(chat_id, HELP, _back())
        return
    if action.kind == "invalid":
        bot.send_message(chat_id, "Кнопка устарела. Открой /start.", _back())
        return
    try:
        track = music.get_track(action.value)
        if not track:
            bot.send_message(chat_id, "🔎 Трек больше не найден.", _back())
        elif action.kind == "track":
            previous = query.get("message") or {}
            _show_track(bot, chat_id, track, previous.get("message_id"))
        else:
            _send_audio(bot, music, chat_id, track)
    except MusicError as exc:
        bot.send_message(chat_id, describe_error(safe_error_code(exc)), _back())


def _route_update(update: dict, bot: TelegramApi, music: YandexProvider, owner: int) -> None:
    message = update.get("message")
    callback = update.get("callback_query")
    if isinstance(message, dict):
        sender = message.get("from") or {}
        chat = message.get("chat") or {}
        if sender.get("id") != owner or chat.get("type") != "private" or chat.get("id") != owner:
            return
        _process_message(message, bot, music, owner)
    elif isinstance(callback, dict):
        sender = callback.get("from") or {}
        previous = callback.get("message") or {}
        chat = previous.get("chat") or {}
        if sender.get("id") != owner or chat.get("type") != "private" or chat.get("id") != owner:
            return
        _process_callback(callback, bot, music, owner)


def handler(event, context):
    if not isinstance(event, dict):
        return reply(400, "invalid event")
    method = event.get("httpMethod", "POST")
    if method == "GET":
        query = event.get("queryStringParameters") or {}
        if query.get("probe") != "1":
            return reply(200, '{"status":"ok","service":"songsrequester"}', content_type="application/json")
    if method not in ("POST", "GET"):
        return reply(405, "method not allowed")

    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    oauth = os.environ.get("YANDEX_OAUTH_TOKEN", "")
    secret = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
    raw_owner = os.environ.get("OWNER_TELEGRAM_ID", "")
    if not all((bot_token, oauth, secret, raw_owner)) or len(secret) < 24:
        return reply(503, "configuration missing")
    try:
        owner = int(raw_owner)
        if owner <= 0:
            raise ValueError()
    except ValueError:
        return reply(503, "configuration missing")
    if not _authorized(event, secret):
        return reply(403, "forbidden")

    if method == "GET":
        try:
            checks = YandexProvider(oauth).diagnose()
            return reply(200, json.dumps({"checks": checks}, ensure_ascii=False),
                         content_type="application/json")
        except Exception:
            LOG.warning("diagnostic unavailable")
            return reply(502, "probe unavailable")

    try:
        update = _body(event)
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError):
        return reply(400, "invalid update")
    update_id = update.get("update_id")
    if _seen(update_id):
        return reply(200, "OK")
    try:
        _route_update(update, TelegramApi(bot_token), YandexProvider(oauth), owner)
    except TelegramError:
        # Let Telegram retry after a transient outbound failure. In-memory
        # deduplication must not swallow that second delivery.
        _WARM_SEEN.pop(update_id, None)
        LOG.warning("telegram outbound request failed")
        return reply(503, "delivery unavailable")
    except Exception:
        _WARM_SEEN.pop(update_id, None)
        LOG.exception("handler failed: sanitized type only", exc_info=False)
        return reply(500, "internal error")
    return reply(200, "OK")
