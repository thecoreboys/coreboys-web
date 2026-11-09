"""Consume admin-approved enrollment requests using narrow database RPCs."""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

from .authority import _db_modules, configured_database_url
from .config import AnalyzerConfig, is_within
from .errors import DataError, PolicyError
from .lifecycle import purge_local_enrollment
from .pipeline import enroll_reference_set
from .registry import refresh_database_people
from .vision import file_sha256, verify_model


@lru_cache(maxsize=2)
def _verify_enrollment_model(spec, modified_ns):
    return verify_model(spec, "enrollment")


def process_next_enrollment(config: AnalyzerConfig, worker_id: str) -> bool:
    if os.environ.get("FACE_SITE_ENROLLMENT_ENABLED") != "true":
        return False
    dsn = configured_database_url()
    if not dsn:
        raise PolicyError("site enrollment requires database authority")
    psycopg, dict_row, _ = _db_modules()
    for spec in (config.yunet, config.sface):
        _verify_enrollment_model(spec, spec.path.stat().st_mtime_ns)
    with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT heartbeat_face_enrollment(%s,%s)", (worker_id, config.sface.sha256))
            cursor.execute("SELECT claim_face_enrollment(%s) AS job", (worker_id,))
            job = cursor.fetchone()["job"]
    if not job:
        return False
    config = refresh_database_people(config)
    identity_id = str(job["identity_id"])
    if identity_id not in config.identities:
        identity_id = next((person.id for person in config.identities.values()
                            if (person.canonical_kind,person.canonical_slug)==(job["canonical_kind"],job["canonical_slug"])), identity_id)
    completed_set = None
    try:
        if identity_id not in config.identities:
            raise PolicyError("enrollment identity is unavailable")
        root = config.runtime.enrollment_roots[0]
        paths: list[Path] = []
        for reference in job["references"]:
            key = reference["key"]
            if not isinstance(key, str) or not re.fullmatch(r"[0-9a-f-]{36}\.webp", key):
                raise DataError("invalid reference key")
            path = (root / key).resolve()
            if not is_within(path, root) or file_sha256(path) != reference["sha256"]:
                raise DataError("approved reference bytes changed")
            paths.append(path)
        result = enroll_reference_set(config, identity_id, paths, replace=True, worker_id=worker_id)
        completed_set = result["template_set_id"]
        if not completed_set:
            raise PolicyError("enrollment was not registered")
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT finish_face_enrollment(%s,%s,%s,NULL) AS finished", (job["id"], worker_id, completed_set))
                if not cursor.fetchone()["finished"]:
                    raise PolicyError("enrollment permission or lease changed")
    except Exception:
        if completed_set:
            purge_local_enrollment(config, identity_id, reason="Enrollment completion authority changed", worker_id=worker_id)
        with psycopg.connect(dsn, connect_timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT finish_face_enrollment(%s,%s,NULL,'enrollment_failed')", (job["id"], worker_id))
    return True
