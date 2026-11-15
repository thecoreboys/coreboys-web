import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import pg from 'pg';
import ts from 'typescript';

// Never reads .env or DATABASE_URL. All SQL is confined to a disposable container.
const require = createRequire(import.meta.url);
const container = `core-multiview-test-${randomUUID()}`;
const password = randomBytes(24).toString('hex');
const docker = (...args) => execFileSync('docker', args, { encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim();
const auth = new AsyncLocalStorage();
let client, started = false;
function load(file, overrides = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const module = { exports:{} };
  const code = ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module, exports:module.exports, require:(name) => {
      if (name in overrides) return overrides[name];
      if (name.startsWith('@/') || name.startsWith('.')) throw new Error(`Unmapped import ${name}`);
      return require(name);
    }, process, Buffer, Request, Response, URL, TextDecoder, AbortSignal, console, setTimeout, clearTimeout,
  }, { filename:file });
  return module.exports;
}
const checked = [];
async function check(name, run) { await run(); checked.push(name); }
try {
  docker('run','--rm','-d','--name',container,'-e',`POSTGRES_PASSWORD=${password}`,'-p','127.0.0.1::5432','postgres:16-alpine');
  started=true;
  const port=Number(docker('port',container,'5432/tcp').split(':').at(-1));
  assert.ok(port>0);
  for(let i=0;i<60;i++) { try { docker('exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'); break; } catch(e) { if(i===59)throw e; await new Promise(r=>setTimeout(r,300)); } }
  client = new pg.Client({ host:'127.0.0.1',port,user:'postgres',database:'postgres',password });
  await client.connect();
  await client.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC,anon,authenticated,service_role;
    CREATE TABLE fan_users(id text PRIMARY KEY); INSERT INTO fan_users VALUES('account-a'),('account-b')`);
  const migration=readFileSync(new URL('./migrations/066_multiview_remote.sql',import.meta.url),'utf8');
  await client.query(migration); await client.query(migration);
  await check('migration is repeatable and sessions are private',async()=>{
    for(const role of ['anon','authenticated']) {
      const result=await client.query("SELECT has_table_privilege($1,'fan_multiview_sessions','SELECT,INSERT,UPDATE,DELETE') AS allowed",[role]);
      assert.equal(result.rows[0].allowed,false);
      await client.query(`SET ROLE ${role}`);
      await assert.rejects(client.query('SELECT * FROM fan_multiview_sessions'),{code:'42501'});
      await client.query('RESET ROLE');
    }
    assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid='fan_multiview_sessions'::regclass")).rows[0].relrowsecurity,true);
  });
  const members=load('lib/members.ts');
  const remote=load('lib/watch/multiview-remote.ts');
  const shared=load('app/api/watch/rooms/_shared.ts',{
    '@/lib/subscriptions/entitlements':{EntitlementDeniedError:class extends Error{}},
    '@/lib/watch-together/store':{WatchRoomStoreError:class extends Error{}},
  });
  const http=load('lib/creator-tags/http.ts');
  const route=load('app/api/watch/multiview-remote/route.ts',{
    '../rooms/_shared':shared, '@/lib/creator-tags/http':http,
    '@/lib/db':{query:(...args)=>client.query(...args),withTransaction:async(fn)=>{await client.query('BEGIN');try{const result=await fn(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}}},
    '@/lib/fan-auth':{getCurrentFanUserId:async()=>auth.getStore()??null},
    '@/lib/members':members,'@/lib/watch/multiview-remote':remote,
  });
  const id=randomUUID(), secret=randomUUID();
  const [first,second]=members.MEMBERS;
  const sources=[{member:first.slug,platform:'twitch'},{member:second.slug,platform:'twitch'}];
  const main=remote.remoteSourceKey(sources[0]), target=remote.remoteSourceKey(sources[1]);
  const call=async(action,user='account-a',origin='https://core.local')=>{
    const response=await auth.run(user,()=>action ? route.POST(new Request('https://core.local/api/watch/multiview-remote',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(action)})) : route.GET(new Request('https://core.local/api/watch/multiview-remote')));
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(response.headers.get('vary'),'Cookie');
    return {status:response.status,body:await response.json()};
  };
  const heartbeat={action:'heartbeat',id,secret,device:'windows',sources,main};
  await check('signed-out and foreign-origin requests are rejected',async()=>{
    assert.equal((await call(null,null)).status,401);
    assert.equal((await call(heartbeat,'account-a','https://evil.example')).status,403);
    assert.equal((await call({...heartbeat,sources:[{member:'unknown',platform:'twitch'}]})).status,400);
  });
  await check('desktop registers and same-account phone discovers sources',async()=>{
    const result=await call(heartbeat);assert.equal(result.status,200);assert.equal(result.body.session.main,main);
    assert.equal((await call(null)).body.sessions.length,1);
    assert.equal((await call(null,'account-b')).body.sessions.length,0);
    assert.equal((await client.query('SELECT host_secret_hash FROM fan_multiview_sessions WHERE id=$1',[id])).rows[0].host_secret_hash.length,64);
    assert.equal(JSON.stringify(result.body).includes(secret),false);
  });
  await check('only the account and host secret may control a registered host',async()=>{
    assert.equal((await call({action:'select',id,source:target},'account-b')).status,409);
    assert.equal((await call({...heartbeat,secret:randomUUID()})).status,409);
    assert.equal((await call({...heartbeat},'account-b')).status,409);
  });
  await check('phone selection, host poll and acknowledgement commit the latest source',async()=>{
    let result=await call({action:'select',id,source:target}); assert.equal(result.status,200);
    const old=result.body.session.command.revision;
    result=await call({action:'select',id,source:main});const revision=result.body.session.command.revision;
    assert.ok(revision>old);
    assert.equal((await call({action:'ack',id,secret,revision:old,status:'applied'})).status,409);
    assert.equal((await call({action:'ack',id,secret:randomUUID(),revision,status:'applied'})).status,409);
    assert.equal((await call({action:'ack',id,secret,revision,status:'applied'})).body.session.main,main);
    assert.equal((await call(null)).body.sessions[0].command.status,'applied');
    assert.equal((await call({action:'select',id,source:`${members.MEMBERS[2].slug}:twitch`})).status,409);
  });
  await check('dropped connections expire and stale commands never replay after reconnect',async()=>{
    await call({action:'select',id,source:target});
    await client.query("UPDATE fan_multiview_sessions SET updated_at=now()-interval '80 seconds' WHERE id=$1",[id]);
    assert.equal((await call(null)).body.sessions.length,0);
    assert.equal((await call({action:'select',id,source:target})).status,409);
    const resumed=await call(heartbeat); assert.equal(resumed.status,200);assert.equal(resumed.body.session.command.status,'unavailable');
  });
  await check('closing desktop removes the phone session and prevents resurrection',async()=>{
    await call({action:'end',id,secret:randomUUID()});assert.equal((await call(null)).body.sessions.length,1);
    await call({action:'end',id,secret});assert.equal((await call(null)).body.sessions.length,0);
    assert.equal((await call(heartbeat)).status,409);
  });
  console.log(JSON.stringify({ok:true,localOnly:true,checks:checked}));
} finally {
  if(client)await client.end().catch(()=>{});
  if(started)docker('rm','-f',container);
}
