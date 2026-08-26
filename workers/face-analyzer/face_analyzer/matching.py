from __future__ import annotations

import math
from collections import Counter, deque
from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence

from .errors import DataError


Vector = Sequence[float]


def normalize(vector: Vector) -> tuple[float, ...]:
    if not vector:
        raise DataError("embedding must not be empty")
    values = tuple(float(value) for value in vector)
    if not all(math.isfinite(value) for value in values):
        raise DataError("embedding contains a non-finite value")
    norm = math.sqrt(sum(value * value for value in values))
    if norm <= 1e-12:
        raise DataError("embedding norm is zero")
    return tuple(value / norm for value in values)


def cosine_similarity(left: Vector, right: Vector) -> float:
    left_norm = normalize(left)
    right_norm = normalize(right)
    if len(left_norm) != len(right_norm):
        raise DataError("embedding dimensions do not match")
    return sum(a * b for a, b in zip(left_norm, right_norm))


def centroid(vectors: Iterable[Vector]) -> tuple[float, ...]:
    normalized = [normalize(vector) for vector in vectors]
    if not normalized:
        raise DataError("at least one enrollment embedding is required")
    dimension = len(normalized[0])
    if any(len(vector) != dimension for vector in normalized):
        raise DataError("enrollment embeddings have inconsistent dimensions")
    average = tuple(sum(vector[index] for vector in normalized) / len(normalized) for index in range(dimension))
    return normalize(average)


@dataclass(frozen=True)
class MatchDecision:
    identity_id: str | None
    label: str
    reason: str
    top_score: float | None = None
    runner_up_score: float | None = None

    @property
    def recognized(self) -> bool:
        return self.identity_id is not None

    @classmethod
    def unknown(
        cls,
        reason: str,
        *,
        top_score: float | None = None,
        runner_up_score: float | None = None,
    ) -> "MatchDecision":
        return cls(None, "Unknown", reason, top_score, runner_up_score)


class ClosedSetMatcher:
    def __init__(
        self,
        templates: Mapping[str, Iterable[Vector]],
        *,
        minimum_similarity: float,
        minimum_top_two_margin: float,
    ) -> None:
        self._templates = {identity_id: centroid(vectors) for identity_id, vectors in templates.items()}
        self.minimum_similarity = float(minimum_similarity)
        self.minimum_top_two_margin = float(minimum_top_two_margin)

    def match(self, embedding: Vector, allowed_identity_ids: Iterable[str]) -> MatchDecision:
        allowed = set(allowed_identity_ids)
        candidates = [
            (identity_id, cosine_similarity(embedding, template))
            for identity_id, template in self._templates.items()
            if identity_id in allowed
        ]
        if not candidates:
            return MatchDecision.unknown("no_enrolled_allowlisted_candidate")
        candidates.sort(key=lambda item: (-item[1], item[0]))
        best_id, best_score = candidates[0]
        runner_score = candidates[1][1] if len(candidates) > 1 else None
        if best_score < self.minimum_similarity:
            return MatchDecision.unknown(
                "below_similarity_threshold",
                top_score=best_score,
                runner_up_score=runner_score,
            )
        if runner_score is not None and best_score - runner_score < self.minimum_top_two_margin:
            return MatchDecision.unknown(
                "ambiguous_top_two_margin",
                top_score=best_score,
                runner_up_score=runner_score,
            )
        return MatchDecision(best_id, best_id, "candidate", best_score, runner_score)


class TemporalConsensus:
    """Requires repeated candidate matches on one visual track before naming it."""

    def __init__(self, *, window: int, required_hits: int, maximum_gap_ms: int) -> None:
        if required_hits > window:
            raise ValueError("required_hits cannot exceed window")
        self.window = window
        self.required_hits = required_hits
        self.maximum_gap_ms = maximum_gap_ms
        self._history: dict[str, deque[tuple[int, str | None]]] = {}
        self._last_pts: dict[str, int] = {}

    def observe(self, track_id: str, pts_ms: int, decision: MatchDecision) -> MatchDecision:
        if pts_ms < 0:
            raise DataError("media PTS must not be negative")
        last_pts = self._last_pts.get(track_id)
        if last_pts is not None and pts_ms < last_pts:
            raise DataError("media PTS must be monotonic per track")
        if last_pts is not None and pts_ms - last_pts > self.maximum_gap_ms:
            self._history.pop(track_id, None)
        history = self._history.setdefault(track_id, deque(maxlen=self.window))
        history.append((pts_ms, decision.identity_id))
        self._last_pts[track_id] = pts_ms
        if decision.identity_id is None:
            return decision
        counts = Counter(identity_id for _, identity_id in history if identity_id is not None)
        if counts[decision.identity_id] < self.required_hits:
            return MatchDecision.unknown(
                "temporal_consensus_pending",
                top_score=decision.top_score,
                runner_up_score=decision.runner_up_score,
            )
        return MatchDecision(
            decision.identity_id,
            decision.identity_id,
            "temporal_consensus_passed",
            decision.top_score,
            decision.runner_up_score,
        )

    def forget(self, active_track_ids: Iterable[str]) -> None:
        active = set(active_track_ids)
        for track_id in list(self._history):
            if track_id not in active:
                self._history.pop(track_id, None)
                self._last_pts.pop(track_id, None)
