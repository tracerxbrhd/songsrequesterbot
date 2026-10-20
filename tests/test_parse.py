import unittest

from parse import parse_request, parse_callback, music_url


class ParsingTests(unittest.TestCase):
    def test_real_share_link(self):
        url = ("https://music.yandex.ru/album/31348570/track/126278860"
               "?utm_medium=copy_link&ref_id=05e01435-563e-405b-ae60-2d99edc7acfe")
        self.assertEqual((parse_request(url).kind, parse_request(url).value),
                         ("track", "126278860"))
        self.assertEqual(parse_request("https://music.yandex.ru/track/126278860").value,
                         "126278860")

    def test_search_and_unrelated_providers(self):
        self.assertEqual(parse_request("Монеточка  Монополия").value, "Монеточка Монополия")
        self.assertEqual(parse_request("https://www.jamendo.com/track/15").kind, "unsupported")
        self.assertEqual(parse_request("https://open.spotify.com/track/15").kind, "unsupported")

    def test_hostile_urls(self):
        for value in (
            "http://music.yandex.ru/track/15",
            "https://music.yandex.ru.evil.example/track/15",
            "https://evil@music.yandex.ru/track/15",
            "https://music.yandex.ru:8080/track/15",
            "file:///etc/passwd",
            "https://music.yandex.ru/album/1/track/0",
            "https://music.yandex.ru/track/15\nother",
        ):
            with self.subTest(value=value):
                self.assertNotEqual(parse_request(value).kind, "track")

    def test_callback_and_music_link(self):
        self.assertEqual(parse_callback("t:126278860").kind, "track")
        self.assertEqual(parse_callback("d:126278860").kind, "download")
        self.assertEqual(parse_callback("track:y:126278860").kind, "track")
        self.assertEqual(parse_callback("download:y:126278860").kind, "download")
        self.assertEqual(parse_callback("download:j:123").kind, "invalid")
        self.assertEqual(music_url("12"), "https://music.yandex.ru/track/12")
