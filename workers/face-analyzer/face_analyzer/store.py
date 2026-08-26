from __future__ import annotations

import json
import hashlib
import hmac
import os
import secrets
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Iterable, Mapping

from .errors import DataError, ExpiredEnrollmentError
from .locking import exclusive_local_lock, lock_path_for
from .matching import normalize


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str):
        raise DataError(f"{field} must be an ISO-8601 timestamp")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DataError(f"{field} must be an ISO-8601 timestamp") from exc
    if result.tzinfo is None:
        raise DataError(f"{field} must include a timezone")
    return result.astimezone(timezone.utc)


def _atomic_private_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_name = handle.name
            json.dump(payload, handle, separators=(",", ":"), sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.chmod(temporary_name, 0o600)
        except OSError:
            pass
        os.replace(temporary_name, path)
        temporary_name = None
    finally:
        if temporary_name:
            try:
                os.unlink(temporary_name)
            except FileNotFoundError:
                pass


def _verify_template_fingerprints(payload: Mapping[str, Any]) -> None:
    identities = payload.get("identities")
    if not isinstance(identities, dict):
        raise DataError("enrollment store identities must be an object")
    for identity_id, record in identities.items():
        if not isinstance(record, dict) or not isinstance(record.get("embeddings"), list):
            raise DataError(f"enrollment record for {identity_id} is invalid")
        fingerprint = record.get("template_fingerprint")
        key_hex = record.get("template_fingerprint_key")
        if (
            not isinstance(fingerprint, str)
            or len(fingerprint) != 64
            or not isinstance(key_hex, str)
            or len(key_hex) != 64
        ):
            raise DataError(f"enrollment record for {identity_id} lacks integrity metadata")
        try:
            key = bytes.fromhex(key_hex)
        except ValueError as exc:
            raise DataError(f"enrollment record for {identity_id} has invalid integrity metadata") from exc
        canonical_vectors = json.dumps(
            record["embeddings"], separators=(",", ":"), ensure_ascii=True
        ).encode("ascii")
        expected = hmac.new(key, canonical_vectors, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(fingerprint, expected):
            raise DataError(f"enrollment record for {identity_id} failed its local integrity check")


def _locked_store_method(function: Any) -> Any:
    @wraps(function)
    def wrapped(self: "EnrollmentStore", *args: Any, **kwargs: Any) -> Any:
        with exclusive_local_lock(
            lock_path_for(self.path),
            purpose="enrollment store",
        ):
            self._payload = self._load_unlocked()
            return function(self, *args, **kwargs)

    return wrapped


class EnrollmentStore:
    """Local biometric template store; it never stores source images or crops."""

    def __init__(self, path: Path, model_fingerprint: Mapping[str, str]) -> None:
        self.path = path
        self.model_fingerprint = dict(model_fingerprint)
        self._payload = self._load()

    def _empty(self) -> dict[str, Any]:
        return {
            "version": 1,
            "model_fingerprint": self.model_fingerprint,
            "identities": {},
        }

    def _load(self) -> dict[str, Any]:
        with exclusive_local_lock(
            lock_path_for(self.path),
            purpose="enrollment store",
        ):
            return self._load_unlocked()

    def _load_unlocked(self) -> dict[str, Any]:
        if not self.path.exists():
            return self._empty()
        payload = self._load_unbound_unlocked(self.path)
        if payload.get("model_fingerprint") != self.model_fingerprint:
            raise DataError("enrollment store model fingerprint differs from the verified configured models")
        return payload

    @staticmethod
    def _load_unbound(path: Path) -> dict[str, Any]:
        with exclusive_local_lock(
            lock_path_for(path),
            purpose="enrollment store",
        ):
            return EnrollmentStore._load_unbound_unlocked(path)

    @staticmethod
    def _load_unbound_unlocked(path: Path) -> dict[str, Any]:
        if not path.exists():
            return {"version": 1, "model_fingerprint": {}, "identities": {}}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise DataError(f"enrollment store is invalid JSON: {exc}") from exc
        if not isinstance(payload, dict) or payload.get("version") != 1:
            raise DataError("enrollment store version must be 1")
        if not isinstance(payload.get("identities"), dict):
            raise DataError("enrollment store identities must be an object")
        _verify_template_fingerprints(payload)
        return payload

    @_locked_store_method
    def templates(
        self,
        allowed_identity_ids: Iterable[str],
        *,
        now: datetime | None = None,
    ) -> dict[str, list[tuple[float, ...]]]:
        allowed = set(allowed_identity_ids)
        current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        result: dict[str, list[tuple[float, ...]]] = {}
        expired: list[str] = []
        for identity_id, record in self._payload["identities"].items():
            if not isinstance(record, dict) or not isinstance(record.get("embeddings"), list):
                raise DataError(f"enrollment record for {identity_id} is invalid")
            expiry = _parse_timestamp(
                record.get("consent_expires_at"),
                f"enrollment record {identity_id}.consent_expires_at",
            )
            if expiry <= current:
                expired.append(identity_id)
                continue
            if identity_id not in allowed:
                continue
            result[identity_id] = [normalize(vector) for vector in record["embeddings"]]
        if expired:
            for identity_id in expired:
                self._payload["identities"].pop(identity_id, None)
            _atomic_private_json(self.path, self._payload)
            raise ExpiredEnrollmentError(sorted(expired))
        return result

    @_locked_store_method
    def contains(self, identity_id: str) -> bool:
        return identity_id in self._payload["identities"]

    @_locked_store_method
    def put(
        self,
        identity_id: str,
        embeddings: Iterable[Iterable[float]],
        *,
        image_sha256: Iterable[str],
        consent_granted_at: str,
        consent_expires_at: str,
        replace: bool,
    ) -> dict[str, Any]:
        if self.contains(identity_id) and not replace:
            raise DataError("identity is already enrolled; pass --replace to replace its templates")
        vectors = [list(normalize(vector)) for vector in embeddings]
        if not vectors:
            raise DataError("at least one enrollment embedding is required")
        if not 3 <= len(vectors) <= 20:
            raise DataError("enrollment requires 3 to 20 approved reference images")
        if len({len(vector) for vector in vectors}) != 1:
            raise DataError("enrollment embeddings have inconsistent dimensions")
        digests = list(image_sha256)
        if len(digests) != len(vectors):
            raise DataError("image digest count must match embedding count")
        # This correlator lets the DB verify that it is authorizing the exact
        # local template set without receiving a vector or a reusable vector
        # digest.  The random HMAC key remains only in this private store.
        fingerprint_key = secrets.token_bytes(32)
        canonical_vectors = json.dumps(
            vectors,
            separators=(",", ":"),
            ensure_ascii=True,
        ).encode("ascii")
        template_fingerprint = hmac.new(
            fingerprint_key,
            canonical_vectors,
            hashlib.sha256,
        ).hexdigest()
        self._payload["identities"][identity_id] = {
            "enrolled_at": _iso_now(),
            "consent_granted_at": consent_granted_at,
            "consent_expires_at": consent_expires_at,
            "reference_image_sha256": digests,
            "template_fingerprint": template_fingerprint,
            "template_fingerprint_key": fingerprint_key.hex(),
            "embeddings": vectors,
        }
        _atomic_private_json(self.path, self._payload)
        return {
            "template_fingerprint": template_fingerprint,
            "template_count": len(vectors),
            "reference_image_sha256": list(digests),
            "consent_expires_at": consent_expires_at,
        }

    @_locked_store_method
    def bind_template_set(self, identity_id: str, template_set_id: str) -> None:
        record = self._payload["identities"].get(identity_id)
        if not isinstance(record, dict):
            raise DataError("cannot bind DB metadata for an absent local enrollment")
        try:
            import uuid

            normalized = str(uuid.UUID(template_set_id))
        except (ValueError, AttributeError) as exc:
            raise DataError("DB template set id is invalid") from exc
        record["template_set_id"] = normalized
        _atomic_private_json(self.path, self._payload)

    @staticmethod
    def purge_identity(path: Path, identity_id: str) -> dict[str, Any]:
        with exclusive_local_lock(lock_path_for(path), purpose="enrollment store"):
            payload = EnrollmentStore._load_unbound_unlocked(path)
            record = payload["identities"].pop(identity_id, None)
            if record is None:
                return {"deleted": False, "identity_id": identity_id, "reference_count": 0}
            if not isinstance(record, dict):
                raise DataError(f"enrollment record for {identity_id} is invalid")
            embeddings = record.get("embeddings")
            reference_count = len(embeddings) if isinstance(embeddings, list) else 0
            _atomic_private_json(path, payload)
            return {
                "deleted": True,
                "identity_id": identity_id,
                "reference_count": reference_count,
                "template_fingerprint": record.get("template_fingerprint"),
                "template_set_id": record.get("template_set_id"),
                "consent_expires_at": record.get("consent_expires_at"),
            }

    @staticmethod
    def metadata(path: Path, *, now: datetime | None = None) -> dict[str, Any]:
        with exclusive_local_lock(lock_path_for(path), purpose="enrollment store"):
            payload = EnrollmentStore._load_unbound_unlocked(path)
            current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
            identities: dict[str, Any] = {}
            for identity_id, record in payload["identities"].items():
                if not isinstance(record, dict):
                    raise DataError(f"enrollment record for {identity_id} is invalid")
                embeddings = record.get("embeddings")
                digests = record.get("reference_image_sha256")
                if not isinstance(embeddings, list) or not isinstance(digests, list):
                    raise DataError(f"enrollment record for {identity_id} is invalid")
                expiry = _parse_timestamp(
                    record.get("consent_expires_at"),
                    f"enrollment record {identity_id}.consent_expires_at",
                )
                identities[identity_id] = {
                    "template_count": len(embeddings),
                    "reference_image_sha256": list(digests),
                    "template_fingerprint": record.get("template_fingerprint"),
                    "template_set_id": record.get("template_set_id"),
                    "consent_expires_at": expiry.isoformat().replace("+00:00", "Z"),
                    "expired": expiry <= current,
                }
            return {
                "version": payload.get("version"),
                "model_fingerprint": payload.get("model_fingerprint", {}),
                "identities": identities,
            }

    @staticmethod
    def reset_model_if_empty(path: Path, model_fingerprint: Mapping[str, str]) -> None:
        with exclusive_local_lock(lock_path_for(path), purpose="enrollment store"):
            payload = EnrollmentStore._load_unbound_unlocked(path)
            if payload["identities"]:
                raise DataError("enrollment store cannot change models until every local template is purged")
            _atomic_private_json(
                path,
                {"version": 1, "model_fingerprint": dict(model_fingerprint), "identities": {}},
            )


def _locked_tombstone_method(function: Any) -> Any:
    @wraps(function)
    def wrapped(self: "PurgeTombstoneStore", *args: Any, **kwargs: Any) -> Any:
        with exclusive_local_lock(
            lock_path_for(self.path),
            purpose="purge tombstone journal",
        ):
            self._reload_unlocked()
            return function(self, *args, **kwargs)

    return wrapped


class PurgeTombstoneStore:
    """Non-biometric retry journal for exact DB deletion attestations."""

    def __init__(self, path: Path) -> None:
        self.path = path
        with exclusive_local_lock(
            lock_path_for(self.path),
            purpose="purge tombstone journal",
        ):
            self._reload_unlocked()

    def _reload_unlocked(self) -> None:
        path = self.path
        if path.exists():
            try:
                self.payload = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise DataError("purge tombstone journal is invalid JSON") from exc
            if not isinstance(self.payload, dict) or self.payload.get("version") != 1:
                raise DataError("purge tombstone journal version must be 1")
            if not isinstance(self.payload.get("records"), dict):
                raise DataError("purge tombstone records must be an object")
        else:
            self.payload = {"version": 1, "records": {}}

    @_locked_tombstone_method
    def begin(
        self,
        *,
        identity_id: str,
        worker_id: str,
        fingerprint: str,
        template_set_id: str | None,
        reason: str,
    ) -> None:
        self.payload["records"][fingerprint] = {
            "identity_id": identity_id,
            "worker_id": worker_id,
            "template_fingerprint": fingerprint,
            "template_set_id": template_set_id,
            "state": "delete_started",
            "delete_started_at": _iso_now(),
            "deleted_at": None,
            "reason": reason,
        }
        _atomic_private_json(self.path, self.payload)

    @_locked_tombstone_method
    def deleted(self, fingerprint: str) -> None:
        record = self.payload["records"].get(fingerprint)
        if not isinstance(record, dict):
            raise DataError("purge tombstone disappeared before deletion completed")
        record["state"] = "deleted_unacknowledged"
        record["deleted_at"] = _iso_now()
        _atomic_private_json(self.path, self.payload)

    @_locked_tombstone_method
    def acknowledge(self, fingerprint: str) -> None:
        self.payload["records"].pop(fingerprint, None)
        _atomic_private_json(self.path, self.payload)

    @_locked_tombstone_method
    def find(self, *, identity_id: str, worker_id: str, fingerprint: str) -> dict[str, Any] | None:
        record = self.payload["records"].get(fingerprint)
        if not isinstance(record, dict):
            return None
        if record.get("identity_id") != identity_id or record.get("worker_id") != worker_id:
            return None
        return dict(record)

    @_locked_tombstone_method
    def pending(self, *, worker_id: str) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for record in self.payload["records"].values():
            if (
                isinstance(record, dict)
                and record.get("worker_id") == worker_id
                and record.get("state") in {"delete_started", "deleted_unacknowledged"}
                and isinstance(record.get("identity_id"), str)
                and isinstance(record.get("template_fingerprint"), str)
            ):
                records.append(dict(record))
        return sorted(
            records,
            key=lambda record: (str(record.get("delete_started_at", "")), record["template_fingerprint"]),
        )


_FORBIDDEN_EVENT_KEYS = frozenset(
    {
        "embedding",
        "embeddings",
        "feature",
        "features",
        "crop",
        "face_crop",
        "image",
        "frame",
        "pixels",
    }
)


def assert_event_safe(value: Any, path: str = "event") -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            if str(key).lower() in _FORBIDDEN_EVENT_KEYS:
                raise DataError(f"{path} contains forbidden biometric/image field: {key}")
            assert_event_safe(nested, f"{path}.{key}")
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            assert_event_safe(nested, f"{path}[{index}]")


@dataclass(frozen=True)
class PresenceEvent:
    schema_version: int
    session_id: str
    source_id: str
    media_pts_ms: int
    track_id: str
    state: str
    identity_id: str | None
    bbox_normalized: tuple[float, float, float, float]
    match_reason: str
    top_score: float | None
    runner_up_score: float | None
    review_status: str = "proposed"

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        assert_event_safe(value)
        return value


class EventWriter:
    def __init__(self, path: Path) -> None:
        self.path = path

    def append(self, event: PresenceEvent) -> None:
        payload = event.to_dict()
        if payload["review_status"] != "proposed":
            raise DataError("worker output must remain review-only")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, separators=(",", ":"), sort_keys=True))
            handle.write("\n")
