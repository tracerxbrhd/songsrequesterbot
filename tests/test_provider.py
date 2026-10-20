import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from yandex_provider import (
    YandexProvider, MusicError, safe_error_code, describe_error,
    trusted_audio_url, MAX_AUDIO_BYTES,
)


def fake_track(track_id="126278860"):
    return SimpleNamespace(
        id=int(track_id), title="Монополия",
        artists=[SimpleNamespace(name="Монеточка")],
        albums=[SimpleNamespace(title="Test")],
        duration_ms=205000,
    )


class ProviderTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.http = Mock()
        self.provider = YandexProvider("dummy-token", client=self.client, session=self.http)

    def test_metadata_uses_original_python_client(self):
        self.client.tracks.return_value = [fake_track()]
        track = self.provider.get_track("126278860")
        self.assertEqual(track.id, "126278860")
        self.assertEqual(track.artist, "Монеточка")
        self.client.tracks.assert_called_once_with(["126278860"])

    def test_search_uses_python_library(self):
        self.client.search.return_value = SimpleNamespace(
            tracks=SimpleNamespace(results=[fake_track(), fake_track()])
        )
        found = self.provider.search("Монеточка")
        self.assertEqual(len(found), 1)
        self.client.search.assert_called_once_with("Монеточка", type_="track")

    def test_raw_mp3_requires_unencrypted_transport(self):
        self.client.tracks_file_info.return_value = SimpleNamespace(download_info=SimpleNamespace(
            transport="encraw", codec="mp3", url="https://media.strm.yandex.net/music-v2/raw/abc"
        ))
        with self.assertRaises(MusicError) as raised:
            self.provider.raw_mp3_url("126278860")
        self.assertEqual(str(raised.exception), "RAW_MP3_UNAVAILABLE")
        self.assertEqual(self.client.tracks_file_info.call_count, 2)
        self.assertEqual(self.client.tracks_file_info.call_args.kwargs["transport"], "raw")
        self.assertEqual(self.client.tracks_file_info.call_args.kwargs["codecs"], ["mp3"])

    def test_raw_mp3_valid_url(self):
        raw = "https://media.strm.yandex.net/music-v2/raw/x.mp3?token=test"
        self.client.tracks_file_info.return_value = SimpleNamespace(download_info=SimpleNamespace(
            transport="raw", codec="mp3", url=raw, urls=[]
        ))
        self.assertEqual(self.provider.raw_mp3_url("126278860"), raw)
        self.assertTrue(trusted_audio_url(raw))
        self.assertFalse(trusted_audio_url("http://media.strm.yandex.net/music-v2/raw/x"))
        self.assertFalse(trusted_audio_url("https://strm.yandex.net.evil.io/music-v2/raw/x"))

    def test_raw_response_is_a_valid_mp3_file(self):
        url = "https://media.strm.yandex.net/music-v2/raw/x.mp3"
        self.client.tracks_file_info.return_value = SimpleNamespace(download_info=SimpleNamespace(
            transport="raw", codec="mp3", url=url, urls=[]
        ))
        resp = Mock(status_code=200, headers={"Content-Length": "9"})
        resp.iter_content.return_value = [b"ID3", b"\x04\x00\x00\x00\x00\x00"]
        self.http.get.return_value = resp
        content = self.provider.download_raw_mp3("126278860")
        try:
            self.assertEqual(content.read(3), b"ID3")
        finally:
            content.close()
        self.http.get.assert_called_once_with(url, timeout=(5, 12),
                                               stream=True, allow_redirects=False)

    def test_large_files_are_not_buffered(self):
        url = "https://media.strm.yandex.net/music-v2/raw/x.mp3"
        self.client.tracks_file_info.return_value = SimpleNamespace(download_info=SimpleNamespace(
            transport="raw", codec="mp3", url=url, urls=[]
        ))
        resp = Mock(status_code=200, headers={"Content-Length": str(MAX_AUDIO_BYTES + 1)})
        self.http.get.return_value = resp
        with self.assertRaises(MusicError) as raised:
            self.provider.download_raw_mp3("126278860")
        self.assertEqual(str(raised.exception), "AUDIO_TOO_LARGE")

    def test_safe_errors_do_not_echo_api_bodies(self):
        err = Exception("some private JSON data (451): token=sensitive")
        self.assertEqual(safe_error_code(err), "HTTP_451")
        self.assertNotIn("sensitive", describe_error(safe_error_code(err)))
