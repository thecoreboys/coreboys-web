from __future__ import annotations

import argparse
import json
import sys
import traceback
from dataclasses import asdict
from pathlib import Path
from typing import Sequence

from .config import load_config
from .errors import FaceAnalyzerError
from .bridge import import_proposals
from .lifecycle import purge_local_enrollment, synchronize_db_purges
from .jobs import run_job, serve
from .locking import exclusive_local_lock
from .retention import cleanup_local_retention
from .pipeline import enroll_identity, evaluate, run_biometric_analysis, run_manual_analysis
from .status import worker_status


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="core-face-analyzer",
        description="Local, consent-gated face-tag proposal worker",
    )
    parser.add_argument("--debug", action="store_true", help="show tracebacks for local debugging")
    subcommands = parser.add_subparsers(dest="command", required=True)

    enroll = subcommands.add_parser(
        "enroll",
        help="create fixed-model SFace templates from consented local reference images",
    )
    enroll.add_argument("--config", required=True, type=Path)
    enroll.add_argument("--session", required=True, help="authorized biometric session defining source and scope")
    enroll.add_argument("--identity", required=True)
    enroll.add_argument("--image", required=True, action="append", type=Path)
    enroll.add_argument("--replace", action="store_true", help="replace an existing identity's templates")
    enroll.add_argument("--worker-id", help="local/DB audit actor (or FACE_ANALYZER_WORKER_ID)")

    analyze = subcommands.add_parser("analyze", help="analyze one authorized configured session")
    analyze.add_argument("--config", required=True, type=Path)
    analyze.add_argument("--session", required=True)
    analyze.add_argument(
        "--manual-tracks",
        type=Path,
        help="admin-authored normalized keyframes; required for manual sessions",
    )
    analyze.add_argument(
        "--max-frames",
        type=int,
        help="stop after this many sampled frames (recommended during validation)",
    )
    analyze.add_argument("--start-ms", type=int, default=0, help="inclusive media PTS bound")
    analyze.add_argument("--end-ms", type=int, help="exclusive media PTS bound; required with DB authority")

    evaluation = subcommands.add_parser(
        "evaluate",
        help="evaluate thresholds on held-out consented images or synthetic test vectors",
    )
    evaluation.add_argument("--config", required=True, type=Path)
    evaluation.add_argument("--session", required=True)
    evaluation.add_argument("--manifest", required=True, type=Path)
    evaluation.add_argument("--start-ms", type=int, default=0)
    evaluation.add_argument("--end-ms", type=int, help="required DB-authoritative archive scope end")

    purge = subcommands.add_parser(
        "purge-enrollment",
        help="delete one identity's local templates without loading model files",
    )
    purge.add_argument("--config", required=True, type=Path)
    purge.add_argument("--identity", required=True)
    purge.add_argument("--reason", required=True)
    purge.add_argument("--worker-id", help="local audit actor (or FACE_ANALYZER_WORKER_ID)")

    status = subcommands.add_parser(
        "status",
        help="report honest local/admin-integrated biometric readiness",
    )
    status.add_argument("--config", required=True, type=Path)
    status.add_argument("--session", help="configured session to evaluate end to end")
    status.add_argument("--start-ms", type=int, default=0)
    status.add_argument("--end-ms", type=int, help="required for DB archive-scope readiness")

    sync_purges = subcommands.add_parser(
        "sync-purges",
        help="delete exact local templates assigned to this worker by DB revocation/expiry",
    )
    sync_purges.add_argument("--config", required=True, type=Path)
    sync_purges.add_argument("--worker-id", help="worker owner id (or FACE_ANALYZER_WORKER_ID)")

    proposal_import = subcommands.add_parser(
        "import-proposals",
        help="aggregate review-only NDJSON into migration-024 proposed DB tracks",
    )
    proposal_import.add_argument("--config", required=True, type=Path)
    proposal_import.add_argument("--session", required=True)
    proposal_import.add_argument("--job-id", required=True, help="currently owned, unexpired DB job lease")
    proposal_import.add_argument(
        "--input",
        type=Path,
        help="NDJSON under runtime.data_dir (defaults to runtime.event_output)",
    )
    proposal_import.add_argument(
        "--worker-id",
        help="audit actor id (or set FACE_ANALYZER_WORKER_ID)",
    )
    proposal_import.add_argument(
        "--request-id",
        help="optional audit request id; defaults to a proposal-file digest",
    )

    job = subcommands.add_parser(
        "run-job",
        help="claim and execute one DB-authorized migration-024 job with a renewable lease",
    )
    job.add_argument("--config", required=True, type=Path)
    job.add_argument("--job-id", required=True)
    job.add_argument("--worker-id", help="lease/audit worker id (or FACE_ANALYZER_WORKER_ID)")
    job.add_argument("--lease-seconds", type=int, default=60)

    work_once = subcommands.add_parser(
        "work-once",
        help="claim and execute the next eligible scoped archive/manual job, then exit",
    )
    work_once.add_argument("--config", required=True, type=Path)
    work_once.add_argument("--worker-id", help="lease/audit worker id (or FACE_ANALYZER_WORKER_ID)")
    work_once.add_argument("--lease-seconds", type=int, default=60)

    service = subcommands.add_parser(
        "serve",
        help="run the supervised DB-authoritative job, purge, retention, and conditional biometric-heartbeat loop",
    )
    service.add_argument("--config", required=True, type=Path)
    service.add_argument("--worker-id", help="lease/heartbeat worker id (or FACE_ANALYZER_WORKER_ID)")
    service.add_argument("--lease-seconds", type=int, default=60)
    service.add_argument("--poll-seconds", type=float, default=5.0)

    retention = subcommands.add_parser(
        "cleanup-retention",
        help="delete worker-owned manual evidence after 7d and diagnostics after 30d",
    )
    retention.add_argument("--config", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    arguments = parser.parse_args(argv)
    instance_lock = None
    instance_lock_entered = False
    try:
        config = load_config(arguments.config)
        if arguments.command != "status":
            instance_lock = exclusive_local_lock(
                config.runtime.data_dir / ".face-analyzer.instance.lock",
                purpose="face-analyzer worker instance",
                timeout_seconds=0,
            )
            instance_lock.__enter__()
            instance_lock_entered = True
        if arguments.command == "enroll":
            result = enroll_identity(
                config,
                arguments.session,
                arguments.identity,
                arguments.image,
                replace=arguments.replace,
                worker_id=arguments.worker_id,
            )
        elif arguments.command == "analyze":
            session = config.sessions.get(arguments.session)
            if session is None:
                raise FaceAnalyzerError("session is not configured")
            if session.mode == "manual":
                if arguments.manual_tracks is None:
                    raise FaceAnalyzerError("manual session requires --manual-tracks")
                result = asdict(
                    run_manual_analysis(
                        config,
                        arguments.session,
                        arguments.manual_tracks,
                        maximum_frames=arguments.max_frames,
                        start_ms=arguments.start_ms,
                        end_ms=arguments.end_ms,
                    )
                )
            else:
                if arguments.manual_tracks is not None:
                    raise FaceAnalyzerError("--manual-tracks cannot be used with a biometric session")
                result = asdict(
                    run_biometric_analysis(
                        config,
                        arguments.session,
                        maximum_frames=arguments.max_frames,
                        start_ms=arguments.start_ms,
                        end_ms=arguments.end_ms,
                    )
                )
        elif arguments.command == "evaluate":
            result = evaluate(
                config,
                arguments.session,
                arguments.manifest,
                start_ms=arguments.start_ms,
                end_ms=arguments.end_ms,
            )
        elif arguments.command == "purge-enrollment":
            result = purge_local_enrollment(
                config,
                arguments.identity,
                reason=arguments.reason,
                worker_id=arguments.worker_id,
            )
        elif arguments.command == "status":
            result = worker_status(
                config, arguments.session, start_ms=arguments.start_ms, end_ms=arguments.end_ms
            )
        elif arguments.command == "sync-purges":
            result = synchronize_db_purges(config, worker_id=arguments.worker_id)
        elif arguments.command == "import-proposals":
            result = import_proposals(
                config,
                arguments.session,
                input_path=arguments.input,
                database_url=None,
                worker_id=arguments.worker_id,
                request_id=arguments.request_id,
                job_id=arguments.job_id,
                finish_job=True,
            )
        elif arguments.command == "run-job":
            result = run_job(
                config,
                arguments.job_id,
                worker_id=arguments.worker_id,
                lease_seconds=arguments.lease_seconds,
            )
        elif arguments.command == "work-once":
            result = run_job(
                config,
                None,
                worker_id=arguments.worker_id,
                lease_seconds=arguments.lease_seconds,
            )
        elif arguments.command == "serve":
            result = serve(
                config,
                worker_id=arguments.worker_id,
                lease_seconds=arguments.lease_seconds,
                poll_seconds=arguments.poll_seconds,
            )
        elif arguments.command == "cleanup-retention":
            result = cleanup_local_retention(config)
        else:  # pragma: no cover - argparse guarantees this
            parser.error("unknown command")
            return 2
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except FaceAnalyzerError as exc:
        print(f"refused: {exc}", file=sys.stderr)
        if arguments.debug:
            traceback.print_exc()
        return 2
    except KeyboardInterrupt:
        print("stopped by operator", file=sys.stderr)
        return 130
    except Exception:
        print("refused: unexpected local failure (rerun with --debug for details)", file=sys.stderr)
        if arguments.debug:
            traceback.print_exc()
        return 2
    finally:
        if instance_lock_entered and instance_lock is not None:
            instance_lock.__exit__(None, None, None)


if __name__ == "__main__":
    raise SystemExit(main())
