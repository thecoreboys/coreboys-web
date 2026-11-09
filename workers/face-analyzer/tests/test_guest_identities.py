from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from face_analyzer.config import load_config
from face_analyzer.policy import authorize_run
from face_analyzer.matching import ClosedSetMatcher
from helpers import config_payload, write_config


class GuestIdentityTests(unittest.TestCase):
    def test_admin_guest_resolves_without_becoming_a_member(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            payload = config_payload()
            payload["identities"][1]["canonical_kind"] = "guest"
            payload["identities"][1]["canonical_slug"] = "guest-streamer"
            config = load_config(write_config(Path(directory), payload))
            run = authorize_run(config, "bio", expected_mode="biometric")
            self.assertEqual(run.identities["bob"].canonical_kind, "guest")
            self.assertEqual(run.identities["bob"].canonical_slug, "guest-streamer")
            # Synthetic vectors only: verifies guest IDs use the same matching
            # and allowlist path; it does not measure real-world face accuracy.
            matcher = ClosedSetMatcher(
                {"alice": [[1.0, 0.0]], "bob": [[0.0, 1.0]]},
                minimum_similarity=0.7, minimum_top_two_margin=0.2,
            )
            self.assertEqual(matcher.match([0.01, 0.99], set(run.identities)).identity_id, "bob")
            self.assertIsNone(matcher.match([0.01, 0.99], {"alice"}).identity_id)


if __name__ == "__main__":
    unittest.main()
