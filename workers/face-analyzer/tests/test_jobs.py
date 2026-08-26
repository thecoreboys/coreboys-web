from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from face_analyzer.config import load_config
from face_analyzer.errors import DataError
from face_analyzer.jobs import (
    ClaimedJob,
    NoJobAvailable,
    _resolve_session,
    _validate_job_configuration,
    run_job,
    serve,
)
from face_analyzer.pipeline import RunSummary
from face_analyzer.retention import cleanup_local_retention

from helpers import write_config


class JobTests(unittest.TestCase):
    def test_job_configuration_cannot_supply_an_input_locator(self) -> None:
        with self.assertRaisesRegex(DataError, "unsupported"):
            _validate_job_configuration({"inputUri": "https://example.test/video"})
        self.assertEqual(_validate_job_configuration({"samplingFps": 5, "startMs": 10, "endMs": 20}), (200, 10, 20))

    def test_job_maps_content_to_one_protected_config_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            job = ClaimedJob(
                id="00000000-0000-0000-0000-000000000001",
                source_uuid="00000000-0000-0000-0000-000000000002",
                content_id="yt-testvideo",
                source_kind="archive",
                kind="archive_scan",
                configuration={},
                active_session_id="bio",
            )
            self.assertEqual(_resolve_session(config, job), "bio")

    def test_run_job_never_auto_approves_or_publishes(self) -> None:
        call_order: list[str] = []

        def claim_job(*_args: object, **_kwargs: object) -> ClaimedJob:
            call_order.append("claim")
            return job

        def heartbeat(*_args: object, **_kwargs: object) -> str:
            call_order.append("heartbeat")
            return "2026-01-01T00:00:00Z"

        class FakeLease:
            def __init__(self, *_args: object, **_kwargs: object) -> None:
                self.finished: list[str] = []

            def start(self) -> None:
                return None

            def checkpoint(self, *, force: bool = False) -> None:
                return None

            def finish(self, status: str, *, error: str | None = None) -> bool:
                self.finished.append(status)
                return True

        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            job = ClaimedJob(
                id="00000000-0000-0000-0000-000000000001",
                source_uuid="00000000-0000-0000-0000-000000000002",
                content_id="yt-testvideo",
                source_kind="archive",
                kind="archive_scan",
                configuration={"samplingFps": 2, "startMs": 0, "endMs": 5000},
                active_session_id="bio",
            )
            imported = {
                "approved": 0,
                "published": 0,
                "tracks_aggregated": 1,
            }
            with patch.dict(
                os.environ,
                {
                    "FACE_ANALYZER_ENABLED": "true",
                    "FACE_AUTOMATIC_MATCHING_ENABLED": "true",
                    "FACE_ANALYZER_WORKER_ID": "worker-a",
                },
                clear=True,
            ), patch("face_analyzer.jobs.configured_database_url", return_value="postgresql://localhost/db"), patch(
                "face_analyzer.jobs._claim_job", side_effect=claim_job
            ) as claim, patch("face_analyzer.jobs.JobLease", FakeLease), patch(
                "face_analyzer.jobs.verified_model_fingerprint",
                return_value={"yunet_sha256": "a" * 64, "sface_sha256": "b" * 64},
            ), patch(
                "face_analyzer.jobs.heartbeat_worker",
                side_effect=heartbeat,
            ), patch(
                "face_analyzer.jobs.run_biometric_analysis",
                return_value=RunSummary("biometric", 1, 1, 1, 0),
            ), patch("face_analyzer.jobs.import_proposals", return_value=imported) as importer:
                result = run_job(config, job.id, worker_id="worker-a")
            self.assertEqual(result["automatic_approvals"], 0)
            self.assertEqual(result["automatic_publications"], 0)
            self.assertEqual(importer.call_args.kwargs["job_id"], job.id)
            self.assertEqual(call_order[:2], ["heartbeat", "claim"])
            self.assertTrue(claim.call_args.kwargs["allow_automatic"])

    def test_manual_run_heartbeats_without_model_before_manual_only_claim(self) -> None:
        class FakeLease:
            def __init__(self, *_args: object, **_kwargs: object) -> None:
                pass

            def start(self) -> None:
                pass

            def checkpoint(self, *, force: bool = False) -> None:
                pass

            def finish(self, status: str, *, error: str | None = None) -> bool:
                return True

        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            job = ClaimedJob(
                id="00000000-0000-0000-0000-000000000001",
                source_uuid="00000000-0000-0000-0000-000000000002",
                content_id="yt-testvideo",
                source_kind="archive",
                kind="manual_review",
                configuration={"startMs": 0, "endMs": 5000},
                active_session_id="manual",
            )
            manual_path = config.runtime.data_dir / "manual-jobs" / f"{job.id}.json"
            manual_path.parent.mkdir(parents=True)
            manual_path.write_text("{}", encoding="utf-8")
            with patch.dict(
                os.environ,
                {"FACE_ANALYZER_WORKER_ID": "worker-a"},
                clear=True,
            ), patch(
                "face_analyzer.jobs.configured_database_url",
                return_value="postgresql://localhost/db",
            ), patch(
                "face_analyzer.jobs.heartbeat_worker",
                return_value="2026-01-01T00:00:00Z",
            ) as heartbeat, patch(
                "face_analyzer.jobs._claim_job",
                return_value=job,
            ) as claim, patch(
                "face_analyzer.jobs.JobLease", FakeLease
            ), patch(
                "face_analyzer.jobs.run_manual_analysis",
                return_value=RunSummary("manual", 1, 1, 1, 0),
            ), patch(
                "face_analyzer.jobs.import_proposals",
                return_value={"approved": 0, "published": 0},
            ):
                run_job(config, job.id, worker_id="worker-a")
        heartbeat.assert_called_once_with(
            "postgresql://localhost/db", "worker-a", None, status="healthy"
        )
        self.assertFalse(claim.call_args.kwargs["allow_automatic"])

    def test_service_reports_heartbeat_and_runs_maintenance_when_idle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            gates = {
                "FACE_ANALYZER_ENABLED": "true",
                "FACE_AUTOMATIC_MATCHING_ENABLED": "true",
                "FACE_ANALYZER_WORKER_ID": "worker-a",
            }
            with patch.dict(os.environ, gates, clear=True), patch(
                "face_analyzer.jobs.configured_database_url",
                return_value="postgresql://localhost/db",
            ), patch(
                "face_analyzer.jobs.verified_model_fingerprint",
                return_value={"yunet_sha256": "a" * 64, "sface_sha256": "b" * 64},
            ), patch(
                "face_analyzer.jobs.heartbeat_worker",
                return_value="2026-01-01T00:00:00Z",
            ) as heartbeat, patch(
                "face_analyzer.jobs.synchronize_db_purges",
                return_value={"purged": [], "requested": 0, "blocked": []},
            ) as sync, patch(
                "face_analyzer.jobs.cleanup_local_retention"
            ) as cleanup, patch(
                "face_analyzer.jobs.run_job",
                side_effect=NoJobAvailable("empty"),
            ):
                result = serve(config, worker_id="worker-a", _maximum_cycles=1)
        self.assertEqual(result["status"], "healthy")
        self.assertEqual(result["idle_polls"], 1)
        heartbeat.assert_called_once_with(
            "postgresql://localhost/db", "worker-a", "b" * 64, status="healthy"
        )
        sync.assert_called_once()
        cleanup.assert_called_once_with(config)

    def test_service_remains_available_for_manual_jobs_with_biometrics_off(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            with patch.dict(
                os.environ,
                {"FACE_ANALYZER_WORKER_ID": "worker-a"},
                clear=True,
            ), patch(
                "face_analyzer.jobs.configured_database_url",
                return_value="postgresql://localhost/db",
            ), patch(
                "face_analyzer.jobs.verified_model_fingerprint"
            ) as verify_models, patch(
                "face_analyzer.jobs.heartbeat_worker"
            ) as heartbeat, patch(
                "face_analyzer.jobs.synchronize_db_purges",
                return_value={"purged": [], "requested": 0, "blocked": []},
            ), patch(
                "face_analyzer.jobs.cleanup_local_retention"
            ), patch(
                "face_analyzer.jobs.run_job",
                side_effect=NoJobAvailable("empty"),
            ):
                result = serve(config, worker_id="worker-a", _maximum_cycles=1)
        self.assertEqual(result["status"], "manual_only")
        self.assertFalse(result["biometric_heartbeat_active"])
        verify_models.assert_not_called()
        heartbeat.assert_called_once_with(
            "postgresql://localhost/db", "worker-a", None, status="healthy"
        )

    def test_retention_cleanup_is_scoped_to_worker_owned_directories(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = load_config(write_config(root))
            manual_dir = config.runtime.data_dir / "manual-jobs"
            proposal_dir = config.runtime.data_dir / "job-proposals"
            manual_dir.mkdir(parents=True)
            proposal_dir.mkdir(parents=True)
            manual = manual_dir / "old.json"
            proposal = proposal_dir / "old.ndjson"
            unrelated = config.runtime.data_dir / "keep.txt"
            manual.write_text("{}", encoding="utf-8")
            proposal.write_text("{}", encoding="utf-8")
            unrelated.write_text("keep", encoding="utf-8")
            os.utime(manual, (1, 1))
            os.utime(proposal, (1, 1))
            result = cleanup_local_retention(config, now=40 * 24 * 60 * 60)
            self.assertEqual(result["manual_review_evidence_deleted"], ["old.json"])
            self.assertEqual(result["diagnostic_proposals_deleted"], ["old.ndjson"])
            self.assertTrue(unrelated.exists())


if __name__ == "__main__":
    unittest.main()
