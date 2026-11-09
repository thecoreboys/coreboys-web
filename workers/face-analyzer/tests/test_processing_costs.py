from __future__ import annotations
import os,time,unittest
from unittest.mock import patch
from face_analyzer.errors import DataError
from face_analyzer.jobs import _validate_job_configuration
from face_analyzer.wake_queue import WakeQueue

class ProcessingCostTests(unittest.TestCase):
    def test_worker_independently_limits_expensive_intervals(self):
        self.assertEqual(_validate_job_configuration({'startMs':0,'endMs':3600000},require_bounds=True),(2000,0,3600000))
        for config in ({'endMs':3600001},{'endMs':7200001,'samplingFps':.1},{'endMs':599401,'samplingFps':3}):
            with self.assertRaisesRegex(DataError,'budget'):
                _validate_job_configuration({'startMs':0,**config},require_bounds=True)
        self.assertEqual(_validate_job_configuration({'startMs':0,'endMs':599400,'samplingFps':3},require_bounds=True)[0],333)
        self.assertEqual(_validate_job_configuration({'startMs':0,'endMs':201*1800,'samplingFps':1000/200.5},require_bounds=True)[0],201)

    def test_queue_keeps_new_wake_racing_idle_probe_and_encodes_delete_receipt(self):
        queue=WakeQueue('testaccount','face-work')
        old='<QueueMessage><MessageId>old/id</MessageId><PopReceipt>a+b/=</PopReceipt><InsertionTime>Mon, 01 Jan 2024 00:00:00 GMT</InsertionTime></QueueMessage>'
        new='<QueueMessage><MessageId>new</MessageId><PopReceipt>new</PopReceipt><InsertionTime>Fri, 01 Jan 2100 00:00:00 GMT</InsertionTime></QueueMessage>'
        with patch.object(queue,'_request',side_effect=[f'<QueueMessagesList>{old}{new}</QueueMessagesList>'.encode(),b'']) as request:
            queue.acknowledge_idle(before=time.time()-2)
        self.assertEqual(request.call_count,2)
        self.assertIn('/old%2Fid?popreceipt=a%2Bb%2F%3D',request.call_args.args[0])
        self.assertEqual(request.call_args.args[1],'DELETE')

    def test_queue_disabled_without_configuration_and_rejects_credentials_redirect_targets(self):
        with patch.dict(os.environ,{},clear=True):self.assertIsNone(WakeQueue.from_environment())
        for endpoint in ['https://evil.example/token','http://evil.example/token']:
            with patch.dict(os.environ,{'IDENTITY_ENDPOINT':endpoint,'IDENTITY_HEADER':'never-send-this'},clear=True):
                with self.assertRaisesRegex(DataError,'identity'):WakeQueue('account','face-work')._token()

    def test_queue_identity_token_is_cached_and_wake_messages_never_need_person_data(self):
        from io import BytesIO
        import json
        queue=WakeQueue('account','face-work')
        with patch.dict(os.environ,{'IDENTITY_ENDPOINT':'http://127.0.0.1/token','IDENTITY_HEADER':'local-header','FACE_WORK_QUEUE_CLIENT_ID':'worker-client'},clear=True),patch('face_analyzer.wake_queue._open',return_value=BytesIO(json.dumps({'access_token':'test-token','expires_on':str(time.time()+3600)}).encode())) as opener:
            self.assertEqual(queue._token(),'test-token')
            self.assertEqual(queue._token(),'test-token')
            self.assertEqual(opener.call_count,1)
            request=opener.call_args.args[0]
            self.assertIn('client_id=worker-client',request.full_url)
            self.assertIn('resource=https%3A%2F%2Fstorage.azure.com%2F',request.full_url)

if __name__=='__main__':unittest.main()
