from __future__ import annotations

import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from face_analyzer.bridge import (
    ProposalSample,
    aggregate_samples,
    import_proposals,
    load_proposal_samples,
    validate_local_database_url,
)
from face_analyzer.errors import DataError, PolicyError
from face_analyzer.config import load_config

from helpers import write_config


def sample(
    pts_ms: int,
    *,
    identity_id: str | None,
    state: str,
    track_id: str = "face-1",
) -> ProposalSample:
    return ProposalSample(
        session_id="session",
        source_id="source",
        media_pts_ms=pts_ms,
        track_id=track_id,
        state=state,
        identity_id=identity_id,
        bbox=(0.1, 0.2, 0.3, 0.4),
        top_score=0.9 if identity_id else None,
        runner_up_score=0.2 if identity_id else None,
    )


class BridgeTests(unittest.TestCase):
    def test_aggregation_is_idempotent_and_uses_pts(self) -> None:
        early_unknown = sample(1000, identity_id=None, state="unknown")
        accepted = sample(1500, identity_id="alice", state="recognized")
        tracks = aggregate_samples(
            [early_unknown, accepted, accepted],
            session_mode="biometric",
            sample_interval_ms=500,
        )
        self.assertEqual(len(tracks), 2)
        unknown_track, track = tracks
        self.assertIsNone(unknown_track.identity_id)
        self.assertEqual((unknown_track.start_ms, unknown_track.end_ms), (1000, 1500))
        self.assertEqual(track.sample_count, 1)
        self.assertEqual((track.start_ms, track.end_ms), (1500, 2000))
        self.assertEqual(track.identity_id, "alice")
        self.assertEqual(track.state, "proposed")
        repeated = aggregate_samples(
            [accepted, early_unknown, accepted],
            session_mode="biometric",
            sample_interval_ms=500,
        )[1]
        self.assertEqual(track.external_track_ref, repeated.external_track_ref)

    def test_identity_change_refuses_entire_track(self) -> None:
        with self.assertRaisesRegex(DataError, "changed identity"):
            aggregate_samples(
                [
                    sample(0, identity_id="alice", state="recognized"),
                    sample(500, identity_id="bob", state="recognized"),
                ],
                session_mode="biometric",
                sample_interval_ms=500,
            )

    def test_proposal_reader_rejects_profile_and_social_payload(self) -> None:
        payload = {
            "schema_version": 1,
            "session_id": "session",
            "source_id": "source",
            "media_pts_ms": 0,
            "track_id": "face-1",
            "state": "recognized",
            "identity_id": "alice",
            "display_name": "Alice",
            "bbox_normalized": [0.1, 0.1, 0.2, 0.3],
            "match_reason": "temporal_consensus_passed",
            "top_score": 0.9,
            "runner_up_score": 0.2,
            "review_status": "proposed",
            "profile_path": "/m/alice",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "events.ndjson"
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(DataError, "profile"):
                load_proposal_samples(
                    path,
                    session_id="session",
                    source_id="source",
                    allowed_identity_ids=frozenset({"alice"}),
                )

    def test_database_bridge_is_loopback_only(self) -> None:
        local = "postgresql://worker:secret@127.0.0.1:5432/core"
        self.assertEqual(validate_local_database_url(local), local)
        with self.assertRaisesRegex(PolicyError, "loopback"):
            validate_local_database_url("postgresql://worker:secret@db.example.com/core")
        with self.assertRaisesRegex(PolicyError, "override"):
            validate_local_database_url(
                "postgresql://worker:secret@127.0.0.1:5432/core?hostaddr=8.8.8.8"
            )

    def test_db_bridge_uses_only_review_proposal_rpc(self) -> None:
        class FakeCursor:
            def __init__(self) -> None:
                self.current: list[dict[str, object]] = []
                self.actions: list[str] = []
                self.track_exists = False

            def __enter__(self) -> "FakeCursor":
                return self

            def __exit__(self, *_: object) -> None:
                return None

            def execute(self, query: str, params: tuple[object, ...] | None = None) -> None:
                if params is not None:
                    self_test.assertEqual(query.count("%s"), len(params), query)
                normalized = " ".join(query.split())
                self.current = []
                if "FROM face_sources" in normalized:
                    self.current = [
                        {
                            "id": "00000000-0000-0000-0000-000000000010",
                            "source_kind": "archive",
                            "state": "active",
                            "operation_mode": "review_only",
                            "all_visible_people_consented": True,
                            "recognition_enabled": True,
                            "automatic_matching_enabled": True,
                            "automatic_publish_enabled": False,
                            "kill_switch_active": False,
                            "active_session_id": "bio",
                        }
                    ]
                elif "FROM face_identities" in normalized:
                    self.current = [
                        {
                            "identity_id": "00000000-0000-0000-0000-000000000020",
                            "consent_id": "00000000-0000-0000-0000-000000000030",
                            "allow_template_creation": True,
                            "allow_live_matching": True,
                            "allow_archive_matching": True,
                            "approved_content_ids": ["yt-testvideo"],
                            "source_allowlisted": True,
                            "archive_scoped": True,
                        }
                    ]
                elif "import_face_track_proposal" in normalized:
                    self.actions.append("proposal_rpc")
                    self.current = [{"track_id": "00000000-0000-0000-0000-000000000040"}]

            def fetchone(self) -> dict[str, object] | None:
                return self.current[0] if self.current else None

            def fetchall(self) -> list[dict[str, object]]:
                return list(self.current)

        class FakeConnection:
            def __init__(self, cursor: FakeCursor) -> None:
                self._cursor = cursor

            def __enter__(self) -> "FakeConnection":
                return self

            def __exit__(self, *_: object) -> None:
                return None

            def cursor(self) -> FakeCursor:
                return self._cursor

        self_test = self
        fake_cursor = FakeCursor()
        psycopg_module = types.ModuleType("psycopg")
        psycopg_module.connect = lambda *_args, **_kwargs: FakeConnection(fake_cursor)  # type: ignore[attr-defined]
        rows_module = types.ModuleType("psycopg.rows")
        rows_module.dict_row = object()  # type: ignore[attr-defined]
        types_module = types.ModuleType("psycopg.types")
        json_module = types.ModuleType("psycopg.types.json")
        json_module.Jsonb = lambda value: value  # type: ignore[attr-defined]

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = load_config(write_config(root))
            event_path = config.runtime.event_output
            event_path.parent.mkdir(parents=True)
            event_path.write_text(
                json.dumps(
                    {
                        "schema_version": 1,
                        "session_id": "bio",
                        "source_id": "vod",
                        "media_pts_ms": 1000,
                        "track_id": "face-1",
                        "state": "recognized",
                        "identity_id": "alice",
                        "bbox_normalized": [0.1, 0.1, 0.2, 0.3],
                        "match_reason": "temporal_consensus_passed",
                        "top_score": 0.9,
                        "runner_up_score": 0.2,
                        "review_status": "proposed",
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(
                sys.modules,
                {
                    "psycopg": psycopg_module,
                    "psycopg.rows": rows_module,
                    "psycopg.types": types_module,
                    "psycopg.types.json": json_module,
                },
            ), patch.dict(
                os.environ,
                {
                    "FACE_ANALYZER_ENABLED": "true",
                    "FACE_AUTOMATIC_MATCHING_ENABLED": "true",
                },
                clear=True,
            ):
                result = import_proposals(
                    config,
                    "bio",
                    input_path=None,
                    database_url="postgresql://worker:secret@127.0.0.1:5432/core",
                    worker_id="test-worker",
                    request_id="test-request",
                    job_id="00000000-0000-0000-0000-000000000050",
                )
                repeated = import_proposals(
                    config,
                    "bio",
                    input_path=None,
                    database_url="postgresql://worker:secret@127.0.0.1:5432/core",
                    worker_id="test-worker",
                    request_id="test-request",
                    job_id="00000000-0000-0000-0000-000000000050",
                )
        self.assertEqual(result["tracks_submitted_idempotently"], 1)
        self.assertEqual(result["approved"], 0)
        self.assertEqual(result["published"], 0)
        self.assertEqual(repeated["tracks_submitted_idempotently"], 1)
        self.assertEqual(fake_cursor.actions, ["proposal_rpc", "proposal_rpc"])


if __name__ == "__main__":
    unittest.main()
