from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from face_analyzer.config import load_config
from face_analyzer.errors import DataError, ExpiredEnrollmentError, ModelError, PolicyError
from face_analyzer.lifecycle import purge_local_enrollment, synchronize_db_purges
from face_analyzer.pipeline import enroll_identity, run_biometric_analysis
from face_analyzer.status import worker_status
from face_analyzer.store import EnrollmentStore, PurgeTombstoneStore

from helpers import write_config


class LifecycleTests(unittest.TestCase):
    def test_biometric_commands_are_disabled_by_default(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            with patch.dict(os.environ, {}, clear=True):
                with self.assertRaisesRegex(PolicyError, "FACE_ANALYZER_ENABLED"):
                    enroll_identity(config, "bio", "alice", [], replace=False, worker_id="test-worker")
                with self.assertRaisesRegex(PolicyError, "FACE_ANALYZER_ENABLED"):
                    run_biometric_analysis(config, "bio", maximum_frames=1)

    def test_matching_needs_second_explicit_gate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            with patch.dict(
                os.environ,
                {"FACE_ANALYZER_ENABLED": "true", "FACE_ANALYZER_WORKER_ID": "test-worker"},
                clear=True,
            ):
                with self.assertRaisesRegex(PolicyError, "FACE_AUTOMATIC_MATCHING_ENABLED"):
                    run_biometric_analysis(config, "bio", maximum_frames=1)

    def test_database_authority_is_required_unless_explicit_test_escape(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = load_config(write_config(root))
            images = []
            for name in ("front.jpg", "left.jpg", "right.jpg"):
                path = root / "enrollment" / name
                path.write_bytes(name.encode("ascii"))
                images.append(path)
            gates = {
                "FACE_ANALYZER_ENABLED": "true",
                "FACE_AUTOMATIC_MATCHING_ENABLED": "true",
                "FACE_ANALYZER_WORKER_ID": "test-worker",
            }
            with patch.dict(os.environ, gates, clear=True):
                with self.assertRaisesRegex(PolicyError, "FACE_ANALYZER_DATABASE_URL"):
                    enroll_identity(
                        config, "bio", "alice", images, replace=False, worker_id="test-worker"
                    )
                with self.assertRaisesRegex(PolicyError, "FACE_ANALYZER_DATABASE_URL"):
                    run_biometric_analysis(config, "bio", maximum_frames=1)
            with patch.dict(
                os.environ,
                {**gates, "FACE_ANALYZER_ALLOW_CONFIG_ONLY": "true"},
                clear=True,
            ):
                with self.assertRaises(ModelError):
                    run_biometric_analysis(config, "bio", maximum_frames=1)

    def test_expired_templates_are_deleted_before_use(self) -> None:
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
            with self.assertRaises(ExpiredEnrollmentError):
                store.templates({"alice"}, now=datetime(2028, 1, 1, tzinfo=timezone.utc))
            self.assertNotIn("alice", EnrollmentStore.metadata(path)["identities"])

    def test_explicit_purge_deletes_templates_and_writes_safe_audit(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = load_config(write_config(root))
            store = EnrollmentStore(
                config.runtime.enrollment_store,
                {"yunet_sha256": "a", "sface_sha256": "b"},
            )
            store.put(
                "alice",
                [[1, 0], [0.99, 0.01], [0.98, -0.01]],
                image_sha256=["1", "2", "3"],
                consent_granted_at="2026-01-01T00:00:00Z",
                consent_expires_at="2099-01-01T00:00:00Z",
                replace=False,
            )
            result = purge_local_enrollment(
                config,
                "alice",
                reason="subject revoked local enrollment",
                worker_id="test-worker",
            )
            payload = json.loads(config.runtime.audit_output.read_text(encoding="utf-8"))
            tombstones = json.loads(
                config.runtime.enrollment_store.with_name("purge-tombstones.json").read_text(encoding="utf-8")
            )
        self.assertTrue(result["deleted"])
        self.assertTrue(result["purge_tombstone_pending"])
        self.assertEqual(len(tombstones["records"]), 1)
        serialized = json.dumps(payload).lower()
        self.assertNotIn("embedding", serialized)
        self.assertNotIn("crop", serialized)
        self.assertEqual(payload["action"], "face.enrollment.local_purged")

    def test_interrupted_purge_deletes_locally_before_retry_attestation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = load_config(write_config(root))
            store = EnrollmentStore(
                config.runtime.enrollment_store,
                {"yunet_sha256": "a", "sface_sha256": "b"},
            )
            local = store.put(
                "alice",
                [[1, 0], [0.99, 0.01], [0.98, -0.01]],
                image_sha256=["1", "2", "3"],
                consent_granted_at="2026-01-01T00:00:00Z",
                consent_expires_at="2099-01-01T00:00:00Z",
                replace=False,
            )
            template_id = "00000000-0000-0000-0000-000000000040"
            store.bind_template_set("alice", template_id)
            tombstones = PurgeTombstoneStore(
                config.runtime.enrollment_store.with_name("purge-tombstones.json")
            )
            tombstones.begin(
                identity_id="alice",
                worker_id="test-worker",
                fingerprint=local["template_fingerprint"],
                template_set_id=template_id,
                reason="resume interrupted deletion",
            )
            with patch(
                "face_analyzer.authority.record_db_local_purge",
                return_value=True,
            ) as attest, patch(
                "face_analyzer.authority.list_db_purge_requests",
                return_value=[],
            ):
                result = synchronize_db_purges(config, worker_id="test-worker")
            remaining = EnrollmentStore.metadata(config.runtime.enrollment_store)["identities"]
            journal = json.loads(
                config.runtime.enrollment_store.with_name("purge-tombstones.json").read_text(encoding="utf-8")
            )
        self.assertNotIn("alice", remaining)
        self.assertEqual(result["tombstones_acknowledged"], ["alice"])
        self.assertEqual(journal["records"], {})
        self.assertTrue(attest.call_args.kwargs["deleted"])

    def test_duplicate_reference_bytes_are_rejected_before_model_load(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = load_config(write_config(root))
            images: list[Path] = []
            for name in ("front.jpg", "left.jpg", "right.jpg"):
                path = root / "enrollment" / name
                path.write_bytes(b"same-image-bytes")
                images.append(path)
            with patch.dict(
                os.environ,
                {"FACE_ANALYZER_ENABLED": "true", "FACE_ANALYZER_WORKER_ID": "test-worker"},
                clear=True,
            ):
                with self.assertRaisesRegex(DataError, "unique file contents"):
                    enroll_identity(
                        config, "bio", "alice", images, replace=False, worker_id="test-worker"
                    )

    def test_status_never_claims_integrated_ready_without_db(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            with patch.dict(
                os.environ,
                {
                    "FACE_ANALYZER_ENABLED": "true",
                    "FACE_AUTOMATIC_MATCHING_ENABLED": "true",
                },
                clear=True,
            ):
                result = worker_status(config, "bio")
        self.assertFalse(result["database_configured"])
        self.assertFalse(result["ready_for_integrated_biometric_matching"])
        self.assertTrue(result["operator_reference_bridge_required"])


if __name__ == "__main__":
    unittest.main()
