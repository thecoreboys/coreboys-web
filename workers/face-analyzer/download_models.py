"""Pinned OpenCV Zoo weights; verify against the upstream Git LFS object hashes."""
import hashlib
from pathlib import Path
from urllib.request import urlopen

COMMIT = "48b10fa505aeb51fbd127fc60a5c660040e823b7"
MODELS = [
    ("face_detection_yunet", "face_detection_yunet_2023mar.onnx", "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    ("face_recognition_sface", "face_recognition_sface_2021dec.onnx", "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"),
]
target = Path("models")
target.mkdir(exist_ok=True)
for folder, filename, digest in MODELS:
    url = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{COMMIT}/models/{folder}/{filename}"
    with urlopen(url, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError("Upstream model digest mismatch")
    (target / filename).write_bytes(data)
    with urlopen(f"https://raw.githubusercontent.com/opencv/opencv_zoo/{COMMIT}/models/{folder}/LICENSE", timeout=30) as response:
        (target / f"{folder}.LICENSE").write_bytes(response.read())
