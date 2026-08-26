from __future__ import annotations

import json
import os
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .errors import DataError


_LOCKS_GUARD = threading.Lock()
_THREAD_LOCKS: dict[str, threading.RLock] = {}
_THREAD_STATE = threading.local()


def lock_path_for(data_path: Path) -> Path:
    return data_path.with_name(f".{data_path.name}.lock")


def _thread_lock(path: Path) -> threading.RLock:
    key = str(path.resolve())
    with _LOCKS_GUARD:
        return _THREAD_LOCKS.setdefault(key, threading.RLock())


def _state() -> dict[str, dict[str, Any]]:
    value = getattr(_THREAD_STATE, "locks", None)
    if value is None:
        value = {}
        _THREAD_STATE.locks = value
    return value


def _try_os_lock(handle: Any) -> bool:
    if os.name == "nt":
        import msvcrt

        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            return False
    import fcntl

    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except BlockingIOError:
        return False


def _unlock_os(handle: Any) -> None:
    if os.name == "nt":
        import msvcrt

        handle.seek(0)
        msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        return
    import fcntl

    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def exclusive_local_lock(
    path: Path,
    *,
    purpose: str,
    timeout_seconds: float = 5.0,
) -> Iterator[None]:
    """Cross-platform, process-safe, same-thread-reentrant local file lock."""
    if timeout_seconds < 0 or timeout_seconds > 30:
        raise DataError("local lock timeout must be between 0 and 30 seconds")
    resolved = path.resolve()
    resolved.parent.mkdir(parents=True, exist_ok=True)
    local_lock = _thread_lock(resolved)
    if not local_lock.acquire(timeout=timeout_seconds):
        raise DataError(f"timed out waiting for local {purpose} lock")
    key = str(resolved)
    state = _state()
    existing = state.get(key)
    if existing is not None:
        existing["depth"] += 1
        try:
            yield
        finally:
            existing["depth"] -= 1
            local_lock.release()
        return

    handle: Any | None = None
    acquired = False
    try:
        handle = resolved.open("a+b")
        try:
            os.chmod(resolved, 0o600)
        except OSError:
            pass
        deadline = time.monotonic() + timeout_seconds
        while True:
            if _try_os_lock(handle):
                acquired = True
                break
            if time.monotonic() >= deadline:
                raise DataError(
                    f"timed out waiting for local {purpose} lock; another worker/operator process is active"
                )
            time.sleep(0.05)
        state[key] = {"depth": 1, "handle": handle}
        owner = {
            "pid": os.getpid(),
            "purpose": purpose,
            "acquired_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        handle.seek(0)
        handle.truncate()
        handle.write(json.dumps(owner, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        handle.flush()
        os.fsync(handle.fileno())
        handle.seek(0)
        yield
    finally:
        current = state.get(key)
        if current is not None:
            current["depth"] -= 1
            if current["depth"] == 0:
                state.pop(key, None)
                if acquired and handle is not None:
                    try:
                        _unlock_os(handle)
                    except OSError:
                        pass
        if handle is not None:
            handle.close()
        local_lock.release()


def serialized_enrollment_operation(function: Any) -> Any:
    """Serialize a full local enrollment/purge lifecycle, including its DB sync."""
    from functools import wraps

    @wraps(function)
    def wrapped(config: Any, *args: Any, **kwargs: Any) -> Any:
        with exclusive_local_lock(
            lock_path_for(config.runtime.enrollment_store),
            purpose="enrollment lifecycle",
        ):
            return function(config, *args, **kwargs)

    return wrapped
