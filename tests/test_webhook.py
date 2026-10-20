import base64
import json
import os
import unittest
from unittest.mock import patch, Mock

import index


TOKEN = "123456:test-bot-token"
SECRET = "A" * 32
OWNER = 123456789


def event(payload=None, *, method="POST", key=SECRET, encoded=False):
    body = json.dumps(payload if payload is not None else {}, ensure_ascii=False)
    if encoded:
        body = base64.b64encode(body.encode()).decode("ascii")
    return {
        "httpMethod": method,
        "isBase64Encoded": encoded,
        "headers": {"X-Telegram-Bot-Api-Secret-Token": key},
        "queryStringParameters": {},
        "body": body,
    }


class WebhookTests(unittest.TestCase):
    def setUp(self):
        self.environ = patch.dict(os.environ, {
            "TELEGRAM_BOT_TOKEN": TOKEN,
            "YANDEX_OAUTH_TOKEN": "test",
            "TELEGRAM_WEBHOOK_SECRET": SECRET,
            "OWNER_TELEGRAM_ID": str(OWNER),
        })
        self.environ.start()
        index._WARM_SEEN.clear()
        index._WARM_AUDIO.clear()
        self.addCleanup(self.environ.stop)

    def test_health_does_not_expose_configuration(self):
        result = index.handler(event(method="GET", key=""), None)
        self.assertEqual(result["statusCode"], 200)
        self.assertNotIn(TOKEN, result["body"])

    def test_wrong_secret_blocks_updates_before_sending(self):
        update = {"update_id": 2, "message": {"from": {"id": OWNER},
                  "chat": {"id": OWNER, "type": "private"}, "text": "/start"}}
        with patch("index.TelegramApi") as telegram:
            result = index.handler(event(update, key="wrong"), None)
            self.assertEqual(result["statusCode"], 403)
            telegram.assert_not_called()

    def test_non_owner_is_ignored_even_if_header_valid(self):
        update = {"update_id": 3, "message": {"from": {"id": OWNER + 1},
                  "chat": {"id": OWNER + 1, "type": "private"}, "text": "/start"}}
        with patch("index.TelegramApi") as telegram:
            result = index.handler(event(update), None)
            self.assertEqual(result["statusCode"], 200)
            telegram.return_value.send_message.assert_not_called()

    def test_owner_start_works_and_warm_update_replay_is_ignored(self):
        update = {"update_id": 4, "message": {"from": {"id": OWNER},
                  "chat": {"id": OWNER, "type": "private"}, "text": "/start"}}
        with patch("index.TelegramApi") as telegram, patch("index.YandexProvider"):
            first = index.handler(event(update, encoded=True), None)
            second = index.handler(event(update), None)
        self.assertEqual(first["statusCode"], 200)
        self.assertEqual(second["statusCode"], 200)
        telegram.return_value.send_message.assert_called_once()

    def test_diagnostic_probe_requires_secret(self):
        probe = event(method="GET", key="")
        probe["queryStringParameters"] = {"probe": "1"}
        self.assertEqual(index.handler(probe, None)["statusCode"], 403)

        probe["headers"]["X-Telegram-Bot-Api-Secret-Token"] = SECRET
        with patch("index.YandexProvider") as music:
            music.return_value.diagnose.return_value = [
                "OAuth: ✅ OK", "Каталог: ❌ HTTP_451",
                "Поиск: ❌ HTTP_451", "MP3 raw: ❌ HTTP_403"
            ]
            result = index.handler(probe, None)
        self.assertEqual(result["statusCode"], 200)
        self.assertIn("HTTP_451", result["body"])
        self.assertNotIn("test-bot-token", result["body"])

    def test_configuration_fail_closed(self):
        os.environ.pop("OWNER_TELEGRAM_ID")
        result = index.handler(event({"update_id": 9}), None)
        self.assertEqual(result["statusCode"], 503)

    def test_invalid_json_does_not_crash(self):
        request = event()
        request["body"] = "{not-json"
        self.assertEqual(index.handler(request, None)["statusCode"], 400)

    def test_outbound_failure_may_be_retried_by_telegram(self):
        from telegram_api import TelegramError
        update = {"update_id": 7777, "message": {"from": {"id": OWNER},
                  "chat": {"id": OWNER, "type": "private"}, "text": "/start"}}
        with patch("index.TelegramApi") as telegram, patch("index.YandexProvider"):
            telegram.return_value.send_message.side_effect = [
                TelegramError("fail"), None
            ]
            first = index.handler(event(update), None)
            second = index.handler(event(update), None)
        self.assertEqual(first["statusCode"], 503)
        self.assertEqual(second["statusCode"], 200)
        self.assertEqual(telegram.return_value.send_message.call_count, 2)
