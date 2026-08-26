from __future__ import annotations

from typing import Any

from .authority import AuthorityRevokedError, assert_db_matching_authority, configured_database_url
from .config import AnalyzerConfig
from .errors import FaceAnalyzerError
from .policy import authorize_run
from .runtime_gate import gate_status
from .store import EnrollmentStore
from .vision import verified_model_fingerprint


def worker_status(
    config: AnalyzerConfig,
    session_id: str | None,
    *,
    start_ms: int = 0,
    end_ms: int | None = None,
) -> dict[str, Any]:
    gates = gate_status()
    database_configured = configured_database_url() is not None
    try:
        metadata = EnrollmentStore.metadata(config.runtime.enrollment_store)
        local_error = None
    except FaceAnalyzerError as exc:
        metadata = {"identities": {}, "model_fingerprint": {}}
        local_error = str(exc)
    safe_identities = {
        identity_id: {
            "template_count": record.get("template_count", 0),
            "consent_expires_at": record.get("consent_expires_at"),
            "expired": record.get("expired", True),
            "approved_reference_hash_count": len(record.get("reference_image_sha256", [])),
        }
        for identity_id, record in metadata.get("identities", {}).items()
        if isinstance(record, dict)
    }
    try:
        verified = verified_model_fingerprint(config)
        models_verified = verified == metadata.get("model_fingerprint")
        model_error = None if models_verified else "verified models do not match the local enrollment fingerprint"
    except FaceAnalyzerError as exc:
        models_verified = False
        model_error = str(exc)

    result: dict[str, Any] = {
        "review_only": config.runtime.review_only,
        "gates": gates,
        "database_configured": database_configured,
        "models_verified_for_local_store": models_verified,
        "model_error": model_error,
        "local_store_error": local_error,
        "identities": safe_identities,
        "session_id": session_id,
        "local_config_only_capable": False,
        "ready_for_integrated_biometric_matching": False,
        "operator_reference_bridge_required": True,
        "reason": "a biometric session id is required for readiness",
    }
    if session_id is None:
        return result
    try:
        run = authorize_run(config, session_id, require_input_exists=False)
    except FaceAnalyzerError as exc:
        result["reason"] = str(exc)
        return result
    if run.session.mode == "manual":
        result.update(
            {
                "local_config_only_capable": True,
                "operator_reference_bridge_required": False,
                "reason": "manual session is available and does not use biometrics",
            }
        )
        return result

    enrolled = all(
        identity_id in safe_identities
        and safe_identities[identity_id]["template_count"] >= 3
        and not safe_identities[identity_id]["expired"]
        for identity_id in run.session.identity_allowlist
    )
    gates_ready = gates["face_analyzer_enabled"] and gates["automatic_matching_enabled"]
    result["local_config_only_capable"] = bool(
        gates["config_only_escape_enabled"] and enrolled and gates_ready and models_verified
    )
    if not database_configured:
        result["reason"] = (
            "local config-only prerequisites pass, but admin-integrated readiness is false until "
            "FACE_ANALYZER_DATABASE_URL and approved-reference authority are connected"
            if result["local_config_only_capable"]
            else "local model, enrollment, or environment-gate prerequisites are incomplete"
        )
        return result
    if end_ms is None or end_ms <= start_ms:
        result["reason"] = "DB readiness requires an explicit archive start_ms/end_ms scope"
        return result
    try:
        authority = assert_db_matching_authority(
            config, run, metadata, start_ms=start_ms, end_ms=end_ms
        )
    except AuthorityRevokedError as exc:
        result["reason"] = str(exc)
        result["local_purge_required"] = list(exc.identity_ids)
        return result
    except FaceAnalyzerError as exc:
        result["reason"] = str(exc)
        return result
    ready = bool(
        authority["db_authoritative"]
        and enrolled
        and gates_ready
        and models_verified
        and config.runtime.review_only
    )
    result.update(
        {
            "ready_for_integrated_biometric_matching": ready,
            "operator_reference_bridge_required": not ready,
            "reason": "ready for private review-only matching" if ready else "one or more readiness gates failed",
        }
    )
    return result
