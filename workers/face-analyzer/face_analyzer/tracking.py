from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

from .errors import DataError


BBox = tuple[float, float, float, float]


def validate_bbox(value: Sequence[float], *, normalized: bool = False) -> BBox:
    if len(value) != 4:
        raise DataError("bbox must contain x, y, width, height")
    try:
        x, y, width, height = (float(item) for item in value)
    except (TypeError, ValueError) as exc:
        raise DataError("bbox values must be numbers") from exc
    if width <= 0 or height <= 0 or x < 0 or y < 0:
        raise DataError("bbox origin must be non-negative and dimensions must be positive")
    if normalized and (x > 1 or y > 1 or width > 1 or height > 1 or x + width > 1 or y + height > 1):
        raise DataError("normalized bbox must stay inside 0..1")
    return x, y, width, height


def iou(left: BBox, right: BBox) -> float:
    lx, ly, lw, lh = left
    rx, ry, rw, rh = right
    intersection_left = max(lx, rx)
    intersection_top = max(ly, ry)
    intersection_right = min(lx + lw, rx + rw)
    intersection_bottom = min(ly + lh, ry + rh)
    intersection_width = max(0.0, intersection_right - intersection_left)
    intersection_height = max(0.0, intersection_bottom - intersection_top)
    intersection = intersection_width * intersection_height
    union = lw * lh + rw * rh - intersection
    return intersection / union if union > 0 else 0.0


@dataclass(frozen=True)
class TrackAssignment:
    detection_index: int
    track_id: str
    bbox: BBox


@dataclass
class _TrackState:
    bbox: BBox
    last_pts_ms: int


class IoUTracker:
    """Small deterministic tracker; it stores geometry only, never face features."""

    def __init__(self, *, minimum_iou: float = 0.25, maximum_age_ms: int = 2_000) -> None:
        self.minimum_iou = minimum_iou
        self.maximum_age_ms = maximum_age_ms
        self._tracks: dict[str, _TrackState] = {}
        self._next_track = 1

    def update(self, pts_ms: int, detections: Iterable[BBox]) -> list[TrackAssignment]:
        boxes = [validate_bbox(box) for box in detections]
        self._tracks = {
            track_id: state
            for track_id, state in self._tracks.items()
            if pts_ms - state.last_pts_ms <= self.maximum_age_ms
        }
        choices = sorted(
            (
                (-iou(state.bbox, box), track_id, detection_index)
                for track_id, state in self._tracks.items()
                for detection_index, box in enumerate(boxes)
                if iou(state.bbox, box) >= self.minimum_iou
            ),
            key=lambda item: (item[0], item[1], item[2]),
        )
        assigned_tracks: set[str] = set()
        assigned_detections: set[int] = set()
        result: list[TrackAssignment] = []
        for _, track_id, detection_index in choices:
            if track_id in assigned_tracks or detection_index in assigned_detections:
                continue
            box = boxes[detection_index]
            self._tracks[track_id] = _TrackState(box, pts_ms)
            assigned_tracks.add(track_id)
            assigned_detections.add(detection_index)
            result.append(TrackAssignment(detection_index, track_id, box))
        for detection_index, box in enumerate(boxes):
            if detection_index in assigned_detections:
                continue
            track_id = f"face-{self._next_track}"
            self._next_track += 1
            self._tracks[track_id] = _TrackState(box, pts_ms)
            result.append(TrackAssignment(detection_index, track_id, box))
        return sorted(result, key=lambda assignment: assignment.detection_index)

    @property
    def active_track_ids(self) -> frozenset[str]:
        return frozenset(self._tracks)


@dataclass(frozen=True)
class ManualKeyframe:
    pts_ms: int
    bbox: BBox


@dataclass(frozen=True)
class ManualTrack:
    track_id: str
    identity_id: str | None
    keyframes: tuple[ManualKeyframe, ...]

    def bbox_at(self, pts_ms: int) -> BBox | None:
        if pts_ms < self.keyframes[0].pts_ms or pts_ms > self.keyframes[-1].pts_ms:
            return None
        for index, current in enumerate(self.keyframes):
            if pts_ms == current.pts_ms or index == len(self.keyframes) - 1:
                return current.bbox
            following = self.keyframes[index + 1]
            if current.pts_ms <= pts_ms <= following.pts_ms:
                duration = following.pts_ms - current.pts_ms
                ratio = 0.0 if duration == 0 else (pts_ms - current.pts_ms) / duration
                return tuple(
                    current.bbox[position]
                    + (following.bbox[position] - current.bbox[position]) * ratio
                    for position in range(4)
                )  # type: ignore[return-value]
        return None


class ManualTimeline:
    """Admin-authored, non-biometric box tracks interpolated at actual media PTS."""

    def __init__(self, tracks: Iterable[ManualTrack]) -> None:
        self.tracks = tuple(tracks)

    @classmethod
    def load(cls, path: str | Path, allowed_identity_ids: Iterable[str]) -> "ManualTimeline":
        annotation_path = Path(path).resolve()
        try:
            raw = json.loads(annotation_path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise DataError(f"manual track file does not exist: {annotation_path}") from exc
        except json.JSONDecodeError as exc:
            raise DataError(f"manual track file is invalid JSON: {exc}") from exc
        if not isinstance(raw, dict) or raw.get("version") != 1:
            raise DataError("manual track file version must be 1")
        if raw.get("coordinate_space") != "normalized":
            raise DataError("manual tracks must use normalized coordinates")
        values = raw.get("tracks")
        if not isinstance(values, list):
            raise DataError("manual tracks must be an array")
        allowed = set(allowed_identity_ids)
        seen_ids: set[str] = set()
        tracks: list[ManualTrack] = []
        for track_index, value in enumerate(values):
            if not isinstance(value, dict):
                raise DataError(f"tracks[{track_index}] must be an object")
            track_id = value.get("track_id")
            identity_id = value.get("identity_id")
            if not isinstance(track_id, str) or not track_id or track_id in seen_ids:
                raise DataError(f"tracks[{track_index}].track_id must be unique and non-empty")
            if identity_id is not None and identity_id not in allowed:
                raise DataError(f"manual identity {identity_id!r} is outside the session allowlist")
            keyframe_values = value.get("keyframes")
            if not isinstance(keyframe_values, list) or len(keyframe_values) < 2:
                raise DataError(f"tracks[{track_index}].keyframes must contain at least start and end")
            keyframes: list[ManualKeyframe] = []
            previous_pts = -1
            for keyframe_index, keyframe_value in enumerate(keyframe_values):
                if not isinstance(keyframe_value, dict):
                    raise DataError(f"tracks[{track_index}].keyframes[{keyframe_index}] must be an object")
                pts_ms = keyframe_value.get("pts_ms")
                if isinstance(pts_ms, bool) or not isinstance(pts_ms, int) or pts_ms < 0:
                    raise DataError("manual keyframe pts_ms must be a non-negative integer")
                if pts_ms <= previous_pts:
                    raise DataError("manual keyframe PTS values must be strictly increasing")
                bbox_value: Any = keyframe_value.get("bbox")
                if not isinstance(bbox_value, (list, tuple)):
                    raise DataError("manual keyframe bbox must be an array")
                keyframes.append(ManualKeyframe(pts_ms, validate_bbox(bbox_value, normalized=True)))
                previous_pts = pts_ms
            seen_ids.add(track_id)
            tracks.append(ManualTrack(track_id, identity_id, tuple(keyframes)))
        return cls(tracks)

    def positions_at(self, pts_ms: int) -> list[tuple[ManualTrack, BBox]]:
        result: list[tuple[ManualTrack, BBox]] = []
        for track in self.tracks:
            bbox = track.bbox_at(pts_ms)
            if bbox is not None:
                result.append((track, bbox))
        return result
