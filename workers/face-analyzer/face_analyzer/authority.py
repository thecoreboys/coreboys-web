from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from .bridge import validate_local_database_url
from .config import AnalyzerConfig, Identity
from .errors import DataError, PolicyError
from .policy import AuthorizedRun


class AuthorityRevokedError(PolicyError):
    """Canonical DB authority explicitly invalidated local templates."""

    def __init__(self, identity_ids: Iterable[str], message: str) -> None:
        self.identity_ids = tuple(sorted(set(identity_ids)))
        super().__init__(message)


@dataclass(frozen=True)
class DbIdentityAuthority:
    worker_identity_id: str
    identity_uuid: str
    consent_uuid: str
    consent_expires_at: datetime
    approved_content_ids: frozenset[str]


def configured_database_url() -> str | None:
    value = os.environ.get("FACE_ANALYZER_DATABASE_URL", "").strip()
    return validate_local_database_url(value) if value else None


def _db_modules() -> tuple[Any, Any, Any]:
    try:
        import psycopg
        from psycopg.rows import dict_row
        from psycopg.types.json import Jsonb
    except ImportError as exc:
        raise DataError("database authority requires the optional db extra: pip install -e .[db]") from exc
    return psycopg, dict_row, Jsonb


def _assert_schema(cursor: Any) -> None:
    cursor.execute(
        """
        SELECT to_regclass('public.face_identities')::text AS identities,
               to_regclass('public.face_reference_assets')::text AS references,
               to_regclass('public.face_sources')::text AS sources,
               to_regclass('public.face_template_sets')::text AS template_sets,
               to_regclass('public.face_consent_archive_scopes')::text AS archive_scopes
        """
    )
    row = cursor.fetchone()
    expected = {
        "identities": "face_identities",
        "references": "face_reference_assets",
        "sources": "face_sources",
        "template_sets": "face_template_sets",
        "archive_scopes": "face_consent_archive_scopes",
    }
    if not row or any(row[key] != value for key, value in expected.items()):
        raise PolicyError("migration 024_face_presence.sql is not applied")


def _resolve_identity(
    cursor: Any,
    identity: Identity,
    *,
    purpose: str | None,
    content_id: str | None,
    start_ms: int | None = None,
    end_ms: int | None = None,
) -> DbIdentityAuthority:
    cursor.execute(
        """
        SELECT identities.id::text AS identity_id,
               identities.state AS identity_state,
               consents.id::text AS consent_id,
               consents.subject_confirmed_adult,
               consents.allow_template_creation,
               consents.allow_live_matching,
               consents.allow_archive_matching,
               consents.approved_content_ids,
               consents.revoked_at,
               consents.expires_at
          FROM face_identities identities
          LEFT JOIN LATERAL (
            SELECT current_consent.id, current_consent.identity_id,
                   current_consent.subject_confirmed_adult,
                   current_consent.allow_template_creation,
                   current_consent.allow_live_matching,
                   current_consent.allow_archive_matching,
                   current_consent.approved_content_ids,
                   current_consent.revoked_at, current_consent.expires_at,
                   current_consent.created_at
              FROM face_consents current_consent
             WHERE current_consent.identity_id=identities.id
             ORDER BY current_consent.created_at DESC
             LIMIT 1
          ) consents ON true
         WHERE identities.canonical_kind=%s
           AND identities.canonical_slug=%s
         LIMIT 2
        """,
        (identity.canonical_kind, identity.canonical_slug),
    )
    rows = cursor.fetchall()
    if len(rows) != 1:
        raise PolicyError(
            f"canonical DB identity {identity.canonical_kind}/{identity.canonical_slug} is missing or ambiguous"
        )
    row = rows[0]
    if row["identity_state"] != "active":
        raise AuthorityRevokedError([identity.id], f"canonical DB identity {identity.canonical_slug} is not active")
    now = datetime.now(timezone.utc)
    if (
        row["consent_id"] is None
        or row["revoked_at"] is not None
        or row["expires_at"] is None
        or row["expires_at"] <= now
        or not row["subject_confirmed_adult"]
        or not row["allow_template_creation"]
    ):
        raise AuthorityRevokedError(
            [identity.id],
            f"canonical DB template consent is absent, expired, or revoked for {identity.canonical_slug}",
        )
    approved_content_ids = frozenset(row["approved_content_ids"] or ())
    if purpose == "live":
        raise AuthorityRevokedError([identity.id], "v1 biometric authority is archive/VOD-only")
    if purpose == "archive" and not row["allow_archive_matching"]:
        raise AuthorityRevokedError([identity.id], f"archive matching consent is disabled for {identity.canonical_slug}")
    if purpose in {"live", "archive"} and (not content_id or content_id not in approved_content_ids):
        raise AuthorityRevokedError(
            [identity.id], f"source content is outside the consent grant for {identity.canonical_slug}"
        )
    if purpose == "archive":
        if (start_ms is None) != (end_ms is None):
            raise PolicyError("archive authority needs both start_ms and end_ms")
        if start_ms is not None and (start_ms < 0 or end_ms is None or end_ms <= start_ms):
            raise PolicyError("archive authority requires a positive PTS interval")
        cursor.execute(
            """
            SELECT 1
              FROM face_consent_archive_scopes
             WHERE consent_id=%s AND identity_id=%s AND content_id=%s
               AND (%s::bigint IS NULL OR (start_ms <= %s AND end_ms >= %s))
             LIMIT 1
            """,
            (
                row["consent_id"], row["identity_id"], content_id,
                start_ms, start_ms, end_ms,
            ),
        )
        if cursor.fetchone() is None:
            raise AuthorityRevokedError(
                [identity.id], f"archive PTS scope is missing for {identity.canonical_slug}"
            )
    return DbIdentityAuthority(
        identity.id,
        row["identity_id"],
        row["consent_id"],
        row["expires_at"],
        approved_content_ids,
    )


def _approved_reference_hashes(cursor: Any, authority: DbIdentityAuthority) -> frozenset[str]:
    cursor.execute(
        """
        SELECT content_sha256
          FROM face_reference_assets
         WHERE identity_id=%s AND consent_id=%s
           AND subject_approved AND state='approved' AND revoked_at IS NULL
           AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL
           AND reviewed_by <> created_by AND retention_expires_at > now()
        """,
        (authority.identity_uuid, authority.consent_uuid),
    )
    return frozenset(row["content_sha256"] for row in cursor.fetchall())


def assert_db_enrollment_authority(
    config: AnalyzerConfig,
    identity_id: str,
    reference_sha256: Iterable[str],
    *,
    content_id: str,
    purpose: str,
) -> dict[str, Any]:
    dsn = configured_database_url()
    if dsn is None:
        return {"db_authoritative": False}
    psycopg, dict_row, _ = _db_modules()
    identity = config.identities[identity_id]
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                _assert_schema(cursor)
                authority = _resolve_identity(cursor, identity, purpose=purpose, content_id=content_id)
                requested = frozenset(reference_sha256)
                approved = _approved_reference_hashes(cursor, authority)
                if not requested or not requested.issubset(approved):
                    raise PolicyError(
                        "every enrollment image must match a current, independently reviewed protected reference hash"
                    )
                return {
                    "db_authoritative": True,
                    "identity_uuid": authority.identity_uuid,
                    "consent_uuid": authority.consent_uuid,
                    "consent_expires_at": authority.consent_expires_at,
                    "approved_reference_count": len(approved),
                }
    except (PolicyError, DataError, AuthorityRevokedError):
        raise
    except Exception as exc:
        raise DataError("local DB enrollment-authority check failed closed") from exc


def record_db_enrollment_metadata(
    config: AnalyzerConfig,
    identity_id: str,
    *,
    reference_sha256: list[str],
    model_fingerprint: Mapping[str, str],
    template_fingerprint: str,
    template_count: int,
    content_id: str,
    purpose: str,
    actor_id: str,
) -> str | None:
    dsn = configured_database_url()
    if dsn is None:
        return
    psycopg, dict_row, _ = _db_modules()
    identity = config.identities[identity_id]
    model_version = model_fingerprint.get("sface_sha256")
    if not isinstance(model_version, str) or len(model_version) != 64:
        raise DataError("verified SFace model fingerprint is invalid")
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                _assert_schema(cursor)
                authority = _resolve_identity(cursor, identity, purpose=purpose, content_id=content_id)
                if not set(reference_sha256).issubset(_approved_reference_hashes(cursor, authority)):
                    raise PolicyError("approved reference authority changed during enrollment")
                cursor.execute(
                    """
                    SELECT sync_face_template_set(
                      %s,%s::uuid,%s::uuid,%s,%s,%s,%s::text[],%s
                    )::text AS template_set_id
                    """,
                    (
                        actor_id, authority.identity_uuid, authority.consent_uuid, model_version,
                        template_fingerprint, template_count, sorted(set(reference_sha256)),
                        authority.consent_expires_at,
                    ),
                )
                row = cursor.fetchone()
                if not row or not row["template_set_id"]:
                    raise PolicyError("template-set synchronization RPC refused enrollment")
                return row["template_set_id"]
    except (PolicyError, DataError, AuthorityRevokedError):
        raise
    except Exception as exc:
        raise DataError("local DB enrollment metadata registration failed closed") from exc


def record_db_local_purge(
    config: AnalyzerConfig,
    identity_id: str,
    *,
    actor_id: str,
    reason: str,
    deleted: bool,
    template_fingerprint: str | None,
    template_set_id: str | None = None,
) -> bool:
    """Best-effort metadata transition after deletion; DB failure cannot undo a local purge."""
    try:
        if not deleted or not isinstance(template_fingerprint, str) or len(template_fingerprint) != 64:
            return False
        dsn = configured_database_url()
        if dsn is None:
            return False
        psycopg, dict_row, _ = _db_modules()
        identity = config.identities[identity_id]
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                _assert_schema(cursor)
                if template_set_id is None:
                    cursor.execute(
                        """
                        SELECT sets.id::text
                          FROM face_template_sets sets
                          JOIN face_identities identities ON identities.id=sets.identity_id
                         WHERE identities.canonical_kind=%s AND identities.canonical_slug=%s
                           AND sets.worker_id=%s AND sets.template_fingerprint=%s
                           AND sets.state IN ('active','purge_pending','failed')
                         LIMIT 2
                        """,
                        (identity.canonical_kind, identity.canonical_slug, actor_id, template_fingerprint),
                    )
                    rows = cursor.fetchall()
                    if len(rows) != 1:
                        return False
                    template_set_id = rows[0]["id"]
                cursor.execute(
                    "SELECT attest_face_template_purged(%s::uuid,%s,%s,%s) AS acknowledged",
                    (template_set_id, actor_id, template_fingerprint, reason[:2000]),
                )
                row = cursor.fetchone()
                return bool(row and row["acknowledged"])
    except Exception:
        return False


def list_db_purge_requests(config: AnalyzerConfig, *, actor_id: str) -> list[dict[str, str]]:
    """Return only purge requests assigned to this worker; never returns vectors."""
    dsn = configured_database_url()
    if dsn is None:
        raise PolicyError("FACE_ANALYZER_DATABASE_URL is required to synchronize purge requests")
    psycopg, dict_row, _ = _db_modules()
    canonical_to_local = {
        (identity.canonical_kind, identity.canonical_slug): identity.id
        for identity in config.identities.values()
    }
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                _assert_schema(cursor)
                cursor.execute(
                    """
                    SELECT sets.id::text AS template_set_id,
                           identities.canonical_kind, identities.canonical_slug,
                           sets.template_fingerprint, sets.state
                      FROM face_template_sets sets
                      JOIN face_identities identities ON identities.id=sets.identity_id
                     WHERE sets.worker_id=%s
                       AND (sets.state='purge_pending'
                            OR (sets.state='active' AND sets.expires_at <= now()))
                     ORDER BY sets.created_at
                    """,
                    (actor_id,),
                )
                requests: list[dict[str, str]] = []
                for row in cursor.fetchall():
                    identity_id = canonical_to_local.get((row["canonical_kind"], row["canonical_slug"]))
                    if identity_id is None:
                        continue
                    requests.append({
                        "template_set_id": row["template_set_id"],
                        "identity_id": identity_id,
                        "template_fingerprint": row["template_fingerprint"],
                        "state": row["state"],
                    })
                return requests
    except (PolicyError, DataError):
        raise
    except Exception as exc:
        raise DataError("local DB purge-request check failed closed") from exc


def assert_db_matching_authority(
    config: AnalyzerConfig,
    run: AuthorizedRun,
    local_metadata: Mapping[str, Any],
    *,
    start_ms: int,
    end_ms: int,
) -> dict[str, Any]:
    dsn = configured_database_url()
    if dsn is None:
        return {"db_authoritative": False}
    psycopg, dict_row, _ = _db_modules()
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                _assert_schema(cursor)
                cursor.execute(
                    """
                    SELECT id::text, source_kind, state, operation_mode,
                           all_visible_people_consented, recognition_enabled,
                           automatic_matching_enabled, automatic_publish_enabled,
                           kill_switch_active, active_session_id
                      FROM face_sources WHERE content_id=%s LIMIT 2
                    """,
                    (run.source.content_id,),
                )
                source_rows = cursor.fetchall()
                if len(source_rows) != 1:
                    raise PolicyError("canonical DB face source is missing or ambiguous")
                source = source_rows[0]
                if source["state"] != "active" or source["kill_switch_active"]:
                    raise PolicyError("DB face source is inactive or its kill switch is active")
                if source["source_kind"] != run.session.purpose:
                    raise PolicyError("DB face source purpose does not match the worker session")
                if source["source_kind"] != "archive":
                    raise PolicyError("v1 automatic matching is archive/VOD-only")
                if source["operation_mode"] == "manual_only":
                    raise PolicyError("DB face source is manual-only")
                if (
                    not source["all_visible_people_consented"]
                    or not source["recognition_enabled"]
                    or not source["automatic_matching_enabled"]
                    or source["automatic_publish_enabled"]
                ):
                    raise PolicyError("DB source does not authorize review-only automatic matching")
                if source["active_session_id"] is not None and source["active_session_id"] != run.session.id:
                    raise PolicyError("DB source is assigned to a different active session")

                local_identities = local_metadata.get("identities")
                local_models = local_metadata.get("model_fingerprint")
                if not isinstance(local_identities, dict) or not isinstance(local_models, dict):
                    raise DataError("local enrollment metadata is invalid")
                model_version = local_models.get("sface_sha256")
                if not isinstance(model_version, str) or len(model_version) != 64:
                    raise DataError("local enrollment SFace model metadata is invalid")
                mapped: dict[str, DbIdentityAuthority] = {}
                for identity_id in run.session.identity_allowlist:
                    authority = _resolve_identity(
                        cursor, config.identities[identity_id], purpose=run.session.purpose,
                        content_id=run.source.content_id, start_ms=start_ms, end_ms=end_ms,
                    )
                    cursor.execute(
                        "SELECT 1 FROM face_source_identities WHERE source_id=%s AND identity_id=%s AND consent_id=%s",
                        (source["id"], authority.identity_uuid, authority.consent_uuid),
                    )
                    if cursor.fetchone() is None:
                        raise AuthorityRevokedError([identity_id], f"DB source allowlist is missing {identity_id}")
                    mapped[identity_id] = authority
                    record = local_identities.get(identity_id)
                    if not isinstance(record, dict) or record.get("expired") or record.get("template_count", 0) < 3:
                        raise AuthorityRevokedError([identity_id], f"local enrollment is unavailable for {identity_id}")
                    fingerprint = record.get("template_fingerprint")
                    hashes = record.get("reference_image_sha256")
                    if not isinstance(fingerprint, str) or len(fingerprint) != 64 or not isinstance(hashes, list):
                        raise AuthorityRevokedError([identity_id], f"local template metadata is incomplete for {identity_id}")
                    cursor.execute(
                        """
                        SELECT id::text AS template_set_id,
                               template_fingerprint, template_count, reference_hashes,
                               worker_id, state, expires_at
                          FROM face_template_sets
                         WHERE identity_id=%s AND consent_id=%s
                           AND model_name='opencv_sface' AND model_version=%s LIMIT 2
                        """,
                        (authority.identity_uuid, authority.consent_uuid, model_version),
                    )
                    sets = cursor.fetchall()
                    if len(sets) != 1:
                        raise AuthorityRevokedError([identity_id], f"active DB template-set authority is missing for {identity_id}")
                    template_set = sets[0]
                    mismatch = (
                        template_set["state"] != "active"
                        or template_set["expires_at"] <= datetime.now(timezone.utc)
                        or template_set["template_fingerprint"] != fingerprint
                        or template_set["template_set_id"] != record.get("template_set_id")
                        or template_set["template_count"] != record["template_count"]
                        or set(template_set["reference_hashes"] or ()) != set(hashes)
                    )
                    if mismatch:
                        raise AuthorityRevokedError([identity_id], f"DB template-set authority is stale or revoked for {identity_id}")
                return {"db_authoritative": True, "source_uuid": source["id"], "checked_identity_count": len(mapped)}
    except (PolicyError, DataError, AuthorityRevokedError):
        raise
    except Exception as exc:
        raise DataError("local DB matching-authority check failed closed") from exc
