from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from .errors import ConfigError


_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$")
_CANONICAL_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


def parse_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{field} must be an ISO-8601 timestamp")
    normalized = value.strip().replace("Z", "+00:00")
    try:
        result = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ConfigError(f"{field} must be an ISO-8601 timestamp") from exc
    if result.tzinfo is None:
        raise ConfigError(f"{field} must include a timezone")
    return result.astimezone(timezone.utc)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _require_mapping(value: Any, field: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise ConfigError(f"{field} must be an object")
    return value


def _require_list(value: Any, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise ConfigError(f"{field} must be an array")
    return value


def _require_id(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise ConfigError(f"{field} must be a safe, non-empty identifier")
    return value


def _require_bool(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise ConfigError(f"{field} must be true or false")
    return value


def _number(value: Any, field: str, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"{field} must be a number")
    result = float(value)
    if not minimum <= result <= maximum:
        raise ConfigError(f"{field} must be between {minimum} and {maximum}")
    return result


def _integer(value: Any, field: str, *, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigError(f"{field} must be an integer")
    if not minimum <= value <= maximum:
        raise ConfigError(f"{field} must be between {minimum} and {maximum}")
    return value


def _resolve(base_dir: Path, value: Any, field: str) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{field} must be a local path")
    candidate = Path(value.strip())
    return (candidate if candidate.is_absolute() else base_dir / candidate).resolve()


def is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


@dataclass(frozen=True)
class Consent:
    biometric_template: bool
    live_matching: bool
    archive_matching: bool
    public_tag: bool
    granted_at: datetime
    expires_at: datetime

    def is_active(self, now: datetime) -> bool:
        return self.granted_at <= now < self.expires_at

    def permits_matching(self, purpose: str, now: datetime) -> bool:
        if not self.is_active(now) or not self.biometric_template:
            return False
        return self.live_matching if purpose == "live" else self.archive_matching


@dataclass(frozen=True)
class Identity:
    id: str
    display_name: str
    canonical_kind: str
    canonical_slug: str
    consent: Consent


@dataclass(frozen=True)
class Source:
    id: str
    content_id: str
    kind: str
    uri: str
    authorized: bool
    all_visible_participants_consented: bool
    participant_allowlist: frozenset[str]


@dataclass(frozen=True)
class Session:
    id: str
    source_id: str
    mode: str
    purpose: str
    active: bool
    expires_at: datetime
    identity_allowlist: frozenset[str]


@dataclass(frozen=True)
class ModelSpec:
    path: Path
    sha256: str


@dataclass(frozen=True)
class MatchingSettings:
    minimum_similarity: float
    minimum_top_two_margin: float
    consensus_window: int
    consensus_hits: int
    maximum_consensus_gap_ms: int


@dataclass(frozen=True)
class QualitySettings:
    detector_score_threshold: float
    minimum_face_pixels: int
    minimum_sharpness: float
    minimum_mean_luminance: float
    maximum_mean_luminance: float


@dataclass(frozen=True)
class RuntimeSettings:
    data_dir: Path
    enrollment_roots: tuple[Path, ...]
    media_roots: tuple[Path, ...]
    event_output: Path
    audit_output: Path
    enrollment_store: Path
    allowed_local_hosts: frozenset[str]
    sample_interval_ms: int
    authority_recheck_seconds: int
    review_only: bool


@dataclass(frozen=True)
class AnalyzerConfig:
    path: Path
    runtime: RuntimeSettings
    yunet: ModelSpec
    sface: ModelSpec
    matching: MatchingSettings
    quality: QualitySettings
    identities: Mapping[str, Identity]
    sources: Mapping[str, Source]
    sessions: Mapping[str, Session]


def _parse_consent(raw: Any, field: str) -> Consent:
    value = _require_mapping(raw, field)
    granted_at = parse_timestamp(value.get("granted_at"), f"{field}.granted_at")
    expires_at = parse_timestamp(value.get("expires_at"), f"{field}.expires_at")
    if expires_at <= granted_at:
        raise ConfigError(f"{field}.expires_at must be after granted_at")
    return Consent(
        biometric_template=_require_bool(value.get("biometric_template"), f"{field}.biometric_template"),
        live_matching=_require_bool(value.get("live_matching"), f"{field}.live_matching"),
        archive_matching=_require_bool(value.get("archive_matching"), f"{field}.archive_matching"),
        public_tag=_require_bool(value.get("public_tag"), f"{field}.public_tag"),
        granted_at=granted_at,
        expires_at=expires_at,
    )


def _parse_id_set(raw: Any, field: str) -> frozenset[str]:
    values = _require_list(raw, field)
    ids = [_require_id(item, f"{field}[]") for item in values]
    if len(ids) != len(set(ids)):
        raise ConfigError(f"{field} contains duplicate identities")
    return frozenset(ids)


def load_config(path: str | Path) -> AnalyzerConfig:
    config_path = Path(path).resolve()
    try:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigError(f"config file does not exist: {config_path}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(f"config is not valid JSON: {exc}") from exc
    root = _require_mapping(raw, "config")
    if root.get("version") != 1:
        raise ConfigError("config.version must be 1")
    base = config_path.parent

    runtime_raw = _require_mapping(root.get("runtime"), "runtime")
    data_dir = _resolve(base, runtime_raw.get("data_dir"), "runtime.data_dir")
    enrollment_roots = tuple(
        _resolve(base, item, "runtime.enrollment_roots[]")
        for item in _require_list(runtime_raw.get("enrollment_roots"), "runtime.enrollment_roots")
    )
    media_roots = tuple(
        _resolve(base, item, "runtime.media_roots[]")
        for item in _require_list(runtime_raw.get("media_roots"), "runtime.media_roots")
    )
    if not enrollment_roots or not media_roots:
        raise ConfigError("runtime enrollment_roots and media_roots must not be empty")
    event_output = _resolve(base, runtime_raw.get("event_output"), "runtime.event_output")
    audit_output = _resolve(base, runtime_raw.get("audit_output"), "runtime.audit_output")
    enrollment_store = _resolve(base, runtime_raw.get("enrollment_store"), "runtime.enrollment_store")
    if not all(is_within(path, data_dir) for path in (event_output, audit_output, enrollment_store)):
        raise ConfigError("event_output, audit_output, and enrollment_store must stay inside runtime.data_dir")
    host_values = _require_list(runtime_raw.get("allowed_local_hosts"), "runtime.allowed_local_hosts")
    allowed_hosts = frozenset(str(host).strip().lower() for host in host_values if str(host).strip())
    if not allowed_hosts:
        raise ConfigError("runtime.allowed_local_hosts must not be empty")
    runtime = RuntimeSettings(
        data_dir=data_dir,
        enrollment_roots=enrollment_roots,
        media_roots=media_roots,
        event_output=event_output,
        audit_output=audit_output,
        enrollment_store=enrollment_store,
        allowed_local_hosts=allowed_hosts,
        sample_interval_ms=_integer(
            runtime_raw.get("sample_interval_ms"),
            "runtime.sample_interval_ms",
            minimum=100,
            maximum=60_000,
        ),
        authority_recheck_seconds=_integer(
            runtime_raw.get("authority_recheck_seconds"),
            "runtime.authority_recheck_seconds",
            minimum=1,
            maximum=60,
        ),
        review_only=_require_bool(runtime_raw.get("review_only"), "runtime.review_only"),
    )
    if not runtime.review_only:
        raise ConfigError("runtime.review_only must remain true; this worker only emits proposals")

    models_raw = _require_mapping(root.get("models"), "models")

    def model(name: str) -> ModelSpec:
        model_raw = _require_mapping(models_raw.get(name), f"models.{name}")
        sha = model_raw.get("sha256")
        if not isinstance(sha, str) or not sha.strip():
            raise ConfigError(f"models.{name}.sha256 must be supplied")
        return ModelSpec(
            path=_resolve(base, model_raw.get("path"), f"models.{name}.path"),
            sha256=sha.strip().lower(),
        )

    matching_raw = _require_mapping(root.get("matching"), "matching")
    matching = MatchingSettings(
        minimum_similarity=_number(
            matching_raw.get("minimum_similarity"),
            "matching.minimum_similarity",
            minimum=-1.0,
            maximum=1.0,
        ),
        minimum_top_two_margin=_number(
            matching_raw.get("minimum_top_two_margin"),
            "matching.minimum_top_two_margin",
            minimum=0.0,
            maximum=2.0,
        ),
        consensus_window=_integer(
            matching_raw.get("consensus_window"),
            "matching.consensus_window",
            minimum=1,
            maximum=100,
        ),
        consensus_hits=_integer(
            matching_raw.get("consensus_hits"),
            "matching.consensus_hits",
            minimum=1,
            maximum=100,
        ),
        maximum_consensus_gap_ms=_integer(
            matching_raw.get("maximum_consensus_gap_ms"),
            "matching.maximum_consensus_gap_ms",
            minimum=1,
            maximum=60_000,
        ),
    )
    if matching.consensus_hits > matching.consensus_window:
        raise ConfigError("matching.consensus_hits cannot exceed consensus_window")

    quality_raw = _require_mapping(root.get("quality"), "quality")
    quality = QualitySettings(
        detector_score_threshold=_number(
            quality_raw.get("detector_score_threshold"),
            "quality.detector_score_threshold",
            minimum=0.0,
            maximum=1.0,
        ),
        minimum_face_pixels=_integer(
            quality_raw.get("minimum_face_pixels"),
            "quality.minimum_face_pixels",
            minimum=24,
            maximum=4096,
        ),
        minimum_sharpness=_number(
            quality_raw.get("minimum_sharpness"),
            "quality.minimum_sharpness",
            minimum=0.0,
            maximum=100_000.0,
        ),
        minimum_mean_luminance=_number(
            quality_raw.get("minimum_mean_luminance"),
            "quality.minimum_mean_luminance",
            minimum=0.0,
            maximum=255.0,
        ),
        maximum_mean_luminance=_number(
            quality_raw.get("maximum_mean_luminance"),
            "quality.maximum_mean_luminance",
            minimum=0.0,
            maximum=255.0,
        ),
    )
    if quality.minimum_mean_luminance >= quality.maximum_mean_luminance:
        raise ConfigError("quality luminance minimum must be below maximum")

    identities: dict[str, Identity] = {}
    canonical_identities: set[tuple[str, str]] = set()
    for index, item in enumerate(_require_list(root.get("identities"), "identities")):
        field = f"identities[{index}]"
        value = _require_mapping(item, field)
        identity_id = _require_id(value.get("id"), f"{field}.id")
        if identity_id in identities:
            raise ConfigError(f"duplicate identity id: {identity_id}")
        display_name = value.get("display_name")
        canonical_kind = value.get("canonical_kind")
        canonical_slug = value.get("canonical_slug")
        if not isinstance(display_name, str) or not display_name.strip():
            raise ConfigError(f"{field}.display_name must not be empty")
        if canonical_kind not in {"member", "crew"}:
            raise ConfigError(f"{field}.canonical_kind must be member or crew")
        if not isinstance(canonical_slug, str) or not _CANONICAL_SLUG_RE.fullmatch(canonical_slug):
            raise ConfigError(f"{field}.canonical_slug must be a lowercase canonical profile slug")
        canonical_key = (canonical_kind, canonical_slug)
        if canonical_key in canonical_identities:
            raise ConfigError(f"duplicate canonical identity: {canonical_kind}/{canonical_slug}")
        canonical_identities.add(canonical_key)
        identities[identity_id] = Identity(
            id=identity_id,
            display_name=display_name.strip(),
            canonical_kind=canonical_kind,
            canonical_slug=canonical_slug,
            consent=_parse_consent(value.get("consent"), f"{field}.consent"),
        )

    sources: dict[str, Source] = {}
    for index, item in enumerate(_require_list(root.get("sources"), "sources")):
        field = f"sources[{index}]"
        value = _require_mapping(item, field)
        source_id = _require_id(value.get("id"), f"{field}.id")
        if source_id in sources:
            raise ConfigError(f"duplicate source id: {source_id}")
        content_id = value.get("content_id")
        if not isinstance(content_id, str) or not 1 <= len(content_id.strip()) <= 300:
            raise ConfigError(f"{field}.content_id must identify one canonical media item")
        kind = value.get("kind")
        if kind not in {"file", "hls", "obs"}:
            raise ConfigError(f"{field}.kind must be file, hls, or obs")
        uri = value.get("uri")
        if not isinstance(uri, str) or not uri.strip():
            raise ConfigError(f"{field}.uri must not be empty")
        allowlist = _parse_id_set(value.get("participant_allowlist"), f"{field}.participant_allowlist")
        missing = allowlist.difference(identities)
        if missing:
            raise ConfigError(f"{field} references unknown identities: {sorted(missing)}")
        sources[source_id] = Source(
            id=source_id,
            content_id=content_id.strip(),
            kind=kind,
            uri=uri.strip(),
            authorized=_require_bool(value.get("authorized"), f"{field}.authorized"),
            all_visible_participants_consented=_require_bool(
                value.get("all_visible_participants_consented"),
                f"{field}.all_visible_participants_consented",
            ),
            participant_allowlist=allowlist,
        )

    sessions: dict[str, Session] = {}
    for index, item in enumerate(_require_list(root.get("sessions"), "sessions")):
        field = f"sessions[{index}]"
        value = _require_mapping(item, field)
        session_id = _require_id(value.get("id"), f"{field}.id")
        if session_id in sessions:
            raise ConfigError(f"duplicate session id: {session_id}")
        source_id = _require_id(value.get("source_id"), f"{field}.source_id")
        if source_id not in sources:
            raise ConfigError(f"{field}.source_id does not exist")
        mode = value.get("mode")
        purpose = value.get("purpose")
        if mode not in {"biometric", "manual"}:
            raise ConfigError(f"{field}.mode must be biometric or manual")
        if purpose not in {"live", "archive"}:
            raise ConfigError(f"{field}.purpose must be live or archive")
        allowlist = _parse_id_set(value.get("identity_allowlist"), f"{field}.identity_allowlist")
        missing = allowlist.difference(identities)
        if missing:
            raise ConfigError(f"{field} references unknown identities: {sorted(missing)}")
        sessions[session_id] = Session(
            id=session_id,
            source_id=source_id,
            mode=mode,
            purpose=purpose,
            active=_require_bool(value.get("active"), f"{field}.active"),
            expires_at=parse_timestamp(value.get("expires_at"), f"{field}.expires_at"),
            identity_allowlist=allowlist,
        )

    return AnalyzerConfig(
        path=config_path,
        runtime=runtime,
        yunet=model("yunet"),
        sface=model("sface"),
        matching=matching,
        quality=quality,
        identities=identities,
        sources=sources,
        sessions=sessions,
    )
