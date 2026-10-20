import unittest
from unittest.mock import Mock

from tools.activate_webhook import cutover


SECRET_VALUES = {
    "TELEGRAM_BOT_TOKEN": "123456:dummy-token",
    "TELEGRAM_WEBHOOK_SECRET": "Z" * 32,
}


def yc_fake(*args):
    return '{"http_invoke_url":"https://functions.yandexcloud.net/test-function"}'


def secret_fake(secret_id, version_id, name):
    return SECRET_VALUES[name]


def mock_probe(lines):
    response = Mock()
    response.json.return_value = {"checks": lines}
    response.raise_for_status.return_value = None
    return response


class CutoverTests(unittest.TestCase):
    def test_http_451_does_not_switch_webhook(self):
        http = Mock()
        http.get.return_value = mock_probe([
            "OAuth: ✅ OK", "Каталог: ❌ HTTP_451",
            "Поиск: ❌ HTTP_451", "MP3 raw: ❌ HTTP_403",
        ])
        with self.assertRaises(RuntimeError):
            cutover("f", "s", "v", http=http, yc_fn=yc_fake, secrets_fn=secret_fake)
        http.post.assert_not_called()

    def test_mp3_unavailable_requires_explicit_metadata_only(self):
        http = Mock()
        http.get.return_value = mock_probe([
            "OAuth: ✅ OK", "Каталог: ✅ OK",
            "Поиск: ✅ OK", "MP3 raw: ❌ HTTP_403",
        ])
        with self.assertRaises(RuntimeError):
            cutover("f", "s", "v", http=http, yc_fn=yc_fake, secrets_fn=secret_fake)
        http.post.assert_not_called()

    def test_successful_preflight_switches_and_confirms_webhook(self):
        http = Mock()
        http.get.side_effect = [
            mock_probe(["OAuth: ✅ OK", "Каталог: ✅ OK",
                        "Поиск: ✅ OK", "MP3 raw: ✅ OK"]),
            Mock(**{"json.return_value": {"result": {
                "url": "https://functions.yandexcloud.net/test-function"}}
                })
        ]
        http.post.return_value = Mock(**{"json.return_value": {"ok": True}})
        cutover("f", "s", "v", http=http, yc_fn=yc_fake, secrets_fn=secret_fake)
        self.assertEqual(http.post.call_count, 1)
        kwargs = http.post.call_args.kwargs
        self.assertEqual(kwargs["json"]["max_connections"], 1)
        self.assertEqual(kwargs["json"]["drop_pending_updates"], False)
        self.assertEqual(kwargs["json"]["secret_token"], SECRET_VALUES["TELEGRAM_WEBHOOK_SECRET"])
