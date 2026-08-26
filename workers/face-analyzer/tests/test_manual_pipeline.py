from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from face_analyzer.config import load_config
from face_analyzer.media import DecodedFrame
from face_analyzer.pipeline import run_manual_analysis

from helpers import write_config


class ManualPipelineTests(unittest.TestCase):
    def test_manual_mode_uses_media_pts_and_never_loads_biometrics(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = load_config(write_config(root))
            timeline_path = root / "tracks.json"
            timeline_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "coordinate_space": "normalized",
                        "tracks": [
                            {
                                "track_id": "left",
                                "identity_id": "alice",
                                "keyframes": [
                                    {"pts_ms": 1000, "bbox": [0.1, 0.1, 0.2, 0.4]},
                                    {"pts_ms": 2000, "bbox": [0.2, 0.1, 0.2, 0.4]},
                                ],
                            },
                            {
                                "track_id": "guest",
                                "identity_id": None,
                                "keyframes": [
                                    {"pts_ms": 1000, "bbox": [0.6, 0.1, 0.2, 0.4]},
                                    {"pts_ms": 2000, "bbox": [0.6, 0.1, 0.2, 0.4]},
                                ],
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            frames = [
                DecodedFrame(1250, None, 1920, 1080),
                DecodedFrame(1750, None, 1920, 1080),
            ]
            with patch("face_analyzer.pipeline.iter_sampled_frames", return_value=iter(frames)):
                # If manual analysis accidentally constructs OpenCVFaceEngine, this
                # patch turns that regression into an immediate test failure.
                with patch(
                    "face_analyzer.pipeline.OpenCVFaceEngine",
                    side_effect=AssertionError("manual mode loaded biometric models"),
                ):
                    summary = run_manual_analysis(config, "manual", timeline_path)

            events = [
                json.loads(line)
                for line in config.runtime.event_output.read_text(encoding="utf-8").splitlines()
            ]
        self.assertEqual(summary.frames_analyzed, 2)
        self.assertEqual(summary.recognized_proposals, 2)
        self.assertEqual(summary.unknown_proposals, 2)
        self.assertEqual({event["media_pts_ms"] for event in events}, {1250, 1750})
        self.assertTrue(all(event["review_status"] == "proposed" for event in events))
        self.assertTrue(all("profile_path" not in event for event in events))
        self.assertTrue(all("social_accounts" not in event for event in events))
        self.assertTrue(all("display_name" not in event for event in events))


if __name__ == "__main__":
    unittest.main()
