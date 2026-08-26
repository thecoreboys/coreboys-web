from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from .errors import DataError, PolicyError
from .store import assert_event_safe


_WORKER_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$")


def require_worker_id(explicit: str | None = None) -> str:
    worker_id = (explicit or os.environ.get("FACE_ANALYZER_WORKER_ID", "")).strip()
    if not _WORKER_ID_RE.fullmatch(worker_id):
        raise PolicyError(
            "--worker-id or FACE_ANALYZER_WORKER_ID must be a 1..160 character safe worker id"
        )
    return worker_id


def append_worker_audit(
    path: Path,
    *,
    actor_id: str,
    action: str,
    identity_id: str | None,
    details: Mapping[str, Any],
) -> None:
    if not action or len(action) > 100:
        raise DataError("worker audit action is invalid")
    payload = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "actor_type": "worker",
        "actor_id": actor_id,
        "action": action,
        "identity_id": identity_id,
        "details": dict(details),
    }
    assert_event_safe(payload, "audit")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, separators=(",", ":"), sort_keys=True))
        handle.write("\n")
