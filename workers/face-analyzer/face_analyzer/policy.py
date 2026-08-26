from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .config import AnalyzerConfig, Identity, Session, Source, is_within, utc_now
from .errors import PolicyError


@dataclass(frozen=True)
class AuthorizedRun:
    session: Session
    source: Source
    input_uri: str
    identities: dict[str, Identity]


def _is_allowed_local_host(host: str | None, allowed_hosts: frozenset[str]) -> bool:
    if not host:
        return False
    normalized = host.strip("[]").lower()
    if normalized not in allowed_hosts:
        return False
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def _authorize_file(config: AnalyzerConfig, source: Source, *, require_exists: bool) -> str:
    raw = source.uri
    parsed = urlparse(raw)
    # A Windows drive letter looks like a URL scheme to urlparse. Only reject real
    # non-file URLs here; Path handles drive letters below.
    if "://" in raw and parsed.scheme.lower() != "file":
        raise PolicyError("file sources must be local paths, not network URLs")
    if parsed.scheme.lower() == "file":
        if parsed.netloc not in {"", "localhost"}:
            raise PolicyError("file URL host must be empty or localhost")
        candidate = Path(parsed.path)
    else:
        candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = config.path.parent / candidate
    resolved = candidate.resolve()
    if not any(is_within(resolved, root) for root in config.runtime.media_roots):
        raise PolicyError("file source is outside the configured media_roots")
    if require_exists and not resolved.is_file():
        raise PolicyError(f"authorized media file does not exist: {resolved}")
    return str(resolved)


def _authorize_network(config: AnalyzerConfig, source: Source) -> str:
    parsed = urlparse(source.uri)
    if parsed.username or parsed.password:
        raise PolicyError("source URLs must not contain credentials")
    if not _is_allowed_local_host(parsed.hostname, config.runtime.allowed_local_hosts):
        raise PolicyError("HLS/OBS sources must use an explicitly allowed literal loopback host")
    if source.kind == "hls":
        if parsed.scheme.lower() not in {"http", "https"}:
            raise PolicyError("HLS sources must use HTTP or HTTPS")
        if not parsed.path.lower().endswith(".m3u8"):
            raise PolicyError("HLS source path must end in .m3u8")
    elif source.kind == "obs":
        if parsed.scheme.lower() not in {"rtmp", "rtsp", "srt"}:
            raise PolicyError("OBS sources must use local RTMP, RTSP, or SRT")
        query_keys = {key.lower() for key in parse_qs(parsed.query)}
        if {"passphrase", "password", "token", "key"}.intersection(query_keys):
            raise PolicyError("source URLs must not contain secrets")
    return source.uri


def authorize_run(
    config: AnalyzerConfig,
    session_id: str,
    *,
    expected_mode: str | None = None,
    now: datetime | None = None,
    require_input_exists: bool = True,
) -> AuthorizedRun:
    current = now or utc_now()
    session = config.sessions.get(session_id)
    if session is None:
        raise PolicyError("session is not configured")
    if expected_mode is not None and session.mode != expected_mode:
        raise PolicyError(f"session is {session.mode}, not {expected_mode}")
    if not session.active or current >= session.expires_at:
        raise PolicyError("session is inactive or expired")
    source = config.sources.get(session.source_id)
    if source is None or not source.authorized:
        raise PolicyError("source is missing or not authorized")
    if not session.identity_allowlist:
        raise PolicyError("session identity_allowlist must not be empty")
    if not session.identity_allowlist.issubset(source.participant_allowlist):
        raise PolicyError("session identities must be included in the source participant_allowlist")

    if source.kind == "file":
        input_uri = _authorize_file(config, source, require_exists=require_input_exists)
    else:
        input_uri = _authorize_network(config, source)

    identities = {identity_id: config.identities[identity_id] for identity_id in session.identity_allowlist}
    if session.mode == "biometric":
        if not source.all_visible_participants_consented:
            raise PolicyError(
                "biometric mode requires an affirmative all-visible-participants-consented declaration"
            )
        for participant_id in source.participant_allowlist:
            identity = config.identities[participant_id]
            if not identity.consent.permits_matching(session.purpose, current):
                raise PolicyError(
                    f"source participant {identity.id} lacks active template or {session.purpose}-matching consent"
                )
    else:
        # Manual mode creates no face template. These proposals remain private, so
        # public-tag permission belongs to the later web publication gate.
        for identity in identities.values():
            if not identity.consent.is_active(current):
                raise PolicyError(f"identity {identity.id} lacks an active consent record")

    return AuthorizedRun(
        session=session,
        source=source,
        input_uri=input_uri,
        identities=identities,
    )


def authorize_enrollment_image(
    config: AnalyzerConfig,
    identity_id: str,
    image_path: str | Path,
    *,
    now: datetime | None = None,
) -> tuple[Identity, Path]:
    current = now or utc_now()
    identity = config.identities.get(identity_id)
    if identity is None:
        raise PolicyError("identity is not configured")
    if not identity.consent.is_active(current) or not identity.consent.biometric_template:
        raise PolicyError("identity lacks active biometric-template consent")
    candidate = Path(image_path)
    if not candidate.is_absolute():
        candidate = config.path.parent / candidate
    resolved = candidate.resolve()
    if not any(is_within(resolved, root) for root in config.runtime.enrollment_roots):
        raise PolicyError("enrollment image is outside the configured enrollment_roots")
    if not resolved.is_file():
        raise PolicyError(f"enrollment image does not exist: {resolved}")
    return identity, resolved
