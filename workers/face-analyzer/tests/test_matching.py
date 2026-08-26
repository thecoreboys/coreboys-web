from __future__ import annotations

import unittest

from face_analyzer.matching import ClosedSetMatcher, MatchDecision, TemporalConsensus


class MatchingTests(unittest.TestCase):
    def test_clear_closed_set_match(self) -> None:
        matcher = ClosedSetMatcher(
            {"alice": [[1.0, 0.0]], "bob": [[0.0, 1.0]]},
            minimum_similarity=0.7,
            minimum_top_two_margin=0.2,
        )
        decision = matcher.match([0.99, 0.01], {"alice", "bob"})
        self.assertEqual(decision.identity_id, "alice")
        self.assertTrue(decision.recognized)

    def test_low_similarity_is_explicit_unknown(self) -> None:
        matcher = ClosedSetMatcher(
            {"alice": [[1.0, 0.0, 0.0]]},
            minimum_similarity=0.8,
            minimum_top_two_margin=0.1,
        )
        decision = matcher.match([0.0, 1.0, 0.0], {"alice"})
        self.assertIsNone(decision.identity_id)
        self.assertEqual(decision.label, "Unknown")
        self.assertEqual(decision.reason, "below_similarity_threshold")

    def test_ambiguous_top_two_is_unknown(self) -> None:
        matcher = ClosedSetMatcher(
            {"alice": [[1.0, 0.0]], "bob": [[0.995, 0.1]]},
            minimum_similarity=0.5,
            minimum_top_two_margin=0.08,
        )
        decision = matcher.match([1.0, 0.0], {"alice", "bob"})
        self.assertEqual(decision.label, "Unknown")
        self.assertEqual(decision.reason, "ambiguous_top_two_margin")

    def test_allowlist_filters_best_disallowed_identity(self) -> None:
        matcher = ClosedSetMatcher(
            {"alice": [[1.0, 0.0]], "bob": [[0.0, 1.0]]},
            minimum_similarity=0.7,
            minimum_top_two_margin=0.1,
        )
        decision = matcher.match([1.0, 0.0], {"bob"})
        self.assertEqual(decision.label, "Unknown")

    def test_three_of_five_temporal_consensus(self) -> None:
        consensus = TemporalConsensus(window=5, required_hits=3, maximum_gap_ms=2000)
        candidate = MatchDecision("alice", "alice", "candidate", 0.9, 0.2)
        self.assertEqual(consensus.observe("face-1", 0, candidate).label, "Unknown")
        self.assertEqual(consensus.observe("face-1", 500, candidate).label, "Unknown")
        accepted = consensus.observe("face-1", 1000, candidate)
        self.assertEqual(accepted.identity_id, "alice")
        self.assertEqual(accepted.reason, "temporal_consensus_passed")

    def test_consensus_resets_after_gap(self) -> None:
        consensus = TemporalConsensus(window=5, required_hits=2, maximum_gap_ms=1000)
        candidate = MatchDecision("alice", "alice", "candidate")
        consensus.observe("face-1", 0, candidate)
        result = consensus.observe("face-1", 2000, candidate)
        self.assertEqual(result.label, "Unknown")
        self.assertEqual(result.reason, "temporal_consensus_pending")


if __name__ == "__main__":
    unittest.main()
