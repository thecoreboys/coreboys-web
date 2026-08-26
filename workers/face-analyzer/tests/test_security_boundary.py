from __future__ import annotations

import re
import unittest
from pathlib import Path


class SecurityBoundaryTests(unittest.TestCase):
    def test_worker_never_directly_mutates_protected_face_tables(self) -> None:
        package = Path(__file__).parents[1] / "face_analyzer"
        source = "\n".join(
            (package / name).read_text(encoding="utf-8")
            for name in ("authority.py", "bridge.py", "jobs.py")
        )
        forbidden = re.compile(
            r"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"
            r"face_(?:jobs|tracks|audit_log|template_sets)\b",
            re.IGNORECASE,
        )
        self.assertIsNone(forbidden.search(source))
        self.assertNotIn("current_consent.*", source)
        for rpc in (
            "claim_face_archive_job",
            "heartbeat_face_job",
            "finish_face_job",
            "import_face_track_proposal",
            "sync_face_template_set",
            "attest_face_template_purged",
            "heartbeat_face_worker",
        ):
            self.assertIn(rpc, source)

    def test_deployment_guide_has_no_direct_face_table_writes(self) -> None:
        guide = (Path(__file__).parents[1] / "DB_IMPORT.md").read_text(encoding="utf-8")
        self.assertIsNone(
            re.search(
                r"GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE)|"
                r"GRANT\s+(?:USAGE|SELECT)\s+ON\s+SEQUENCE",
                guide,
                re.IGNORECASE,
            )
        )
        self.assertIn("GRANT EXECUTE ON FUNCTION import_face_track_proposal", guide)
        self.assertIn(
            "GRANT EXECUTE ON FUNCTION heartbeat_face_worker(text, text, boolean, text, text, text)",
            guide,
        )


if __name__ == "__main__":
    unittest.main()
