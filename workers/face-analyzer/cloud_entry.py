"""Single-writer Azure service with private persistent volumes and pinned models."""
import json
import os
from pathlib import Path
import signal
import sys

from face_analyzer.config import load_config
from face_analyzer.vision import OpenCVFaceEngine
from face_analyzer.cli import main

root = Path(__file__).resolve().parent
config = json.loads((root / "config.example.json").read_text())
config["identities"] = []
config["sources"] = []
config["sessions"] = []
config["runtime"].update(data_dir="/data", enrollment_roots=["/references"], media_roots=["/media"],
                         enrollment_store="/data/enrollments.json", event_output="/data/proposals.ndjson", audit_output="/data/audit.ndjson")
for name, filename, digest in [
    ("yunet", "face_detection_yunet_2023mar.onnx", "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"),
    ("sface", "face_recognition_sface_2021dec.onnx", "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"),
]:
    config["models"][name] = {"path": str(root / "models" / filename), "sha256": digest}
config_path = Path("/tmp/face-config.json")
config_path.write_text(json.dumps(config))
engine = OpenCVFaceEngine(load_config(config_path))
engine.cv2.setNumThreads(1)
if "--self-test" in sys.argv:
    import numpy as np
    # No person's image is used in deployment verification.
    assert engine.detector.detect(np.zeros((320, 320, 3), dtype=np.uint8))[1] is None
    print("Verified models load successfully; blank frame has no faces.")
    sys.exit(0)
del engine
signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
sys.exit(main(["serve", "--config", str(config_path), "--worker-id", os.environ["FACE_ANALYZER_WORKER_ID"], "--poll-seconds", "15"]))
