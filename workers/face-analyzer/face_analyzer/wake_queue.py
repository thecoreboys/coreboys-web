"""Content-free Azure Queue wake hints, authorized by a queue-scoped identity."""
from __future__ import annotations
import json,os,time
from urllib.parse import urlencode,urlparse,parse_qsl,urlunparse,quote
from urllib.request import Request,build_opener,HTTPRedirectHandler
from xml.etree import ElementTree
from email.utils import formatdate,parsedate_to_datetime
from .errors import DataError

class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

_open=build_opener(_NoRedirect()).open

class WakeQueue:
    def __init__(self,account:str,name:str):
        self.base=f"https://{account}.queue.core.windows.net/{name}/messages"
        self.token=None;self.expires=0.

    @classmethod
    def from_environment(cls):
        import re
        account=os.environ.get('FACE_WORK_QUEUE_ACCOUNT','');name=os.environ.get('FACE_WORK_QUEUE_NAME','')
        if not account and not name:return None
        if not re.fullmatch(r'[a-z0-9]{3,24}',account) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',name):raise DataError('Invalid wake queue configuration')
        return cls(account,name)

    def _token(self):
        if self.token and self.expires>time.time()+60:return self.token
        endpoint=urlparse(os.environ.get('IDENTITY_ENDPOINT',''))
        if endpoint.scheme!='http' or (endpoint.hostname not in {'localhost','127.0.0.1','::1'} and not (endpoint.hostname or '').startswith('169.254.')) or not os.environ.get('IDENTITY_HEADER'):raise DataError('Managed identity is unavailable')
        params=dict(parse_qsl(endpoint.query));params.update(resource='https://storage.azure.com/',**{'api-version':'2019-08-01'})
        if os.environ.get('FACE_WORK_QUEUE_CLIENT_ID'):params['client_id']=os.environ['FACE_WORK_QUEUE_CLIENT_ID']
        request=Request(urlunparse(endpoint._replace(query=urlencode(params))),headers={'X-IDENTITY-HEADER':os.environ['IDENTITY_HEADER']})
        with _open(request,timeout=5) as response:data=json.loads(response.read(100000))
        self.token=data['access_token'];self.expires=float(data.get('expires_on',time.time()+300));return self.token

    def _request(self,url,method='GET'):
        try:
            request=Request(url,method=method,headers={'Authorization':f'Bearer {self._token()}','x-ms-version':'2022-11-02','x-ms-date':formatdate(usegmt=True)})
            with _open(request,timeout=10) as response:return response.read(256000)
        except Exception as exc:raise DataError('Wake queue transport unavailable') from exc

    def acknowledge_idle(self,*,before:float):
        # Called only after a DB probe finds no active jobs or template purges.
        # Message count keeps KEDA awake while another lease holder still runs.
        raw=self._request(self.base+'?numofmessages=32&visibilitytimeout=30')
        if b'<!DOCTYPE' in raw:raise DataError('Invalid wake queue response')
        messages=ElementTree.fromstring(raw)
        for message in messages.findall('QueueMessage'):
            inserted=message.findtext('InsertionTime')
            # Keep messages racing the DB probe. A new job must retain its wake
            # hint throughout processing, even when it outlasts KEDA cooldown.
            if not inserted or parsedate_to_datetime(inserted).timestamp()>=before:continue
            identifier=message.findtext('MessageId');receipt=message.findtext('PopReceipt')
            if not identifier or not receipt:raise DataError('Invalid wake queue message')
            self._request(self.base+'/'+quote(identifier,safe='')+'?'+urlencode({'popreceipt':receipt}),'DELETE')
