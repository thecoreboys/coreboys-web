from __future__ import annotations

import re
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from . import __version__
from .audit import require_worker_id
from .authority import configured_database_url
from .bridge import import_proposals
from .config import AnalyzerConfig, is_within
from .errors import DataError, FaceAnalyzerError, PolicyError
from .lifecycle import synchronize_db_purges
from .pipeline import run_biometric_analysis, run_manual_analysis
from .retention import cleanup_local_retention
from .runtime_gate import gate_status, require_biometric_enabled
from .store import PurgeTombstoneStore
from .vision import verified_model_fingerprint


_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
_WORKER_HEARTBEAT_SECONDS = 15.0


class JobCancelledError(PolicyError):
    pass


class NoJobAvailable(PolicyError):
    """Expected empty-queue result for a long-running worker service."""

    pass


@dataclass(frozen=True)
class ClaimedJob:
    id: str
    source_uuid: str
    content_id: str
    source_kind: str
    kind: str
    configuration: dict[str, Any]
    active_session_id: str | None


def _db_modules() -> tuple[Any, Any, Any]:
    try:
        import psycopg
        from psycopg.rows import dict_row
        from psycopg.types.json import Jsonb
    except ImportError as exc:
        raise DataError("run-job requires the optional db extra: pip install -e .[db]") from exc
    return psycopg, dict_row, Jsonb


def _job_uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError) as exc:
        raise DataError("--job-id must be a UUID") from exc


def _validate_job_configuration(
    value: Any,
    *,
    require_bounds: bool = False,
) -> tuple[int | None, int, int | None]:
    if not isinstance(value, dict):
        raise DataError("job configuration must be an object")
    unknown = set(value).difference({"samplingFps", "startMs", "endMs"})
    if unknown:
        raise DataError(f"job configuration contains unsupported keys: {', '.join(sorted(unknown))}")
    fps = value.get("samplingFps")
    if fps is not None and (isinstance(fps, bool) or not isinstance(fps, (int, float)) or not 0 <= fps <= 5):
        raise DataError("job samplingFps must be between 0 and 5")
    interval = None if fps in {None, 0, 0.0} else max(200, round(1000 / float(fps)))
    start_ms = value.get("startMs", 0)
    end_ms = value.get("endMs")
    if isinstance(start_ms, bool) or not isinstance(start_ms, int) or start_ms < 0:
        raise DataError("job startMs must be a nonnegative integer")
    if end_ms is not None and (isinstance(end_ms, bool) or not isinstance(end_ms, int) or end_ms <= start_ms):
        raise DataError("job endMs must be an integer greater than startMs")
    if require_bounds and ("startMs" not in value or end_ms is None):
        raise DataError("v1 jobs require explicit startMs and endMs archive bounds")
    return interval, start_ms, end_ms


def _claim_job(
    dsn: str,
    job_id: str | None,
    worker_id: str,
    *,
    lease_seconds: int,
    allow_automatic: bool = False,
) -> ClaimedJob:
    psycopg, dict_row, _ = _db_modules()
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT * FROM claim_face_archive_job(%s,%s,%s::uuid,%s)",
                    (worker_id, lease_seconds, job_id, allow_automatic),
                )
                row = cursor.fetchone()
                if row is None:
                    raise NoJobAvailable("no eligible archive job was claimed")
                _validate_job_configuration(row["configuration"], require_bounds=True)
                return ClaimedJob(
                    id=str(row["job_id"]), source_uuid=str(row["source_id"]), content_id=row["content_id"],
                    source_kind=row["source_kind"], kind=row["job_kind"],
                    configuration=dict(row["configuration"]), active_session_id=row["active_session_id"],
                )
    except (PolicyError, DataError, JobCancelledError):
        raise
    except Exception as exc:
        raise DataError("job claim failed closed") from exc


def _automatic_runtime_model(config: AnalyzerConfig, worker_id: str) -> str | None:
    """Return a verified model version only when both local gates are open."""
    gates = gate_status()
    if not (gates["face_analyzer_enabled"] and gates["automatic_matching_enabled"]):
        return None
    try:
        model_version = verified_model_fingerprint(config)["sface_sha256"]
        tombstones = PurgeTombstoneStore(
            config.runtime.enrollment_store.with_name("purge-tombstones.json")
        )
        if tombstones.pending(worker_id=worker_id):
            return None
        return model_version
    except (FaceAnalyzerError, OSError):
        # Capability probing must leave manual jobs and purge/retention
        # available. An automatic job is not claimable without this value.
        return None


def heartbeat_worker(
    dsn: str,
    worker_id: str,
    model_version: str | None,
    *,
    status: str = "healthy",
    error: str | None = None,
) -> str:
    """Publish non-biometric liveness through the narrow migration-024 RPC."""
    if model_version is not None and not _SHA256_RE.fullmatch(model_version):
        raise DataError("worker heartbeat requires a verified SFace SHA-256 model version")
    if status not in {"healthy", "stopping", "error"}:
        raise DataError("invalid worker heartbeat status")
    psycopg, dict_row, _ = _db_modules()
    safe_error = error[:1000] if error else None
    try:
        with psycopg.connect(dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT heartbeat_face_worker(%s,%s,%s,%s,%s,%s)::text AS heartbeat_at",
                    (
                        worker_id,
                        __version__,
                        model_version is not None,
                        model_version,
                        status,
                        safe_error,
                    ),
                )
                row = cursor.fetchone()
                if not row or not row["heartbeat_at"]:
                    raise PolicyError("worker heartbeat RPC refused liveness metadata")
                return str(row["heartbeat_at"])
    except (PolicyError, DataError):
        raise
    except Exception as exc:
        raise DataError("worker heartbeat failed closed") from exc


def _best_effort_heartbeat(
    dsn: str,
    worker_id: str,
    model_version: str | None,
    *,
    status: str,
    error: str | None = None,
) -> None:
    try:
        heartbeat_worker(dsn, worker_id, model_version, status=status, error=error)
    except Exception:
        # This helper is used only while preserving an original failure or an
        # operator stop. Normal healthy heartbeats always fail closed.
        return


class JobLease:
    def __init__(
        self,
        dsn: str,
        job: ClaimedJob,
        worker_id: str,
        *,
        lease_seconds: int,
        model_version: str | None = None,
    ) -> None:
        self.dsn = dsn
        self.job = job
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.model_version = model_version
        self.next_check = 0.0
        self.next_worker_heartbeat = 0.0

    def _connection(self) -> tuple[Any, Any, Any]:
        return _db_modules()

    def start(self) -> None:
        self.next_check = 0.0
        self.checkpoint(force=True)

    def checkpoint(self, *, force: bool = False) -> None:
        if not force and time.monotonic() < self.next_check:
            return
        psycopg, dict_row, _ = self._connection()
        with psycopg.connect(self.dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT heartbeat_face_job(%s::uuid,%s,%s) AS renewed",
                    (self.job.id, self.worker_id, self.lease_seconds),
                )
                row = cursor.fetchone()
                if row and row["renewed"]:
                    now = time.monotonic()
                    if self.model_version is not None and now >= self.next_worker_heartbeat:
                        cursor.execute(
                            "SELECT heartbeat_face_worker(%s,%s,true,%s,'healthy',NULL)::text AS heartbeat_at",
                            (self.worker_id, __version__, self.model_version),
                        )
                        heartbeat = cursor.fetchone()
                        if not heartbeat or not heartbeat["heartbeat_at"]:
                            raise JobCancelledError("worker heartbeat RPC refused liveness metadata")
                        self.next_worker_heartbeat = now + _WORKER_HEARTBEAT_SECONDS
                    # Local DB polling keeps cancellation/kill-switch latency at
                    # one second or less while frames are flowing.
                    self.next_check = now + 1.0
                    return
                raise JobCancelledError("job lease, source authority, or administrator approval was withdrawn")

    def finish(self, status: str, *, error: str | None = None) -> bool:
        if status not in {"succeeded", "failed", "cancelled"}:
            raise ValueError("invalid terminal job status")
        psycopg, dict_row, _ = self._connection()
        safe_error = error[:2000] if error else None
        with psycopg.connect(self.dsn, connect_timeout=5, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT finish_face_job(%s::uuid,%s,%s,%s) AS finished",
                    (self.job.id, self.worker_id, status, safe_error),
                )
                row = cursor.fetchone()
                return bool(row and row["finished"])


def _resolve_session(config: AnalyzerConfig, job: ClaimedJob) -> str:
    sources = [source for source in config.sources.values() if source.content_id == job.content_id]
    if len(sources) != 1:
        raise PolicyError("job content_id must map to exactly one protected worker-config source")
    source = sources[0]
    expected_mode = "manual" if job.kind == "manual_review" else "biometric"
    sessions = [
        session for session in config.sessions.values()
        if session.source_id == source.id
        and session.mode == expected_mode
        and session.purpose == job.source_kind
        and session.active
    ]
    if job.active_session_id is not None:
        sessions = [session for session in sessions if session.id == job.active_session_id]
    if len(sessions) != 1:
        raise PolicyError("job must map to exactly one active worker-config session")
    return sessions[0].id


def run_job(
    config: AnalyzerConfig,
    job_id: str | None,
    *,
    worker_id: str | None = None,
    lease_seconds: int = 60,
) -> dict[str, Any]:
    if not 30 <= lease_seconds <= 300:
        raise DataError("lease seconds must be between 30 and 300")
    actor_id = require_worker_id(worker_id)
    dsn = configured_database_url()
    if dsn is None:
        raise PolicyError("run-job requires FACE_ANALYZER_DATABASE_URL")
    normalized_job_id = _job_uuid(job_id) if job_id is not None else None
    model_version = _automatic_runtime_model(config, actor_id)
    heartbeat_worker(dsn, actor_id, model_version, status="healthy")
    job = _claim_job(
        dsn,
        normalized_job_id,
        actor_id,
        lease_seconds=lease_seconds,
        allow_automatic=model_version is not None,
    )
    lease: JobLease | None = None
    try:
        session_id = _resolve_session(config, job)
        interval, start_ms, end_ms = _validate_job_configuration(job.configuration, require_bounds=True)
        output_path = (config.runtime.data_dir / "job-proposals" / f"{job.id}.ndjson").resolve()
        if not is_within(output_path, config.runtime.data_dir):
            raise PolicyError("job proposal path escaped runtime.data_dir")
        if job.kind == "archive_scan":
            require_biometric_enabled(matching=True)
            if model_version is None:
                raise PolicyError("automatic archive job was claimed without a verified biometric runtime")
        lease = JobLease(
            dsn,
            job,
            actor_id,
            lease_seconds=lease_seconds,
            model_version=model_version,
        )
        lease.start()
        if job.kind == "manual_review":
            manual_path = (config.runtime.data_dir / "manual-jobs" / f"{job.id}.json").resolve()
            if not is_within(manual_path, config.runtime.data_dir) or not manual_path.is_file():
                raise DataError(
                    "manual job requires operator-authored keyframes at runtime.data_dir/manual-jobs/<job-id>.json"
                )
            summary = run_manual_analysis(
                config, session_id, manual_path, event_output=output_path,
                sample_interval_ms=interval, start_ms=start_ms, end_ms=end_ms,
                control_check=lease.checkpoint,
            )
        else:
            summary = run_biometric_analysis(
                config, session_id, event_output=output_path,
                sample_interval_ms=interval, start_ms=start_ms, end_ms=end_ms,
                control_check=lease.checkpoint,
            )
        lease.checkpoint(force=True)
        if summary.proposals_written:
            imported = import_proposals(
                config, session_id, input_path=output_path, database_url=dsn,
                worker_id=actor_id, request_id=f"face-job:{job.id}", job_id=job.id,
                sample_interval_ms=interval or config.runtime.sample_interval_ms,
                scope_start_ms=start_ms,
                scope_end_ms=end_ms,
                finish_job=True,
            )
        else:
            imported = {
                "source_content_id": job.content_id,
                "session_id": session_id,
                "tracks_aggregated": 0,
                "inserted": 0,
                "updated": 0,
                "unchanged": 0,
                "skipped_reviewed": 0,
                "approved": 0,
                "published": 0,
                "biometric_payloads_transmitted": 0,
                "request_id": f"face-job:{job.id}",
            }
        if summary.proposals_written:
            # Proposal RPCs and finish_face_job committed in the same DB
            # transaction, so cancellation cannot leave a partial batch.
            pass
        else:
            lease.checkpoint(force=True)
            if not lease.finish("succeeded"):
                raise JobCancelledError("zero-track job lost its lease before completion")
        # The canonical proposals now live in private DB rows. The transient
        # NDJSON has no remaining operational purpose and is removed immediately.
        transient_deleted = True
        try:
            output_path.unlink(missing_ok=True)
        except OSError:
            # The DB job is already atomically succeeded. Retention cleanup will
            # retry this non-biometric proposal deletion without falsifying the
            # terminal job state.
            transient_deleted = False
        return {
            "job_id": job.id,
            "status": "succeeded",
            "session_id": session_id,
            "analysis": asdict(summary),
            "import": imported,
            "automatic_approvals": 0,
            "automatic_publications": 0,
            "protected_input_source": "worker_config",
            "transient_proposal_file_deleted": transient_deleted,
        }
    except JobCancelledError:
        if lease is not None:
            try:
                lease.finish("cancelled", error="cancelled or kill-switched during worker execution")
            except Exception:
                pass
        raise
    except Exception as exc:
        if lease is not None:
            try:
                lease.finish("failed", error=str(exc))
            except Exception:
                pass
        _best_effort_heartbeat(
            dsn, actor_id, model_version, status="error", error=str(exc)
        )
        raise


def serve(
    config: AnalyzerConfig,
    *,
    worker_id: str | None = None,
    lease_seconds: int = 60,
    poll_seconds: float = 5.0,
    _maximum_cycles: int | None = None,
) -> dict[str, Any]:
    """Run the supervised DB-authoritative worker loop.

    The private ``_maximum_cycles`` hook exists only for deterministic tests;
    production invocations run until an operator or service manager stops them.
    """
    if not 1 <= poll_seconds <= 60:
        raise DataError("poll seconds must be between 1 and 60")
    if not 30 <= lease_seconds <= 300:
        raise DataError("lease seconds must be between 30 and 300")
    if _maximum_cycles is not None and _maximum_cycles < 1:
        raise DataError("maximum service cycles must be positive")
    actor_id = require_worker_id(worker_id)
    dsn = configured_database_url()
    if dsn is None:
        raise PolicyError("serve requires FACE_ANALYZER_DATABASE_URL")
    completed_jobs = 0
    idle_polls = 0
    purge_count = 0
    cycles = 0
    model_version: str | None = None
    try:
        while True:
            purge_result = synchronize_db_purges(config, worker_id=actor_id)
            purge_count += len(purge_result["purged"]) + len(
                purge_result.get("tombstones_acknowledged", [])
            )
            cleanup_local_retention(config)
            model_version = _automatic_runtime_model(config, actor_id)
            heartbeat_worker(dsn, actor_id, model_version, status="healthy")
            try:
                run_job(
                    config,
                    None,
                    worker_id=actor_id,
                    lease_seconds=lease_seconds,
                )
                completed_jobs += 1
            except NoJobAvailable:
                idle_polls += 1
            cycles += 1
            if _maximum_cycles is not None and cycles >= _maximum_cycles:
                return {
                    "status": "healthy" if model_version is not None else "manual_only",
                    "biometric_heartbeat_active": model_version is not None,
                    "cycles": cycles,
                    "completed_jobs": completed_jobs,
                    "idle_polls": idle_polls,
                    "local_template_purges_acknowledged": purge_count,
                }
            time.sleep(poll_seconds)
    except KeyboardInterrupt:
        _best_effort_heartbeat(
            dsn, actor_id, model_version, status="stopping", error="operator stop"
        )
        raise
    except Exception as exc:
        _best_effort_heartbeat(
            dsn, actor_id, model_version, status="error", error=str(exc)
        )
        raise
