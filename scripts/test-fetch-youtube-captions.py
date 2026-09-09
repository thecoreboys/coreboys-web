"""Offline contract tests: caption acquisition never downloads video or crosses channels."""
import contextlib
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.modules.setdefault("yt_dlp", types.SimpleNamespace(YoutubeDL=None))
spec = importlib.util.spec_from_file_location("captions", pathlib.Path(__file__).with_name("fetch-youtube-captions.py"))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
VIDEO = "s0r7eNZqnY0"
CHANNEL = "UC6H8_DvqnEp1tYEp10GzH0g"


class CaptionTests(unittest.TestCase):
    def acquire(self, info):
        processed = []
        with tempfile.TemporaryDirectory(prefix="caption-contract-") as folder:
            class Downloader:
                def __init__(self, options):
                    self.options = options
                    assert options["skip_download"] is True
                    assert options["noplaylist"] is True
                    assert "cookiefile" not in options
                def __enter__(self):
                    return self
                def __exit__(self, *_args):
                    return False
                def extract_info(self, url, download):
                    assert download is False
                    assert url == f"https://www.youtube.com/watch?v={VIDEO}"
                    return info
                def process_info(self, value):
                    processed.append(value)
                    for language in value["requested_subtitles"]:
                        pathlib.Path(folder, f"{VIDEO}.{language}.json3").write_text('{"events": []}')
            with patch.object(worker.yt_dlp, "YoutubeDL", Downloader), patch.object(sys, "argv", [
                "captions", "--video-id", VIDEO, "--channel-id", CHANNEL, "--output-dir", folder
            ]), contextlib.redirect_stdout(io.StringIO()) as output:
                worker.main()
            return json.loads(output.getvalue()), processed

    def info(self, **overrides):
        return {"id": VIDEO, "channel_id": CHANNEL, "availability": "public",
                "requested_subtitles": {"en-orig": {}, "es": {}}, **overrides}

    def test_only_original_track_is_written(self):
        result, processed = self.acquire(self.info())
        self.assertEqual(result["kind"], "automatic")
        self.assertEqual(list(processed[0]["requested_subtitles"]), ["en-orig"])

    def test_manual_english_is_preferred(self):
        result, processed = self.acquire(self.info(subtitles={"en": [{}]}, requested_subtitles={"en": {}, "en-orig": {}}))
        self.assertEqual(result["kind"], "manual")
        self.assertEqual(list(processed[0]["requested_subtitles"]), ["en"])

    def test_other_channel_rejected_before_writing(self):
        with self.assertRaisesRegex(ValueError, "source_channel_mismatch"):
            self.acquire(self.info(channel_id="UC0000000000000000000000"))

    def test_live_and_private_sources_rejected(self):
        for override in ({"is_live": True}, {"availability": "subscriber_only"}):
            with self.assertRaises(ValueError):
                self.acquire(self.info(**override))

    def test_missing_original_is_not_translated(self):
        result, processed = self.acquire(self.info(requested_subtitles={"en": {}}))
        self.assertEqual(result["status"], "unavailable")
        self.assertEqual(processed, [])


if __name__ == "__main__":
    unittest.main()
