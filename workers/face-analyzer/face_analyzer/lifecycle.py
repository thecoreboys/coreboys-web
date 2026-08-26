from __future__ import annotations

from typing import Any

from .audit import append_worker_audit, require_worker_id
from .config import AnalyzerConfig
from .errors import DataError
from .locking import serialized_enrollment_operation
from .store import EnrollmentStore, PurgeTombstoneStore


def _tombstones(config: AnalyzerConfig) -> PurgeTombstoneStore:
    return PurgeTombstoneStore(config.runtime.enrollment_store.with_name("purge-tombstones.json"))


@serialized_enrollment_operation
def purge_local_enrollment(
    config: AnalyzerConfig,
    identity_id: str,
    *,
    reason: str,
    worker_id: str | None = None,
) -> dict[str, Any]:
    normalized_reason = reason.strip()
    if not 3 <= len(normalized_reason) <= 500:
        raise DataError("purge reason must contain 3..500 characters")
    if identity_id not in config.identities:
        raise DataError("identity is not configured")
    actor_id = require_worker_id(worker_id)
    metadata = EnrollmentStore.metadata(config.runtime.enrollment_store)
    local_record = metadata.get("identities", {}).get(identity_id)
    fingerprint = local_record.get("template_fingerprint") if isinstance(local_record, dict) else None
    tombstones = _tombstones(config)
    if isinstance(fingerprint, str) and len(fingerprint) == 64:
        tombstones.begin(
            identity_id=identity_id,
            worker_id=actor_id,
            fingerprint=fingerprint,
            template_set_id=local_record.get("template_set_id"),
            reason=normalized_reason,
        )
    result = EnrollmentStore.purge_identity(config.runtime.enrollment_store, identity_id)
    if result["deleted"] and isinstance(result.get("template_fingerprint"), str):
        tombstones.deleted(result["template_fingerprint"])
    append_worker_audit(
        config.runtime.audit_output,
        actor_id=actor_id,
        action="face.enrollment.local_purged" if result["deleted"] else "face.enrollment.local_purge_noop",
        identity_id=identity_id,
        details={
            "reason": normalized_reason,
            "deleted": result["deleted"],
            "reference_count": result["reference_count"],
            "template_fingerprint": result.get("template_fingerprint"),
            "biometric_payload_logged": False,
        },
    )
    # Local deletion is the safety-critical action and is never rolled back by a
    # DB outage. When available, mirror only deletion metadata into the private
    # worker audit table so admin readiness cannot remain falsely green.
    from .authority import record_db_local_purge

    db_audit_recorded = record_db_local_purge(
        config,
        identity_id,
        actor_id=actor_id,
        reason=normalized_reason,
        deleted=result["deleted"],
        template_fingerprint=result.get("template_fingerprint"),
        template_set_id=result.get("template_set_id"),
    )
    if db_audit_recorded and isinstance(result.get("template_fingerprint"), str):
        tombstones.acknowledge(result["template_fingerprint"])
    return {
        **result,
        "audit_output": str(config.runtime.audit_output),
        "reason": normalized_reason,
        "db_audit_recorded": db_audit_recorded,
        "purge_tombstone_pending": bool(result["deleted"] and not db_audit_recorded),
    }


@serialized_enrollment_operation
def synchronize_db_purges(
    config: AnalyzerConfig,
    *,
    worker_id: str | None = None,
) -> dict[str, Any]:
    """Delete exact local sets requested by DB revocation/expiry authority."""
    actor_id = require_worker_id(worker_id)
    tombstones = _tombstones(config)
    purged: list[str] = []
    blocked: list[dict[str, str]] = []
    tombstone_retries = 0
    tombstones_acknowledged: list[str] = []

    # Retry locally proven deletions first. This is independent of whether the
    # DB row is currently purge_pending, so a DB outage during an explicit
    # replacement/revocation cannot strand an active metadata row forever.
    from .authority import list_db_purge_requests, record_db_local_purge

    initial_metadata = EnrollmentStore.metadata(config.runtime.enrollment_store)
    initial_local_identities = initial_metadata.get("identities", {})
    for tombstone in tombstones.pending(worker_id=actor_id):
        tombstone_retries += 1
        identity_id = tombstone["identity_id"]
        if identity_id not in config.identities:
            blocked.append({"identity_id": identity_id, "reason": "purge tombstone identity is no longer configured"})
            continue
        fingerprint = tombstone["template_fingerprint"]
        local = initial_local_identities.get(identity_id)
        if isinstance(local, dict) and local.get("template_fingerprint") == fingerprint:
            # A crash may have happened after the pre-delete tombstone but
            # before deletion. Complete the local deletion before attesting it.
            result = EnrollmentStore.purge_identity(
                config.runtime.enrollment_store,
                identity_id,
            )
            tombstones.deleted(fingerprint)
            append_worker_audit(
                config.runtime.audit_output,
                actor_id=actor_id,
                action="face.enrollment.local_purge_resumed",
                identity_id=identity_id,
                details={
                    "reason": str(tombstone.get("reason", "resume interrupted exact local purge")),
                    "deleted": result["deleted"],
                    "template_fingerprint": fingerprint,
                    "biometric_payload_logged": False,
                },
            )
            acknowledged = record_db_local_purge(
                config,
                identity_id,
                actor_id=actor_id,
                reason=str(tombstone.get("reason", "resume interrupted exact local purge")),
                deleted=result["deleted"],
                template_fingerprint=fingerprint,
                template_set_id=tombstone.get("template_set_id"),
            )
            if acknowledged:
                tombstones.acknowledge(fingerprint)
                tombstones_acknowledged.append(identity_id)
            continue
        acknowledged = record_db_local_purge(
            config,
            identity_id,
            actor_id=actor_id,
            reason=str(tombstone.get("reason", "retry exact local purge attestation")),
            deleted=True,
            template_fingerprint=fingerprint,
            template_set_id=tombstone.get("template_set_id"),
        )
        if acknowledged:
            tombstones.acknowledge(fingerprint)
            tombstones_acknowledged.append(identity_id)
        else:
            blocked.append({
                "identity_id": identity_id,
                "reason": "exact local purge tombstone is awaiting DB attestation",
            })

    requests = list_db_purge_requests(config, actor_id=actor_id)
    metadata = EnrollmentStore.metadata(config.runtime.enrollment_store)
    local_identities = metadata.get("identities", {})
    for request in requests:
        identity_id = request["identity_id"]
        local = local_identities.get(identity_id)
        if not isinstance(local, dict):
            tombstone = tombstones.find(
                identity_id=identity_id,
                worker_id=actor_id,
                fingerprint=request["template_fingerprint"],
            )
            if tombstone and tombstone.get("state") in {"delete_started", "deleted_unacknowledged"}:
                acknowledged = record_db_local_purge(
                    config,
                    identity_id,
                    actor_id=actor_id,
                    reason=str(tombstone.get("reason", "retry exact local purge attestation")),
                    deleted=True,
                    template_fingerprint=request["template_fingerprint"],
                    template_set_id=request["template_set_id"],
                )
                if acknowledged:
                    tombstones.acknowledge(request["template_fingerprint"])
                    purged.append(identity_id)
                    continue
            blocked.append({"identity_id": identity_id, "reason": "local template is absent without a matching worker tombstone"})
            continue
        if local.get("template_fingerprint") != request["template_fingerprint"]:
            blocked.append({"identity_id": identity_id, "reason": "local/DB template fingerprint mismatch"})
            continue
        result = purge_local_enrollment(
            config,
            identity_id,
            reason="canonical DB requested local purge after revocation or expiry",
            worker_id=actor_id,
        )
        if result["deleted"] and result["db_audit_recorded"]:
            purged.append(identity_id)
        else:
            blocked.append({"identity_id": identity_id, "reason": "local deletion occurred but DB attestation did not match"})
    return {
        "requested": len(requests),
        "purged": purged,
        "blocked": blocked,
        "tombstone_retries": tombstone_retries,
        "tombstones_acknowledged": tombstones_acknowledged,
    }
