from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from .config import AnalyzerConfig, is_within
from .audit import append_worker_audit, require_worker_id
from .authority import (
    AuthorityRevokedError,
    assert_db_enrollment_authority,
    assert_db_matching_authority,
    configured_database_url,
    record_db_enrollment_metadata,
)
from .errors import DataError, ExpiredEnrollmentError, PolicyError
from .lifecycle import purge_local_enrollment
from .locking import serialized_enrollment_operation
from .matching import ClosedSetMatcher, MatchDecision, TemporalConsensus
from .media import iter_sampled_frames
from .policy import authorize_enrollment_image, authorize_run
from .store import EnrollmentStore, EventWriter, PresenceEvent
from .tracking import BBox, IoUTracker, ManualTimeline
from .vision import OpenCVFaceEngine, file_sha256
from .runtime_gate import config_only_allowed, require_biometric_enabled


@dataclass(frozen=True)
class RunSummary:
    mode: str
    frames_analyzed: int
    proposals_written: int
    recognized_proposals: int
    unknown_proposals: int


def _iso(value: Any) -> str:
    return value.isoformat().replace("+00:00", "Z")


@serialized_enrollment_operation
def enroll_identity(
    config: AnalyzerConfig,
    session_id: str,
    identity_id: str,
    image_paths: Iterable[str | Path],
    *,
    replace: bool,
    worker_id: str | None = None,
) -> dict[str, Any]:
    require_biometric_enabled(matching=False)
    actor_id = require_worker_id(worker_id)
    enrollment_run = authorize_run(config, session_id, expected_mode="biometric")
    if identity_id not in enrollment_run.session.identity_allowlist:
        raise PolicyError("identity is outside the enrollment session allowlist")
    paths = list(image_paths)
    if not 3 <= len(paths) <= 20:
        raise DataError("enrollment requires 3 to 20 approved reference images")
    authorized_paths: list[Path] = []
    identity = None
    for path in paths:
        current_identity, authorized_path = authorize_enrollment_image(config, identity_id, path)
        identity = current_identity
        authorized_paths.append(authorized_path)
    assert identity is not None
    image_digests = [file_sha256(path) for path in authorized_paths]
    if len(set(image_digests)) != len(image_digests):
        raise DataError("enrollment reference images must have unique file contents")
    db_authority = assert_db_enrollment_authority(
        config,
        identity_id,
        image_digests,
        content_id=enrollment_run.source.content_id,
        purpose=enrollment_run.session.purpose,
    )
    if not db_authority["db_authoritative"] and not config_only_allowed():
        raise PolicyError(
            "biometric enrollment requires FACE_ANALYZER_DATABASE_URL; "
            "FACE_ANALYZER_ALLOW_CONFIG_ONLY=true is a non-production test escape only"
        )
    engine = OpenCVFaceEngine(config)
    embeddings = [engine.extract_single_enrollment(path) for path in authorized_paths]
    try:
        store = EnrollmentStore(config.runtime.enrollment_store, engine.model_fingerprint)
    except DataError as exc:
        if "model fingerprint differs" not in str(exc):
            raise
        _purge_for_model_change(config, actor_id, engine.model_fingerprint)
        store = EnrollmentStore(config.runtime.enrollment_store, engine.model_fingerprint)
    if store.contains(identity_id) and replace:
        replacement_purge = purge_local_enrollment(
            config,
            identity_id,
            reason="operator requested fixed-model enrollment replacement",
            worker_id=actor_id,
        )
        if db_authority["db_authoritative"] and not replacement_purge["db_audit_recorded"]:
            raise PolicyError(
                "old local templates were deleted, but exact DB purge attestation is pending; "
                "run sync-purges before retrying replacement"
            )
        store = EnrollmentStore(config.runtime.enrollment_store, engine.model_fingerprint)
    consent_expiry = identity.consent.expires_at
    if db_authority["db_authoritative"]:
        consent_expiry = min(consent_expiry, db_authority["consent_expires_at"])
    local_metadata = store.put(
        identity_id,
        embeddings,
        image_sha256=image_digests,
        consent_granted_at=_iso(identity.consent.granted_at),
        consent_expires_at=_iso(consent_expiry),
        replace=False if replace else replace,
    )
    try:
        template_set_id = record_db_enrollment_metadata(
            config,
            identity_id,
            reference_sha256=image_digests,
            model_fingerprint=engine.model_fingerprint,
            template_fingerprint=local_metadata["template_fingerprint"],
            template_count=local_metadata["template_count"],
            content_id=enrollment_run.source.content_id,
            purpose=enrollment_run.session.purpose,
            actor_id=actor_id,
        )
        if template_set_id is not None:
            store.bind_template_set(identity_id, template_set_id)
    except Exception:
        purge_local_enrollment(
            config,
            identity_id,
            reason="DB enrollment metadata registration failed; local templates removed fail-closed",
            worker_id=actor_id,
        )
        raise
    append_worker_audit(
        config.runtime.audit_output,
        actor_id=actor_id,
        action="face.enrollment.local_created",
        identity_id=identity_id,
        details={
            "reference_count": len(embeddings),
            "reference_image_sha256": image_digests,
            "model_fingerprint": engine.model_fingerprint,
            "db_authoritative": db_authority["db_authoritative"],
            "embedding_persisted_in_app_db": False,
        },
    )
    return {
        "identity_id": identity_id,
        "reference_count": len(embeddings),
        "store": str(config.runtime.enrollment_store),
        "model_fingerprint": engine.model_fingerprint,
        "source_images_copied": False,
        "fixed_model_training_performed": False,
        "db_authoritative": db_authority["db_authoritative"],
        "template_set_id": template_set_id if db_authority["db_authoritative"] else None,
    }


def _audit_expired_templates(config: AnalyzerConfig, actor_id: str, error: ExpiredEnrollmentError) -> None:
    for identity_id in error.identity_ids:
        append_worker_audit(
            config.runtime.audit_output,
            actor_id=actor_id,
            action="face.enrollment.local_expired_purged",
            identity_id=identity_id,
            details={"reason": "stored consent expiry reached", "biometric_payload_logged": False},
        )


def _purge_revoked_authority(
    config: AnalyzerConfig,
    actor_id: str,
    error: AuthorityRevokedError,
) -> None:
    for identity_id in error.identity_ids:
        purge_local_enrollment(
            config,
            identity_id,
            reason=f"canonical DB authority invalidated local template: {error}",
            worker_id=actor_id,
        )


def _purge_for_model_change(
    config: AnalyzerConfig,
    actor_id: str,
    model_fingerprint: dict[str, str],
) -> None:
    metadata = EnrollmentStore.metadata(config.runtime.enrollment_store)
    for identity_id in list(metadata.get("identities", {})):
        purge_local_enrollment(
            config,
            identity_id,
            reason="verified model changed; local templates require fresh enrollment",
            worker_id=actor_id,
        )
    EnrollmentStore.reset_model_if_empty(config.runtime.enrollment_store, model_fingerprint)


def _matching_authority_check(
    config: AnalyzerConfig,
    session_id: str,
    actor_id: str,
    *,
    database_required: bool,
    start_ms: int,
    end_ms: int,
) -> Any:
    require_biometric_enabled(matching=True)
    run = authorize_run(config, session_id, expected_mode="biometric")
    metadata = EnrollmentStore.metadata(config.runtime.enrollment_store)
    expired = [
        identity_id
        for identity_id, record in metadata["identities"].items()
        if record.get("expired")
    ]
    if expired:
        for identity_id in expired:
            purge_local_enrollment(
                config,
                identity_id,
                reason="stored consent expiry reached during authority recheck",
                worker_id=actor_id,
            )
        raise DataError("expired local templates were removed during authority recheck")
    try:
        authority = assert_db_matching_authority(
            config, run, metadata, start_ms=start_ms, end_ms=end_ms
        )
    except AuthorityRevokedError as exc:
        _purge_revoked_authority(config, actor_id, exc)
        raise
    if database_required and not authority["db_authoritative"]:
        raise PolicyError("FACE_ANALYZER_DATABASE_URL was removed during an active biometric session")
    return run


def _normalized_bbox(bbox: BBox, width: int, height: int) -> BBox:
    x, y, box_width, box_height = bbox
    left = min(max(x, 0.0), float(width))
    top = min(max(y, 0.0), float(height))
    right = min(max(x + box_width, left), float(width))
    bottom = min(max(y + box_height, top), float(height))
    if right <= left or bottom <= top:
        raise DataError("detector returned an empty face box")
    return left / width, top / height, (right - left) / width, (bottom - top) / height


def _presence_event(
    *,
    config: AnalyzerConfig,
    session_id: str,
    source_id: str,
    pts_ms: int,
    track_id: str,
    bbox: BBox,
    decision: MatchDecision,
    state_override: str | None = None,
) -> PresenceEvent:
    identity = config.identities.get(decision.identity_id) if decision.identity_id else None
    return PresenceEvent(
        schema_version=1,
        session_id=session_id,
        source_id=source_id,
        media_pts_ms=pts_ms,
        track_id=track_id,
        state=state_override or ("recognized" if identity else "unknown"),
        identity_id=identity.id if identity else None,
        bbox_normalized=bbox,
        match_reason=decision.reason,
        top_score=decision.top_score,
        runner_up_score=decision.runner_up_score,
    )


def run_biometric_analysis(
    config: AnalyzerConfig,
    session_id: str,
    *,
    maximum_frames: int | None = None,
    event_output: Path | None = None,
    sample_interval_ms: int | None = None,
    start_ms: int = 0,
    end_ms: int | None = None,
    control_check: Callable[[], None] | None = None,
) -> RunSummary:
    require_biometric_enabled(matching=True)
    actor_id = require_worker_id(None)
    database_required = configured_database_url() is not None
    if not database_required and not config_only_allowed():
        raise PolicyError(
            "biometric matching requires FACE_ANALYZER_DATABASE_URL; "
            "FACE_ANALYZER_ALLOW_CONFIG_ONLY=true is a non-production test escape only"
        )
    if database_required and (end_ms is None or end_ms <= start_ms):
        raise PolicyError("DB-authoritative archive matching requires explicit start_ms/end_ms scope")
    authority_end_ms = end_ms if end_ms is not None else start_ms + 1
    run = _matching_authority_check(
        config,
        session_id,
        actor_id,
        database_required=database_required,
        start_ms=start_ms,
        end_ms=authority_end_ms,
    )
    engine = OpenCVFaceEngine(config)
    try:
        store = EnrollmentStore(config.runtime.enrollment_store, engine.model_fingerprint)
    except DataError as exc:
        if "model fingerprint differs" in str(exc):
            _purge_for_model_change(config, actor_id, engine.model_fingerprint)
        raise
    try:
        templates = store.templates(run.session.identity_allowlist)
    except ExpiredEnrollmentError as exc:
        _audit_expired_templates(config, actor_id, exc)
        raise
    matcher = ClosedSetMatcher(
        templates,
        minimum_similarity=config.matching.minimum_similarity,
        minimum_top_two_margin=config.matching.minimum_top_two_margin,
    )
    consensus = TemporalConsensus(
        window=config.matching.consensus_window,
        required_hits=config.matching.consensus_hits,
        maximum_gap_ms=config.matching.maximum_consensus_gap_ms,
    )
    tracker = IoUTracker(maximum_age_ms=config.matching.maximum_consensus_gap_ms)
    output_path = (event_output or config.runtime.event_output).resolve()
    if not is_within(output_path, config.runtime.data_dir):
        raise PolicyError("event output must stay inside runtime.data_dir")
    writer = EventWriter(output_path)
    last_authority_check = time.monotonic()
    authority_interval_seconds = min(config.runtime.authority_recheck_seconds, 1.0)
    frames_analyzed = proposals = recognized = unknown = 0
    for frame in iter_sampled_frames(
        run.input_uri,
        sample_interval_ms=sample_interval_ms or config.runtime.sample_interval_ms,
        maximum_frames=maximum_frames,
    ):
        if control_check is not None:
            control_check()
        if frame.pts_ms < start_ms:
            continue
        if end_ms is not None and frame.pts_ms >= end_ms:
            break
        if time.monotonic() - last_authority_check >= authority_interval_seconds:
            run = _matching_authority_check(
                config,
                session_id,
                actor_id,
                database_required=database_required,
                start_ms=start_ms,
                end_ms=authority_end_ms,
            )
            last_authority_check = time.monotonic()
        frames_analyzed += 1
        observations = engine.detect(frame.image)
        assignments = tracker.update(frame.pts_ms, [observation.bbox for observation in observations])
        consensus.forget(tracker.active_track_ids)
        for assignment in assignments:
            observation = observations[assignment.detection_index]
            if observation.embedding is None:
                candidate = MatchDecision.unknown(observation.quality_reason)
            else:
                candidate = matcher.match(observation.embedding, run.session.identity_allowlist)
            final_decision = consensus.observe(assignment.track_id, frame.pts_ms, candidate)
            event = _presence_event(
                config=config,
                session_id=run.session.id,
                source_id=run.source.id,
                pts_ms=frame.pts_ms,
                track_id=assignment.track_id,
                bbox=_normalized_bbox(assignment.bbox, frame.width, frame.height),
                decision=final_decision,
            )
            writer.append(event)
            proposals += 1
            if event.identity_id:
                recognized += 1
            else:
                unknown += 1
        # Face embeddings and aligned crops never cross this iteration boundary or
        # enter an output/store object. They are eligible for immediate collection.
        del observations
    return RunSummary("biometric", frames_analyzed, proposals, recognized, unknown)


def run_manual_analysis(
    config: AnalyzerConfig,
    session_id: str,
    manual_tracks_path: str | Path,
    *,
    maximum_frames: int | None = None,
    event_output: Path | None = None,
    sample_interval_ms: int | None = None,
    start_ms: int = 0,
    end_ms: int | None = None,
    control_check: Callable[[], None] | None = None,
) -> RunSummary:
    run = authorize_run(config, session_id, expected_mode="manual")
    timeline = ManualTimeline.load(manual_tracks_path, run.session.identity_allowlist)
    output_path = (event_output or config.runtime.event_output).resolve()
    if not is_within(output_path, config.runtime.data_dir):
        raise PolicyError("event output must stay inside runtime.data_dir")
    writer = EventWriter(output_path)
    frames_analyzed = proposals = recognized = unknown = 0
    for frame in iter_sampled_frames(
        run.input_uri,
        sample_interval_ms=sample_interval_ms or config.runtime.sample_interval_ms,
        maximum_frames=maximum_frames,
    ):
        if control_check is not None:
            control_check()
        if frame.pts_ms < start_ms:
            continue
        if end_ms is not None and frame.pts_ms >= end_ms:
            break
        frames_analyzed += 1
        for track, bbox in timeline.positions_at(frame.pts_ms):
            if track.identity_id is None:
                decision = MatchDecision.unknown("manual_unknown")
            else:
                decision = MatchDecision(track.identity_id, track.identity_id, "manual_admin_assignment")
            event = _presence_event(
                config=config,
                session_id=run.session.id,
                source_id=run.source.id,
                pts_ms=frame.pts_ms,
                track_id=track.track_id,
                bbox=bbox,
                decision=decision,
                state_override="manual" if track.identity_id else "unknown",
            )
            writer.append(event)
            proposals += 1
            if event.identity_id:
                recognized += 1
            else:
                unknown += 1
    return RunSummary("manual", frames_analyzed, proposals, recognized, unknown)


def evaluate(
    config: AnalyzerConfig,
    session_id: str,
    manifest_path: str | Path,
    *,
    start_ms: int = 0,
    end_ms: int | None = None,
) -> dict[str, Any]:
    """Evaluate held-out consented images or explicitly synthetic embeddings."""
    require_biometric_enabled(matching=True)
    actor_id = require_worker_id(None)
    database_required = configured_database_url() is not None
    if not database_required and not config_only_allowed():
        raise PolicyError(
            "biometric evaluation requires FACE_ANALYZER_DATABASE_URL; "
            "FACE_ANALYZER_ALLOW_CONFIG_ONLY=true is a non-production synthetic-test escape only"
        )
    if database_required and (end_ms is None or end_ms <= start_ms):
        raise PolicyError("DB-authoritative evaluation requires explicit start_ms/end_ms archive scope")
    authority_end_ms = end_ms if end_ms is not None else start_ms + 1
    run = _matching_authority_check(
        config,
        session_id,
        actor_id,
        database_required=database_required,
        start_ms=start_ms,
        end_ms=authority_end_ms,
    )
    engine = OpenCVFaceEngine(config)
    try:
        store = EnrollmentStore(config.runtime.enrollment_store, engine.model_fingerprint)
    except DataError as exc:
        if "model fingerprint differs" in str(exc):
            _purge_for_model_change(config, actor_id, engine.model_fingerprint)
        raise
    try:
        templates = store.templates(run.session.identity_allowlist)
    except ExpiredEnrollmentError as exc:
        _audit_expired_templates(config, actor_id, exc)
        raise
    matcher = ClosedSetMatcher(
        templates,
        minimum_similarity=config.matching.minimum_similarity,
        minimum_top_two_margin=config.matching.minimum_top_two_margin,
    )
    path = Path(manifest_path).resolve()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise DataError(f"evaluation manifest does not exist: {path}") from exc
    totals = {"samples": 0, "correct": 0, "false_positive": 0, "false_negative": 0, "unknown": 0}
    results: list[dict[str, Any]] = []
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise DataError(f"evaluation line {line_number} is invalid JSON") from exc
        if not isinstance(row, dict):
            raise DataError(f"evaluation line {line_number} must be an object")
        expected = row.get("expected_identity_id")
        if expected is not None and expected not in run.session.identity_allowlist:
            raise DataError(f"evaluation line {line_number} expected identity is outside the session allowlist")
        if "embedding" in row:
            if row.get("synthetic") is not True:
                raise DataError(
                    "persisted evaluation embeddings are accepted only when marked synthetic=true; use consented image rows"
                )
            embedding = row["embedding"]
        elif "image" in row:
            # Real-image evaluation revalidates revocation, expiry, content scope,
            # template-set fingerprint and the source kill switch for every row.
            run = _matching_authority_check(
                config,
                session_id,
                actor_id,
                database_required=database_required,
                start_ms=start_ms,
                end_ms=authority_end_ms,
            )
            subject_id = row.get("subject_identity_id")
            if subject_id not in run.session.identity_allowlist:
                raise DataError(
                    f"evaluation line {line_number} subject_identity_id must be a consented allowlisted identity"
                )
            _, image_path = authorize_enrollment_image(config, subject_id, path.parent / str(row["image"]))
            embedding = engine.extract_single_enrollment(image_path)
        else:
            raise DataError(f"evaluation line {line_number} needs image or synthetic embedding")
        decision = matcher.match(embedding, run.session.identity_allowlist)
        predicted = decision.identity_id
        totals["samples"] += 1
        if predicted is None:
            totals["unknown"] += 1
        if predicted == expected:
            totals["correct"] += 1
        if predicted is not None and predicted != expected:
            totals["false_positive"] += 1
        if expected is not None and predicted != expected:
            totals["false_negative"] += 1
        results.append(
            {
                "sample_id": str(row.get("sample_id", f"line-{line_number}")),
                "expected_identity_id": expected,
                "predicted_identity_id": predicted,
                "reason": decision.reason,
                "top_score": decision.top_score,
                "runner_up_score": decision.runner_up_score,
            }
        )
    if totals["samples"] == 0:
        raise DataError("evaluation manifest contains no samples")
    true_positive = sum(
        1
        for item in results
        if item["expected_identity_id"] is not None
        and item["predicted_identity_id"] == item["expected_identity_id"]
    )
    predicted_positive = sum(1 for item in results if item["predicted_identity_id"] is not None)
    precision = true_positive / predicted_positive if predicted_positive else 1.0
    accuracy = totals["correct"] / totals["samples"]
    return {
        **totals,
        "accuracy": accuracy,
        "precision": precision,
        "thresholds": {
            "minimum_similarity": config.matching.minimum_similarity,
            "minimum_top_two_margin": config.matching.minimum_top_two_margin,
        },
        "results": results,
        "embeddings_persisted_by_evaluation": False,
    }
