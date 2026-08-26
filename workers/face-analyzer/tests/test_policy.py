from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from face_analyzer.config import ConfigError, load_config
from face_analyzer.errors import PolicyError
from face_analyzer.policy import authorize_run

from helpers import config_payload, write_config


class PolicyTests(unittest.TestCase):
    def test_authorizes_controlled_local_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            result = authorize_run(config, "bio", expected_mode="biometric")
            self.assertEqual(result.source.id, "vod")
            self.assertTrue(Path(result.input_uri).is_absolute())
            self.assertEqual(set(result.identities), {"alice", "bob"})

    def test_refuses_missing_all_visible_consent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = config_payload()
            payload["sources"][0]["all_visible_participants_consented"] = False
            config = load_config(write_config(Path(directory), payload))
            with self.assertRaisesRegex(PolicyError, "all-visible-participants"):
                authorize_run(config, "bio")

    def test_refuses_remote_hls_even_when_source_flag_is_true(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = config_payload()
            payload["sources"][0].update(
                {"kind": "hls", "uri": "https://example.com/private/feed.m3u8"}
            )
            config = load_config(write_config(Path(directory), payload))
            with self.assertRaisesRegex(PolicyError, "loopback"):
                authorize_run(config, "bio")

    def test_refuses_file_outside_media_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = config_payload()
            payload["sources"][0]["uri"] = "outside.mp4"
            (root / "outside.mp4").write_bytes(b"fixture")
            config = load_config(write_config(root, payload))
            with self.assertRaisesRegex(PolicyError, "outside"):
                authorize_run(config, "bio")

    def test_manual_mode_does_not_require_biometric_consent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = config_payload()
            for identity in payload["identities"]:
                identity["consent"]["biometric_template"] = False
                identity["consent"]["archive_matching"] = False
                identity["consent"]["public_tag"] = False
            config = load_config(write_config(Path(directory), payload))
            result = authorize_run(config, "manual", expected_mode="manual")
            self.assertEqual(result.session.mode, "manual")

    def test_private_biometric_review_does_not_require_public_tag(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = config_payload()
            for identity in payload["identities"]:
                identity["consent"]["public_tag"] = False
            config = load_config(write_config(Path(directory), payload))
            result = authorize_run(config, "bio", expected_mode="biometric")
            self.assertEqual(result.session.mode, "biometric")

    def test_all_source_participants_need_matching_consent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = config_payload()
            payload["identities"][1]["consent"]["archive_matching"] = False
            payload["sessions"][0]["identity_allowlist"] = ["alice"]
            config = load_config(write_config(Path(directory), payload))
            with self.assertRaisesRegex(PolicyError, "source participant bob"):
                authorize_run(config, "bio", expected_mode="biometric")

    def test_expired_session_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            with self.assertRaisesRegex(PolicyError, "expired"):
                authorize_run(
                    config,
                    "bio",
                    now=datetime(2100, 1, 1, tzinfo=timezone.utc),
                )

    def test_review_only_cannot_be_disabled(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = config_payload()
            payload["runtime"]["review_only"] = False
            with self.assertRaisesRegex(ConfigError, "review_only"):
                load_config(write_config(Path(directory), payload))


if __name__ == "__main__":
    unittest.main()
