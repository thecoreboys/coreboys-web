from __future__ import annotations

import hashlib
import ipaddress
import json
import math
import os
import uuid
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlparse

from .audit import require_worker_id
from .config import AnalyzerConfig, Identity, is_within
from .errors import DataError, PolicyError
from .policy import authorize_run
from .store import assert_event_safe
from .tracking import BBox, validate_bbox
from .runtime_gate import require_biometric_enabled


@dataclass(frozen=True)
class ProposalSample:
    session_id: str
    source_id: str
    media_pts_ms: int
    track_id: str
    state: str
    identity_id: str | None
    bbox: BBox
    top_score: float | None
    runner_up_score: float | None


@dataclass(frozen=True)
class AggregatedTrack:
    external_track_ref: str
    worker_track_id: str
    identity_id: str | None
    state: str
    match_method: str
    start_ms: int
    end_ms: int
    bbox: BBox
    similarity_score: float | None
    similarity_margin: float | None
    sample_count: int


def _optional_score(value: Any, field: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DataError(f"{field} must be a number or null")
    result = float(value)
    if not math.isfinite(result) or not -1.0 <= result <= 1.0:
        raise DataError(f"{field} must be finite and between -1 and 1")
    return result


def _sample_from_payload(
    payload: Any,
    *,
    line_number: int,
    session_id: str,
    source_id: str,
    allowed_identity_ids: frozenset[str],
) -> ProposalSample | None:
    if not isinstance(payload, dict):
        raise DataError(f"proposal line {line_number} must be an object")
    assert_event_safe(payload)
    # Canonical profile data is resolved in PostgreSQL/the web layer, never from
    # a worker-controlled event file.
    if {"display_name", "profile_path", "social_accounts", "profile_url", "socials"}.intersection(payload):
        raise DataError(f"proposal line {line_number} contains non-authoritative public profile data")
    if payload.get("session_id") != session_id:
        return None
    if payload.get("schema_version") != 1 or payload.get("review_status") != "proposed":
        raise DataError(f"proposal line {line_number} is not a review-only schema-v1 event")
    if payload.get("source_id") != source_id:
        raise DataError(f"proposal line {line_number} source does not match the configured session")
    pts_ms = payload.get("media_pts_ms")
    if isinstance(pts_ms, bool) or not isinstance(pts_ms, int) or pts_ms < 0:
        raise DataError(f"proposal line {line_number} has invalid media PTS")
    track_id = payload.get("track_id")
    if not isinstance(track_id, str) or not 1 <= len(track_id) <= 200:
        raise DataError(f"proposal line {line_number} has invalid track_id")
    state = payload.get("state")
    if state not in {"recognized", "manual", "unknown"}:
        raise DataError(f"proposal line {line_number} has invalid state")
    identity_id = payload.get("identity_id")
    if identity_id is not None and identity_id not in allowed_identity_ids:
        raise DataError(f"proposal line {line_number} identity is outside the session allowlist")
    if (state in {"recognized", "manual"}) != (identity_id is not None):
        raise DataError(f"proposal line {line_number} identity/state combination is inconsistent")
    bbox_value = payload.get("bbox_normalized")
    if not isinstance(bbox_value, (list, tuple)):
        raise DataError(f"proposal line {line_number} has invalid bbox")
    return ProposalSample(
        session_id=session_id,
        source_id=source_id,
        media_pts_ms=pts_ms,
        track_id=track_id,
        state=state,
        identity_id=identity_id,
        bbox=validate_bbox(bbox_value, normalized=True),
        top_score=_optional_score(payload.get("top_score"), f"proposal line {line_number} top_score"),
        runner_up_score=_optional_score(
            payload.get("runner_up_score"),
            f"proposal line {line_number} runner_up_score",
        ),
    )


def load_proposal_samples(
    path: Path,
    *,
    session_id: str,
    source_id: str,
    allowed_identity_ids: frozenset[str],
) -> list[ProposalSample]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise DataError(f"proposal file does not exist: {path}") from exc
    samples: list[ProposalSample] = []
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise DataError(f"proposal line {line_number} is invalid JSON") from exc
        sample = _sample_from_payload(
            payload,
            line_number=line_number,
            session_id=session_id,
            source_id=source_id,
            allowed_identity_ids=allowed_identity_ids,
        )
        if sample is not None:
            samples.append(sample)
    if not samples:
        raise DataError("proposal file has no events for the selected session")
    return samples


def aggregate_samples(
    samples: Iterable[ProposalSample],
    *,
    session_mode: str,
    sample_interval_ms: int,
) -> list[AggregatedTrack]:
    grouped: dict[str, dict[tuple[Any, ...], ProposalSample]] = {}
    for sample in samples:
        expected_named_state = "manual" if session_mode == "manual" else "recognized"
        if sample.identity_id is not None and sample.state != expected_named_state:
            raise DataError("proposal state does not match configured session mode")
        fingerprint = (
            sample.media_pts_ms,
            sample.identity_id,
            sample.state,
            sample.bbox,
            sample.top_score,
            sample.runner_up_score,
        )
        grouped.setdefault(sample.track_id, {})[fingerprint] = sample

    result: list[AggregatedTrack] = []
    for track_id, unique_samples in sorted(grouped.items()):
        values = sorted(unique_samples.values(), key=lambda sample: sample.media_pts_ms)
        named_ids = {sample.identity_id for sample in values if sample.identity_id is not None}
        if len(named_ids) > 1:
            raise DataError(f"track {track_id!r} changed identity; manual review is required before import")
        # Each sample becomes a short idempotent interval. This preserves
        # Unknown transitions, gaps and the bbox actually observed at that PTS;
        # it never paints a later face position over an earlier interval.
        segments: list[list[ProposalSample]] = [[value] for value in values]
        for segment in segments:
            identity_id = segment[0].identity_id
            bbox = validate_bbox(segment[-1].bbox, normalized=True)
            scores = [item.top_score for item in segment if item.top_score is not None]
            margins = [
                item.top_score - item.runner_up_score
                for item in segment
                if item.top_score is not None and item.runner_up_score is not None
            ]
            score = min(scores) if scores else None
            margin = min(margins) if margins else None
            if score is not None and not 0.0 <= score <= 1.0:
                raise DataError(f"recognized track {track_id!r} has a score outside the database-safe range")
            if margin is not None:
                margin = min(1.0, max(0.0, margin))
            stable_seed = (
                f"face-analyzer-v1\0{segment[0].session_id}\0{segment[0].source_id}\0"
                f"{track_id}\0{segment[0].media_pts_ms}\0{identity_id or 'unknown'}"
            )
            external_ref = f"face-analyzer-v1:{hashlib.sha256(stable_seed.encode('utf-8')).hexdigest()[:48]}"
            result.append(
                AggregatedTrack(
                    external_track_ref=external_ref,
                    worker_track_id=track_id,
                    identity_id=identity_id,
                    state="proposed" if identity_id else "unknown",
                    match_method="manual" if session_mode == "manual" else "automatic",
                    start_ms=segment[0].media_pts_ms,
                    end_ms=segment[-1].media_pts_ms + sample_interval_ms,
                    bbox=bbox,
                    similarity_score=score if session_mode == "biometric" else None,
                    similarity_margin=margin if session_mode == "biometric" else None,
                    sample_count=len(segment),
                )
            )
    return result


def validate_local_database_url(database_url: str) -> str:
    if not database_url:
        raise PolicyError("FACE_ANALYZER_DATABASE_URL is required for import-proposals")
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql"} or not parsed.hostname or not parsed.path.strip("/"):
        raise PolicyError("FACE_ANALYZER_DATABASE_URL must be a PostgreSQL URL with a database name")
    host = parsed.hostname.strip("[]").lower()
    if parsed.fragment:
        raise PolicyError("FACE_ANALYZER_DATABASE_URL must not contain a fragment")
    endpoint_override_keys = {"host", "hostaddr", "port", "service", "servicefile"}
    query_keys = {key.lower() for key, _ in parse_qsl(parsed.query, keep_blank_values=True)}
    if endpoint_override_keys.intersection(query_keys):
        raise PolicyError("FACE_ANALYZER_DATABASE_URL query parameters cannot override the loopback endpoint")
    if host != "localhost":
        try:
            if not ipaddress.ip_address(host).is_loopback:
                raise PolicyError("proposal import is restricted to a loopback PostgreSQL server")
        except ValueError as exc:
            raise PolicyError("proposal import requires localhost or a literal loopback IP") from exc
    return database_url


def _identity_mapping(
    cursor: Any,
    source_uuid: str,
    content_id: str,
    identity: Identity,
    purpose: str,
    mode: str,
    start_ms: int,
    end_ms: int,
) -> tuple[str, str]:
    cursor.execute(
        """
        SELECT identities.id::text AS identity_id,
               consents.id::text AS consent_id,
               consents.allow_template_creation,
               consents.allow_live_matching,
               consents.allow_archive_matching,
               consents.approved_content_ids,
               EXISTS (
                 SELECT 1 FROM face_source_identities allowed
                 WHERE allowed.source_id=%s
                   AND allowed.identity_id=identities.id
                   AND allowed.consent_id=consents.id
               ) AS source_allowlisted,
               EXISTS (
                 SELECT 1 FROM face_consent_archive_scopes scopes
                  WHERE scopes.consent_id=consents.id
                    AND scopes.identity_id=identities.id
                    AND scopes.content_id=%s
                    AND scopes.start_ms <= %s AND scopes.end_ms >= %s
               ) AS archive_scoped
          FROM face_identities identities
          JOIN face_consents consents ON consents.identity_id=identities.id
         WHERE identities.canonical_kind=%s
           AND identities.canonical_slug=%s
           AND identities.state='active'
           AND consents.revoked_at IS NULL
           AND consents.expires_at > now()
           AND consents.subject_confirmed_adult
         LIMIT 2
        """,
        (source_uuid, content_id, start_ms, end_ms, identity.canonical_kind, identity.canonical_slug),
    )
    rows = cursor.fetchall()
    if len(rows) != 1:
        raise PolicyError(
            f"canonical identity {identity.canonical_kind}/{identity.canonical_slug} lacks one active DB identity+consent"
        )
    row = rows[0]
    if purpose != "archive" or not row["archive_scoped"]:
        raise PolicyError(
            f"canonical identity {identity.canonical_kind}/{identity.canonical_slug} lacks the exact archive interval scope"
        )
    if mode == "biometric":
        purpose_allowed = row["allow_live_matching"] if purpose == "live" else row["allow_archive_matching"]
        if (
            not row["allow_template_creation"]
            or not purpose_allowed
            or not row["source_allowlisted"]
            or content_id not in set(row["approved_content_ids"] or ())
        ):
            raise PolicyError(
                f"canonical identity {identity.canonical_kind}/{identity.canonical_slug} is not DB-allowlisted for matching"
            )
    return row["identity_id"], row["consent_id"]


def import_proposals(
    config: AnalyzerConfig,
    session_id: str,
    *,
    input_path: Path | None,
    database_url: str | None,
    worker_id: str | None,
    request_id: str | None,
    job_id: str | None = None,
    sample_interval_ms: int | None = None,
    scope_start_ms: int | None = None,
    scope_end_ms: int | None = None,
    finish_job: bool = False,
) -> dict[str, Any]:
    run = authorize_run(config, session_id, require_input_exists=False)
    if run.session.mode == "biometric":
        require_biometric_enabled(matching=True)
    proposal_candidate = input_path or config.runtime.event_output
    if not proposal_candidate.is_absolute():
        proposal_candidate = config.path.parent / proposal_candidate
    proposal_path = proposal_candidate.resolve()
    if not is_within(proposal_path, config.runtime.data_dir):
        raise PolicyError("proposal input must stay inside runtime.data_dir")
    samples = load_proposal_samples(
        proposal_path,
        session_id=run.session.id,
        source_id=run.source.id,
        allowed_identity_ids=run.session.identity_allowlist,
    )
    tracks = aggregate_samples(
        samples,
        session_mode=run.session.mode,
        sample_interval_ms=sample_interval_ms or config.runtime.sample_interval_ms,
    )
    if (scope_start_ms is None) != (scope_end_ms is None):
        raise DataError("proposal import scope requires both start and end")
    if scope_start_ms is not None:
        if scope_start_ms < 0 or scope_end_ms is None or scope_end_ms <= scope_start_ms:
            raise DataError("proposal import scope is invalid")
        if any(track.start_ms < scope_start_ms or track.start_ms >= scope_end_ms for track in tracks):
            raise PolicyError("proposal sample lies outside the authorized job interval")
        tracks = [replace(track, end_ms=min(track.end_ms, scope_end_ms)) for track in tracks]
    dsn = validate_local_database_url(database_url or os.environ.get("FACE_ANALYZER_DATABASE_URL", ""))
    actor_id = require_worker_id(worker_id)
    if job_id is None:
        raise PolicyError("proposal import requires an owned DB job lease (--job-id)")
    try:
        normalized_job_id = str(uuid.UUID(job_id))
    except (ValueError, AttributeError) as exc:
        raise DataError("proposal import job_id must be a UUID") from exc
    file_digest = hashlib.sha256(proposal_path.read_bytes()).hexdigest()
    audit_request_id = (request_id or f"face-import:{file_digest[:40]}").strip()
    if not 1 <= len(audit_request_id) <= 200:
        raise PolicyError("request id must contain 1..200 characters")
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise DataError("import-proposals requires the optional db extra: pip install -e .[db]") from exc

    submitted = 0
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id::text, source_kind, state, operation_mode,
                           all_visible_people_consented, recognition_enabled,
                           automatic_matching_enabled,
                           automatic_publish_enabled, kill_switch_active, active_session_id
                      FROM face_sources
                     WHERE content_id=%s
                    """,
                    (run.source.content_id,),
                )
                source_row = cursor.fetchone()
                if source_row is None:
                    raise PolicyError(f"no DB face_source exists for content_id {run.source.content_id!r}")
                if source_row["state"] != "active" or source_row["kill_switch_active"]:
                    raise PolicyError("DB face source is inactive or its kill switch is active")
                if source_row["source_kind"] != run.session.purpose:
                    raise PolicyError("DB face source kind does not match the configured session purpose")
                if source_row["source_kind"] != "archive":
                    raise PolicyError("v1 proposal import is archive/VOD-only")
                if source_row["automatic_publish_enabled"]:
                    raise PolicyError("DB source unexpectedly permits automatic publication")
                active_session = source_row["active_session_id"]
                if active_session is not None and active_session != run.session.id:
                    raise PolicyError("DB source is assigned to a different active session")
                if run.session.mode == "biometric":
                    if (
                        source_row["operation_mode"] == "manual_only"
                        or not source_row["recognition_enabled"]
                        or not source_row["automatic_matching_enabled"]
                        or not source_row["all_visible_people_consented"]
                    ):
                        raise PolicyError("DB source is not enabled for consented review-only recognition")

                mapped: dict[str, tuple[str, str]] = {}
                for identity_id in sorted({track.identity_id for track in tracks if track.identity_id is not None}):
                    identity_tracks = [track for track in tracks if track.identity_id == identity_id]
                    if not identity_tracks:
                        continue
                    mapped[identity_id] = _identity_mapping(
                        cursor,
                        source_row["id"],
                        run.source.content_id,
                        config.identities[identity_id],
                        run.session.purpose,
                        run.session.mode,
                        min(track.start_ms for track in identity_tracks),
                        max(track.end_ms for track in identity_tracks),
                    )

                for track in tracks:
                    identity_uuid, _ = mapped.get(track.identity_id, (None, None))
                    cursor.execute(
                        """
                        SELECT track_id::text AS track_id, disposition
                          FROM import_face_track_proposal(
                          %s,%s::uuid,%s,%s,%s::uuid,%s,%s,
                          %s,%s,%s,%s,%s,%s
                        )
                        """,
                        (
                            actor_id,
                            normalized_job_id,
                            track.external_track_ref,
                            track.match_method,
                            identity_uuid,
                            track.start_ms,
                            track.end_ms,
                            *track.bbox,
                            track.similarity_score,
                            track.similarity_margin,
                        ),
                    )
                    row = cursor.fetchone()
                    if not row or not row["track_id"]:
                        raise PolicyError("proposal import RPC refused a track")
                    submitted += 1
                if finish_job:
                    cursor.execute(
                        "SELECT finish_face_job(%s::uuid,%s,'succeeded',NULL) AS finished",
                        (normalized_job_id, actor_id),
                    )
                    finished_row = cursor.fetchone()
                    if not finished_row or not finished_row["finished"]:
                        raise PolicyError("job finish RPC refused; proposal import was rolled back")
    except (PolicyError, DataError):
        raise
    except Exception as exc:
        raise DataError("local proposal import failed and was rolled back") from exc

    return {
        "source_content_id": run.source.content_id,
        "session_id": run.session.id,
        "tracks_aggregated": len(tracks),
        "tracks_submitted_idempotently": submitted,
        "approved": 0,
        "published": 0,
        "biometric_payloads_transmitted": 0,
        "request_id": audit_request_id,
        "job_finished_atomically": finish_job,
    }
