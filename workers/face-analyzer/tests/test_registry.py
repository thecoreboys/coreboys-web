from __future__ import annotations

import os
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from face_analyzer.config import load_config
from face_analyzer.errors import PolicyError
from face_analyzer.registry import merge_database_people, refresh_database_people
from face_analyzer.lifecycle import purge_local_enrollment
from face_analyzer.store import EnrollmentStore
from helpers import write_config


def person(identity_id="00000000-0000-4000-8000-000000000001", kind="guest", slug="guest-streamer"):
    now = datetime.now(timezone.utc)
    return dict(identity_id=identity_id, canonical_kind=kind, canonical_slug=slug,
                identity_state="active", consent_id="consent-1", subject_confirmed_adult=True,
                allow_template_creation=True, allow_archive_matching=True, revoked_at=None,
                created_at=now-timedelta(hours=1), expires_at=now+timedelta(days=1))


class RegistryTests(unittest.TestCase):
    def test_refresh_adds_admin_guest_and_preserves_protected_media_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            config = replace(load_config(write_config(Path(directory))), identity_registry="database")
            guest = person()
            assignment = dict(content_id="yt-testvideo", identity_id=guest["identity_id"], consent_id="consent-1")
            updated = merge_database_people(config, [guest], [assignment])
            self.assertEqual(updated.sessions["bio"].identity_allowlist, {guest["identity_id"]})
            self.assertEqual(updated.identities[guest["identity_id"]].canonical_kind, "guest")
            self.assertEqual(updated.sources["vod"].uri, config.sources["vod"].uri)
            self.assertEqual(updated.sources["vod"].authorized, config.sources["vod"].authorized)
            self.assertEqual(updated.sessions["bio"].expires_at, config.sessions["bio"].expires_at)
            self.assertEqual(updated.runtime, config.runtime)
            revoked = merge_database_people(updated, [{**guest, "revoked_at": datetime.now(timezone.utc)}], [assignment])
            self.assertEqual(revoked.sessions["bio"].identity_allowlist, frozenset())
            self.assertIn(guest["identity_id"], revoked.identities, "Revoked guests remain resolvable for purging")
            stale = merge_database_people(updated, [guest], [{**assignment, "consent_id": "old-grant"}])
            self.assertEqual(stale.sources["vod"].participant_allowlist, frozenset())

    def test_refresh_preserves_existing_local_template_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            config = load_config(write_config(Path(directory)))
            alice = person(kind="member", slug="alice")
            updated = merge_database_people(config, [alice], [dict(content_id="yt-testvideo", identity_id=alice["identity_id"], consent_id="consent-1")])
            self.assertEqual(updated.sessions["bio"].identity_allowlist, {"alice"})
            self.assertNotIn(alice["identity_id"], updated.identities)

    def test_database_mode_never_falls_back_to_local_matching(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True):
            config = replace(load_config(write_config(Path(directory))), identity_registry="database")
            with self.assertRaisesRegex(PolicyError, "no local fallback"):
                refresh_database_people(config)
            self.assertIs(refresh_database_people(replace(config, identity_registry="config")).identities, config.identities)

    def test_dynamic_guest_can_be_purged_locally_during_database_outage(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True):
            config = replace(load_config(write_config(Path(directory))), identity_registry="database")
            guest_id = person()["identity_id"]
            store = EnrollmentStore(config.runtime.enrollment_store, {"yunet_sha256": "a", "sface_sha256": "b"})
            store.put(guest_id, [[1, 0], [0.99, 0.01], [0.98, -0.01]], image_sha256=["1", "2", "3"],
                      consent_granted_at="2026-01-01T00:00:00Z", consent_expires_at="2099-01-01T00:00:00Z", replace=False)
            result = purge_local_enrollment(config, guest_id, reason="Guest revoked consent", worker_id="test-worker")
            self.assertTrue(result["deleted"])
            self.assertNotIn(guest_id, EnrollmentStore.metadata(config.runtime.enrollment_store)["identities"])
