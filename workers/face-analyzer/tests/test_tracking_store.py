from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from face_analyzer.errors import DataError, ModelError
from face_analyzer.store import EnrollmentStore, EventWriter, PresenceEvent
from face_analyzer.tracking import IoUTracker, ManualTimeline
from face_analyzer.vision import verify_model
from face_analyzer.config import ModelSpec


class TrackingAndStoreTests(unittest.TestCase):
    def test_iou_tracker_keeps_geometry_only_track_id(self) -> None:
        tracker = IoUTracker(minimum_iou=0.2, maximum_age_ms=1000)
        first = tracker.update(0, [(10, 10, 100, 100)])[0]
        second = tracker.update(500, [(15, 12, 100, 100)])[0]
        self.assertEqual(first.track_id, second.track_id)
        self.assertEqual(second.track_id, "face-1")

    def test_manual_timeline_interpolates_and_supports_unknown(self) -> None:
        payload = {
            "version": 1,
            "coordinate_space": "normalized",
            "tracks": [
                {
                    "track_id": "seat-left",
                    "identity_id": "alice",
                    "keyframes": [
                        {"pts_ms": 0, "bbox": [0.0, 0.1, 0.2, 0.4]},
                        {"pts_ms": 1000, "bbox": [0.2, 0.1, 0.2, 0.4]},
                    ],
                },
                {
                    "track_id": "guest",
                    "identity_id": None,
                    "keyframes": [
                        {"pts_ms": 0, "bbox": [0.6, 0.1, 0.2, 0.4]},
                        {"pts_ms": 1000, "bbox": [0.6, 0.1, 0.2, 0.4]},
                    ],
                },
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tracks.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            timeline = ManualTimeline.load(path, {"alice"})
            middle = timeline.positions_at(500)
        self.assertEqual(len(middle), 2)
        self.assertAlmostEqual(middle[0][1][0], 0.1)
        self.assertIsNone(middle[1][0].identity_id)

    def test_manual_identity_outside_allowlist_is_refused(self) -> None:
        payload = {
            "version": 1,
            "coordinate_space": "normalized",
            "tracks": [
                {
                    "track_id": "bad",
                    "identity_id": "mallory",
                    "keyframes": [
                        {"pts_ms": 0, "bbox": [0.1, 0.1, 0.2, 0.2]},
                        {"pts_ms": 1000, "bbox": [0.1, 0.1, 0.2, 0.2]},
                    ],
                }
            ],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tracks.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(DataError, "allowlist"):
                ManualTimeline.load(path, {"alice"})

    def test_enrollment_store_rejects_model_fingerprint_change(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "enrollments.json"
            store = EnrollmentStore(path, {"yunet_sha256": "a", "sface_sha256": "b"})
            store.put(
                "alice",
                [[1, 0], [0.99, 0.01], [0.98, -0.01]],
                image_sha256=["1", "2", "3"],
                consent_granted_at="2026-01-01T00:00:00Z",
                consent_expires_at="2027-01-01T00:00:00Z",
                replace=False,
            )
            with self.assertRaisesRegex(DataError, "fingerprint"):
                EnrollmentStore(path, {"yunet_sha256": "a", "sface_sha256": "changed"})

    def test_store_fingerprint_is_safe_metadata_and_detects_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "enrollments.json"
            store = EnrollmentStore(path, {"yunet_sha256": "a", "sface_sha256": "b"})
            result = store.put(
                "alice",
                [[1, 0], [0.99, 0.01], [0.98, -0.01]],
                image_sha256=["1", "2", "3"],
                consent_granted_at="2026-01-01T00:00:00Z",
                consent_expires_at="2099-01-01T00:00:00Z",
                replace=False,
            )
            metadata = EnrollmentStore.metadata(path)["identities"]["alice"]
            self.assertEqual(len(result["template_fingerprint"]), 64)
            self.assertEqual(metadata["template_fingerprint"], result["template_fingerprint"])
            self.assertNotIn("template_fingerprint_key", metadata)
            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["identities"]["alice"]["embeddings"][0][0] = 0.5
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(DataError, "integrity"):
                EnrollmentStore.metadata(path)

    def test_stale_store_instance_cannot_resurrect_a_purged_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "enrollments.json"
            fingerprint = {"yunet_sha256": "a", "sface_sha256": "b"}
            first = EnrollmentStore(path, fingerprint)
            for identity_id, offset in (("alice", 0.0), ("bob", 0.1)):
                first.put(
                    identity_id,
                    [[1, offset], [0.99, offset + 0.01], [0.98, offset + 0.02]],
                    image_sha256=[f"{identity_id}-1", f"{identity_id}-2", f"{identity_id}-3"],
                    consent_granted_at="2026-01-01T00:00:00Z",
                    consent_expires_at="2099-01-01T00:00:00Z",
                    replace=False,
                )
            stale_second_instance = EnrollmentStore(path, fingerprint)
            self.assertTrue(EnrollmentStore.purge_identity(path, "bob")["deleted"])
            stale_second_instance.put(
                "carol",
                [[0, 1], [0.01, 0.99], [0.02, 0.98]],
                image_sha256=["carol-1", "carol-2", "carol-3"],
                consent_granted_at="2026-01-01T00:00:00Z",
                consent_expires_at="2099-01-01T00:00:00Z",
                replace=False,
            )
            identities = EnrollmentStore.metadata(path)["identities"]
        self.assertEqual(set(identities), {"alice", "carol"})
        self.assertNotIn("bob", identities)

    def test_unknown_event_has_no_biometric_or_image_payload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "events.ndjson"
            writer = EventWriter(path)
            writer.append(
                PresenceEvent(
                    schema_version=1,
                    session_id="session",
                    source_id="source",
                    media_pts_ms=1000,
                    track_id="face-1",
                    state="unknown",
                    identity_id=None,
                    bbox_normalized=(0.1, 0.2, 0.3, 0.4),
                    match_reason="below_similarity_threshold",
                    top_score=0.3,
                    runner_up_score=0.2,
                )
            )
            payload = json.loads(path.read_text(encoding="utf-8"))
        serialized = json.dumps(payload).lower()
        self.assertNotIn("embedding", serialized)
        self.assertNotIn("crop", serialized)
        self.assertNotIn("image", serialized)
        self.assertNotIn("profile_path", payload)
        self.assertNotIn("social_accounts", payload)
        self.assertNotIn("display_name", payload)

    def test_model_placeholder_fails_before_opencv_load(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            spec = ModelSpec(Path(directory) / "missing.onnx", "NOT_CONFIGURED")
            with self.assertRaisesRegex(ModelError, "SHA-256"):
                verify_model(spec, "fixture")


if __name__ == "__main__":
    unittest.main()
