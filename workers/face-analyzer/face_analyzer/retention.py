from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from .config import AnalyzerConfig, is_within
from .errors import PolicyError


def _delete_aged_files(root: Path, suffix: str, older_than_seconds: int, now: float) -> list[str]:
    resolved_root = root.resolve()
    if not resolved_root.exists():
        return []
    deleted: list[str] = []
    for candidate in resolved_root.iterdir():
        resolved = candidate.resolve()
        if (
            not candidate.is_file()
            or candidate.suffix.lower() != suffix
            or not is_within(resolved, resolved_root)
            or now - candidate.stat().st_mtime < older_than_seconds
        ):
            continue
        candidate.unlink()
        deleted.append(candidate.name)
    return sorted(deleted)


def cleanup_local_retention(config: AnalyzerConfig, *, now: float | None = None) -> dict[str, Any]:
    """Purge worker-owned review evidence/diagnostics; the worker stores no crops."""
    if not is_within(config.runtime.data_dir.resolve(), config.runtime.data_dir.resolve()):
        raise PolicyError("runtime.data_dir resolution failed")
    current = time.time() if now is None else now
    manual = _delete_aged_files(
        config.runtime.data_dir / "manual-jobs", ".json", 7 * 24 * 60 * 60, current
    )
    diagnostics = _delete_aged_files(
        config.runtime.data_dir / "job-proposals", ".ndjson", 30 * 24 * 60 * 60, current
    )
    return {
        "manual_review_evidence_deleted": manual,
        "diagnostic_proposals_deleted": diagnostics,
        "face_crops_stored": 0,
        "unknown_embeddings_stored": 0,
    }
