"""Narrow Telegram Bot API adapter. Does not log URLs or request payloads."""
from __future__ import annotations

import json
import requests


class TelegramError(Exception):
    pass


class TelegramApi:
    def __init__(self, token: str, session=None) -> None:
        if not token or ":" not in token:
            raise ValueError("Bot API token is not configured")
        self._base = "https://api.telegram.org/bot" + token + "/"
        self._http = session or requests.Session()

    def _post(self, method: str, *, data: dict, files=None, timeout=12) -> dict:
        try:
            response = self._http.post(
                self._base + method,
                data=data,
                files=files,
                timeout=(5, timeout),
            )
            response.raise_for_status()
            result = response.json()
            if not result.get("ok"):
                raise TelegramError("telegram rejected request")
            return result.get("result") or {}
        except (requests.RequestException, ValueError) as exc:
            raise TelegramError("telegram request failed") from None

    def send_message(self, chat_id: int, text: str, keyboard: list | None = None) -> dict:
        data = {
            "chat_id": chat_id,
            "text": text[:4000],
            "parse_mode": "HTML",
            "link_preview_options": json.dumps({"is_disabled": True}),
        }
        if keyboard is not None:
            data["reply_markup"] = json.dumps({"inline_keyboard": keyboard}, ensure_ascii=False)
        return self._post("sendMessage", data=data)

    def edit_message(self, chat_id: int, message_id: int, text: str, keyboard: list) -> dict:
        return self._post("editMessageText", data={
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text[:4000],
            "parse_mode": "HTML",
            "reply_markup": json.dumps({"inline_keyboard": keyboard}, ensure_ascii=False),
            "link_preview_options": json.dumps({"is_disabled": True}),
        })

    def callback_ack(self, query_id: str, message: str = "") -> None:
        try:
            self._post("answerCallbackQuery", data={
                "callback_query_id": query_id,
                "text": message[:180],
            }, timeout=5)
        except TelegramError:
            # Expired callback should not prevent the underlying operation.
            pass

    def send_audio(self, chat_id: int, file_obj, *, title: str, artist: str) -> dict:
        result = self._post("sendAudio", data={
            "chat_id": chat_id,
            "title": title[:64],
            "performer": artist[:64],
        }, files={"audio": ("track.mp3", file_obj, "audio/mpeg")}, timeout=22)
        return result
