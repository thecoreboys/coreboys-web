from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def config_payload() -> dict[str, Any]:
    return {
        "version": 1,
        "runtime": {
            "data_dir": ".local-data",
            "enrollment_roots": ["enrollment"],
            "media_roots": ["media"],
            "event_output": ".local-data/events.ndjson",
            "audit_output": ".local-data/audit.ndjson",
            "enrollment_store": ".local-data/enrollments.json",
            "allowed_local_hosts": ["localhost", "127.0.0.1", "::1"],
            "sample_interval_ms": 500,
            "authority_recheck_seconds": 5,
            "review_only": True,
        },
        "models": {
            "yunet": {"path": "models/yunet.onnx", "sha256": "NOT_CONFIGURED"},
            "sface": {"path": "models/sface.onnx", "sha256": "NOT_CONFIGURED"},
        },
        "matching": {
            "minimum_similarity": 0.5,
            "minimum_top_two_margin": 0.08,
            "consensus_window": 5,
            "consensus_hits": 3,
            "maximum_consensus_gap_ms": 2000,
        },
        "quality": {
            "detector_score_threshold": 0.9,
            "minimum_face_pixels": 72,
            "minimum_sharpness": 60.0,
            "minimum_mean_luminance": 35.0,
            "maximum_mean_luminance": 225.0,
        },
        "identities": [
            {
                "id": "alice",
                "display_name": "Alice",
                "canonical_kind": "member",
                "canonical_slug": "alice",
                "consent": {
                    "biometric_template": True,
                    "live_matching": False,
                    "archive_matching": True,
                    "public_tag": True,
                    "granted_at": "2026-01-01T00:00:00Z",
                    "expires_at": "2099-01-01T00:00:00Z",
                },
            },
            {
                "id": "bob",
                "display_name": "Bob",
                "canonical_kind": "crew",
                "canonical_slug": "bob",
                "consent": {
                    "biometric_template": True,
                    "live_matching": False,
                    "archive_matching": True,
                    "public_tag": True,
                    "granted_at": "2026-01-01T00:00:00Z",
                    "expires_at": "2099-01-01T00:00:00Z",
                },
            },
        ],
        "sources": [
            {
                "id": "vod",
                "content_id": "yt-testvideo",
                "kind": "file",
                "uri": "media/video.mp4",
                "authorized": True,
                "all_visible_participants_consented": True,
                "participant_allowlist": ["alice", "bob"],
            }
        ],
        "sessions": [
            {
                "id": "bio",
                "source_id": "vod",
                "mode": "biometric",
                "purpose": "archive",
                "active": True,
                "expires_at": "2099-01-01T00:00:00Z",
                "identity_allowlist": ["alice", "bob"],
            },
            {
                "id": "manual",
                "source_id": "vod",
                "mode": "manual",
                "purpose": "archive",
                "active": True,
                "expires_at": "2099-01-01T00:00:00Z",
                "identity_allowlist": ["alice", "bob"],
            },
        ],
    }


def write_config(root: Path, payload: dict[str, Any] | None = None) -> Path:
    (root / "media").mkdir()
    (root / "enrollment").mkdir()
    (root / "media" / "video.mp4").write_bytes(b"fixture")
    path = root / "config.json"
    path.write_text(json.dumps(payload or config_payload()), encoding="utf-8")
    return path
