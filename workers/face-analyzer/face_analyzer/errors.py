class FaceAnalyzerError(Exception):
    """Base error rendered as a concise CLI failure."""


class ConfigError(FaceAnalyzerError):
    """Configuration is invalid or internally inconsistent."""


class PolicyError(FaceAnalyzerError):
    """Consent, authorization, or input policy refused an operation."""


class ModelError(FaceAnalyzerError):
    """A required model is absent, unverified, or incompatible."""


class MediaError(FaceAnalyzerError):
    """Media could not be decoded with trustworthy timestamps."""


class DataError(FaceAnalyzerError):
    """Enrollment, annotations, or evaluation data is invalid."""


class ExpiredEnrollmentError(DataError):
    """Local templates expired and were securely removed from the store."""

    def __init__(self, identity_ids: list[str]) -> None:
        self.identity_ids = tuple(identity_ids)
        super().__init__(
            f"expired local templates were purged for: {', '.join(identity_ids)}; re-enrollment requires new consent"
        )
