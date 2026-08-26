# Models, dependencies, and provenance

This repository does **not** ship or download face-model weights. The operator
must obtain each file from the official upstream, review its license, record its
SHA-256 digest in local configuration, and retain a provenance record with the
download URL/date/version. The worker verifies that digest before any biometric
operation.

## Approved model family for this scaffold

| Purpose | Upstream | Expected filename | Provenance/license review |
| --- | --- | --- | --- |
| Face detection | [OpenCV Zoo YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) | `face_detection_yunet_2023mar.onnx` | Review the model directory, model card, and [OpenCV Zoo license](https://github.com/opencv/opencv_zoo/blob/main/LICENSE) at download time. |
| Face embeddings | [OpenCV Zoo SFace](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface) | `face_recognition_sface_2021dec.onnx` | Review the model directory, model card, and [OpenCV Zoo license](https://github.com/opencv/opencv_zoo/blob/main/LICENSE) at download time. |

Use only these configured fixed models unless a fresh legal, accuracy, and bias
review explicitly approves a replacement. Store the exact upstream commit/tag
and SHA-256 alongside the deployment record. A model update requires a new
evaluation and re-enrollment; the worker rejects a template-store fingerprint
created by different configured model files.

## Explicitly excluded

Do not add, download, import, or indirectly fetch InsightFace pretrained model
packs. Their upstream project distinguishes code licensing from restrictions on
provided pretrained weights, including non-commercial-research terms for model
downloads. This scaffold contains no `insightface` dependency, model URL, hub
loader, or fallback.

Also do not substitute scraped social images, face-search services, public face
datasets, cloud recognition APIs, or a model hub's auto-download feature.

## Runtime dependencies

- [OpenCV](https://opencv.org/license/) / `opencv-python-headless`: detection,
  alignment, quality gates, and fixed SFace inference.
- [NumPy](https://numpy.org/doc/stable/license.html): in-memory frame/features.
- [PyAV](https://pyav.org/docs/stable/overview/about.html): FFmpeg-backed decode
  with container media PTS. Review the exact PyAV wheel and its linked FFmpeg
  build/license for the target platform before distributing it.

Python packages are free/open-source, but "free" is not the same as
license-free. Preserve dependency notices and repeat the audit whenever a wheel,
model, or deployment target changes.

## Suggested provenance record (kept outside Git)

```json
{
  "name": "OpenCV Zoo SFace",
  "filename": "face_recognition_sface_2021dec.onnx",
  "upstream_url": "https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface",
  "upstream_commit": "RECORD_THE_COMMIT_USED",
  "downloaded_at": "RECORD_UTC_TIMESTAMP",
  "sha256": "RECORD_SHA256",
  "reviewed_by": "RECORD_OPERATOR",
  "license_reviewed": true
}
```

Never put stream keys, credentials, face images, or embeddings in that record.
