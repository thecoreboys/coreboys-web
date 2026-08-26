from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator

from .errors import MediaError


@dataclass(frozen=True)
class DecodedFrame:
    pts_ms: int
    image: Any
    width: int
    height: int


def iter_sampled_frames(
    input_uri: str,
    *,
    sample_interval_ms: int,
    maximum_frames: int | None = None,
) -> Iterator[DecodedFrame]:
    """Decode frames using container PTS; never invent wall-clock timestamps."""
    try:
        import av
    except ImportError as exc:  # pragma: no cover - exercised only without runtime deps
        raise MediaError("PyAV is required for media decoding; install requirements.txt") from exc

    if maximum_frames is not None and maximum_frames <= 0:
        raise MediaError("maximum_frames must be positive")
    try:
        container = av.open(input_uri)
    except Exception as exc:
        raise MediaError(f"could not open authorized input: {exc}") from exc

    emitted = 0
    last_emitted_pts: int | None = None
    previous_pts: int | None = None
    try:
        streams = [stream for stream in container.streams if stream.type == "video"]
        if not streams:
            raise MediaError("input contains no video stream")
        stream = streams[0]
        for frame in container.decode(stream):
            if frame.pts is None or frame.time_base is None:
                raise MediaError("decoded frame has no media PTS/time_base; refusing clock fallback")
            pts_ms = int(round(float(frame.pts * frame.time_base) * 1000.0))
            if pts_ms < 0:
                # Negative preroll timestamps are not suitable for public event offsets.
                continue
            if previous_pts is not None and pts_ms < previous_pts:
                raise MediaError("video PTS moved backwards; refusing ambiguous event timing")
            previous_pts = pts_ms
            if last_emitted_pts is not None and pts_ms - last_emitted_pts < sample_interval_ms:
                continue
            try:
                image = frame.to_ndarray(format="bgr24")
            except Exception as exc:
                raise MediaError(f"could not convert decoded frame: {exc}") from exc
            last_emitted_pts = pts_ms
            emitted += 1
            yield DecodedFrame(pts_ms, image, int(frame.width), int(frame.height))
            if maximum_frames is not None and emitted >= maximum_frames:
                break
    except MediaError:
        raise
    except Exception as exc:
        raise MediaError(f"media decoding failed: {exc}") from exc
    finally:
        container.close()
