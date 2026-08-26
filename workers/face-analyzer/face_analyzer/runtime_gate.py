from __future__ import annotations

import os

from .errors import PolicyError


def flag_enabled(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() == "true"


def require_biometric_enabled(*, matching: bool) -> None:
    if not flag_enabled("FACE_ANALYZER_ENABLED"):
        raise PolicyError("biometric operation is disabled; set FACE_ANALYZER_ENABLED=true explicitly")
    if matching and not flag_enabled("FACE_AUTOMATIC_MATCHING_ENABLED"):
        raise PolicyError(
            "biometric matching is disabled; set FACE_AUTOMATIC_MATCHING_ENABLED=true explicitly"
        )


def config_only_allowed() -> bool:
    """Explicit non-production escape hatch; DB authority remains the default."""
    return flag_enabled("FACE_ANALYZER_ALLOW_CONFIG_ONLY")


def gate_status() -> dict[str, bool]:
    return {
        "face_analyzer_enabled": flag_enabled("FACE_ANALYZER_ENABLED"),
        "automatic_matching_enabled": flag_enabled("FACE_AUTOMATIC_MATCHING_ENABLED"),
        "config_only_escape_enabled": config_only_allowed(),
    }
