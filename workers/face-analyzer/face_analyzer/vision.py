from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import AnalyzerConfig, ModelSpec
from .errors import MediaError, ModelError
from .matching import normalize
from .tracking import BBox


_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model(spec: ModelSpec, name: str) -> str:
    if not _SHA256_RE.fullmatch(spec.sha256):
        raise ModelError(
            f"{name} SHA-256 is not configured; copy config.example.json and add a verified 64-character digest"
        )
    if not spec.path.is_file():
        raise ModelError(f"{name} model does not exist: {spec.path}")
    actual = file_sha256(spec.path)
    if actual != spec.sha256:
        raise ModelError(f"{name} model SHA-256 mismatch; refusing unverified weights")
    return actual


def verified_model_fingerprint(config: AnalyzerConfig) -> dict[str, str]:
    return {
        "yunet_sha256": verify_model(config.yunet, "YuNet"),
        "sface_sha256": verify_model(config.sface, "SFace"),
    }


@dataclass(frozen=True)
class FaceObservation:
    bbox: BBox
    detector_score: float
    embedding: tuple[float, ...] | None
    quality_reason: str


class OpenCVFaceEngine:
    """Fixed YuNet detector + fixed SFace embedder. There is no fine-tuning path."""

    def __init__(self, config: AnalyzerConfig) -> None:
        self.config = config
        self.model_fingerprint = verified_model_fingerprint(config)
        try:
            import cv2
        except ImportError as exc:  # pragma: no cover - runtime dependency path
            raise ModelError("OpenCV and NumPy are required; install requirements.txt") from exc
        self.cv2 = cv2
        quality = config.quality
        try:
            if hasattr(cv2, "FaceDetectorYN"):
                self.detector = cv2.FaceDetectorYN.create(
                    str(config.yunet.path),
                    "",
                    (320, 320),
                    quality.detector_score_threshold,
                    0.3,
                    5000,
                )
            else:  # Older but still supported OpenCV Python spelling.
                self.detector = cv2.FaceDetectorYN_create(
                    str(config.yunet.path),
                    "",
                    (320, 320),
                    quality.detector_score_threshold,
                    0.3,
                    5000,
                )
            if hasattr(cv2, "FaceRecognizerSF"):
                self.recognizer = cv2.FaceRecognizerSF.create(str(config.sface.path), "")
            else:
                self.recognizer = cv2.FaceRecognizerSF_create(str(config.sface.path), "")
        except Exception as exc:
            raise ModelError(f"OpenCV could not load the verified YuNet/SFace models: {exc}") from exc

    def _quality_reason(self, frame: Any, row: Any) -> str:
        quality = self.config.quality
        height, width = frame.shape[:2]
        x, y, box_width, box_height = (float(row[index]) for index in range(4))
        score = float(row[14])
        if score < quality.detector_score_threshold:
            return "detector_score_too_low"
        if box_width < quality.minimum_face_pixels or box_height < quality.minimum_face_pixels:
            return "face_too_small"
        aspect_ratio = box_width / box_height
        if not 0.55 <= aspect_ratio <= 1.8:
            return "face_aspect_ratio_out_of_range"
        left = max(0, int(x))
        top = max(0, int(y))
        right = min(width, int(x + box_width))
        bottom = min(height, int(y + box_height))
        if right <= left or bottom <= top:
            return "face_box_outside_frame"
        crop = frame[top:bottom, left:right]
        gray = self.cv2.cvtColor(crop, self.cv2.COLOR_BGR2GRAY)
        mean_luminance = float(gray.mean())
        if mean_luminance < quality.minimum_mean_luminance:
            return "face_too_dark"
        if mean_luminance > quality.maximum_mean_luminance:
            return "face_too_bright"
        sharpness = float(self.cv2.Laplacian(gray, self.cv2.CV_64F).var())
        if sharpness < quality.minimum_sharpness:
            return "face_too_blurry"
        return "quality_passed"

    def detect(self, frame: Any) -> list[FaceObservation]:
        if frame is None or not hasattr(frame, "shape") or len(frame.shape) < 2:
            raise MediaError("vision engine received an invalid frame")
        height, width = frame.shape[:2]
        if width <= 0 or height <= 0:
            raise MediaError("vision engine received an empty frame")
        self.detector.setInputSize((int(width), int(height)))
        try:
            _, faces = self.detector.detect(frame)
        except Exception as exc:
            raise MediaError(f"YuNet detection failed: {exc}") from exc
        if faces is None:
            return []
        observations: list[FaceObservation] = []
        for row in faces:
            bbox: BBox = tuple(max(0.0, float(row[index])) for index in range(4))  # type: ignore[assignment]
            reason = self._quality_reason(frame, row)
            embedding: tuple[float, ...] | None = None
            if reason == "quality_passed":
                try:
                    aligned = self.recognizer.alignCrop(frame, row)
                    raw_feature = self.recognizer.feature(aligned)
                    embedding = normalize(raw_feature.reshape(-1).tolist())
                    # Aligned pixels and raw features are intentionally not retained.
                    del aligned
                    del raw_feature
                except Exception as exc:
                    raise MediaError(f"SFace feature extraction failed: {exc}") from exc
            observations.append(
                FaceObservation(
                    bbox=bbox,
                    detector_score=float(row[14]),
                    embedding=embedding,
                    quality_reason=reason,
                )
            )
        return observations

    def extract_single_enrollment(self, image_path: Path) -> tuple[float, ...]:
        image = self.cv2.imread(str(image_path), self.cv2.IMREAD_COLOR)
        if image is None:
            raise MediaError(f"OpenCV could not read enrollment image: {image_path}")
        observations = self.detect(image)
        passing = [observation for observation in observations if observation.embedding is not None]
        if len(observations) != 1 or len(passing) != 1:
            raise MediaError(
                "each enrollment image must contain exactly one detected face that passes every quality gate"
            )
        return passing[0].embedding  # type: ignore[return-value]
