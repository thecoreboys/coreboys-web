import hashlib
import os
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import MagicMock, patch

from helpers import write_config
from face_analyzer.config import load_config
from face_analyzer.enrollment_jobs import process_next_enrollment
from face_analyzer.bridge import validate_local_database_url
from face_analyzer.errors import PolicyError


class SiteEnrollmentTests(unittest.TestCase):
    def test_hosted_database_requires_explicit_host_and_verified_tls(self):
        good="postgresql://worker:secret@db.example.com/postgres?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt"
        with patch.dict(os.environ,{"FACE_ANALYZER_DATABASE_TLS_HOST":"db.example.com"}):
            self.assertEqual(validate_local_database_url(good),good)
            for bad in [good.replace("verify-full","require"),good.replace("db.example.com","other.example.com"),good+"&hostaddr=127.0.0.1",good+"&sslmode=disable"]:
                with self.assertRaises(PolicyError): validate_local_database_url(bad)

    def test_approved_job_processes_exact_bytes_and_fails_closed_on_completion_change(self):
        for accepted in [True,False]:
            with self.subTest(accepted=accepted), tempfile.TemporaryDirectory() as directory:
                config=load_config(write_config(Path(directory)))
                for spec in (config.yunet,config.sface):
                    spec.path.parent.mkdir(parents=True,exist_ok=True)
                    spec.path.write_bytes(b"model fixture")
                root=config.runtime.enrollment_roots[0]
                root.mkdir(parents=True,exist_ok=True)
                key="00000000-0000-4000-8000-000000000001.webp"
                (root/key).write_bytes(b"synthetic reference fixture")
                job={"id":"job","identity_id":"uuid","canonical_kind":"member","canonical_slug":"alice","references":[{"key":key,"sha256":hashlib.sha256((root/key).read_bytes()).hexdigest()}]}
                cursor=MagicMock()
                cursor.fetchone.side_effect=[{"job":job},{"finished":accepted}]
                db=MagicMock()
                db.connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value=cursor
                with patch.dict(os.environ,{"FACE_SITE_ENROLLMENT_ENABLED":"true","FACE_ANALYZER_DATABASE_URL":"postgresql://worker@localhost/test"}), \
                     patch("face_analyzer.enrollment_jobs._db_modules",return_value=(db,None,None)), \
                     patch("face_analyzer.enrollment_jobs._verify_enrollment_model"), \
                     patch("face_analyzer.enrollment_jobs.refresh_database_people",return_value=config), \
                     patch("face_analyzer.enrollment_jobs.enroll_reference_set",return_value={"template_set_id":"set"}) as enroll, \
                     patch("face_analyzer.enrollment_jobs.purge_local_enrollment") as purge:
                    self.assertTrue(process_next_enrollment(config,"test-worker"))
                    self.assertEqual(enroll.call_args.args[1],"alice","Existing local identity IDs must be preserved")
                    self.assertEqual(enroll.call_args.args[2],[root/key])
                    self.assertEqual(purge.call_count,0 if accepted else 1)

    def test_disabled_site_enrollment_does_not_claim_or_read_photos(self):
        with patch.dict(os.environ,{"FACE_SITE_ENROLLMENT_ENABLED":"false"}), patch("face_analyzer.enrollment_jobs._db_modules") as database:
            self.assertFalse(process_next_enrollment(None,"test-worker"))
            database.assert_not_called()
