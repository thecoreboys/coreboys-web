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

  if(process.env.CORE_REMOTE_VERIFY_BASE) {
    const base=process.env.CORE_REMOTE_VERIFY_BASE;
    assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
    const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
    const browser=await chromium.launch({headless:true,channel:'chrome'});
    const errors=[],calls=[];
    const makeContext=async(viewport,mobile=false)=>{
      const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
      await context.addCookies([{name:'coreboys-consent',value:'denied',url:base}]);
      await context.addInitScript(()=>localStorage.setItem('coretv.content-advisory-seen.v2','1'));
      if(process.env.SITE_ACCESS_CODE)assert.ok((await context.request.post(base+'/api/access/verify',{data:{code:process.env.SITE_ACCESS_CODE}})).ok());
      await context.route('**/api/**',async intercepted=>{
        const req=intercepted.request(),url=new URL(req.url());
        if(url.pathname==='/api/auth/me')return intercepted.fulfill({json:{user:{id:'account-a',email:'local-test@example.invalid',displayName:'Local test',emailVerified:true,createdAt:new Date().toISOString()}}});
        if(url.pathname==='/api/watch/multiview-remote'){
          const body=req.method()==='POST'?req.postDataJSON():null;
          const result=await auth.run('account-a',()=>body?route.POST(new Request(req.url(),{method:'POST',headers:{...req.headers(),origin:base},body:JSON.stringify(body)})):route.GET(new Request(req.url())));
          const json=await result.json(); calls.push({action:body?.action??'poll',status:result.status});
          return intercepted.fulfill({status:result.status,json});
        }
        // Test login is simulated. Prevent account-side mutations reaching production.
        if(req.method()!=='GET' && !['/api/watch/availability'].includes(url.pathname))return intercepted.fulfill({status:200,json:{ok:true}});
        return intercepted.continue();
      });
      return context;
    };
    const desktopContext=await makeContext({width:1600,height:1000});
    const desktop=await desktopContext.newPage();desktop.setDefaultTimeout(60000);
    desktop.on('pageerror',e=>errors.push(e.message));
    try{
      await desktop.goto(base+'/multiview?remote=1',{waitUntil:'domcontentloaded',timeout:120000});
      const consent=desktop.getByRole('dialog',{name:'Cookie consent',exact:true});await consent.waitFor({state:"visible",timeout:10000}).catch(()=>{});if(await consent.isVisible())await consent.getByRole('button',{name:'Decline',exact:true}).click();
      const muted=desktop.getByRole('button',{name:'Keep all muted',exact:true});if(await muted.isVisible())await muted.click();
      await desktop.getByText('Phone remote ready',{exact:true}).waitFor({timeout:120000});
      let active;
      for(let i=0;i<30;i++){
        active=(await call(null)).body.sessions[0];if(active?.sources.length>1)break;await new Promise(r=>setTimeout(r,1000));
      }
      assert.ok(active?.sources.length>1,'Actual desktop room must expose at least two sources');
      const before=active.main, next=active.sources.find(s=>remote.remoteSourceKey(s)!==before);
      const nextKey=remote.remoteSourceKey(next), nextMember=members.MEMBERS.find(m=>m.slug===next.member);
      const phoneContext=await makeContext({width:390,height:844},true);
      const phone=await phoneContext.newPage();phone.setDefaultTimeout(60000);phone.on('pageerror',e=>errors.push(e.message));
      await phone.goto(base+'/multiview/remote',{waitUntil:'domcontentloaded',timeout:120000});
      const phoneConsent=phone.getByRole('dialog',{name:'Cookie consent',exact:true});await phoneConsent.waitFor({state:"visible",timeout:10000}).catch(()=>{});if(await phoneConsent.isVisible())await phoneConsent.getByRole('button',{name:'Decline',exact:true}).click();
      await phone.getByRole('region',{name:'Connected Multiview controls'}).waitFor().catch(()=>phone.locator('section[aria-label="Connected Multiview controls"]').waitFor());
      await phone.getByRole('group',{name:'CORE members',exact:true}).getByRole('button',{name:new RegExp(nextMember.stageName)}).click();
      for(let i=0;i<30;i++){
        active=(await call(null)).body.sessions[0];if(active?.main===nextKey&&active.command?.status==='applied')break;await new Promise(r=>setTimeout(r,1000));
      }
      assert.equal(active.main,nextKey);assert.equal(active.command.status,'applied');
      await desktop.waitForFunction(login=>document.querySelector('[data-room-player][data-focused=\"true\"] iframe')?.src.includes('channel='+login),nextMember.twitchLogin.toLowerCase(),{timeout:30000});
      assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await phone.screenshot({path:'.cache/nov11-player-fix/phone-remote.png',fullPage:true});
      await desktop.screenshot({path:'.cache/nov11-player-fix/desktop-remote.png',fullPage:true});
      assert.deepEqual(errors,[]);
      checked.push('actual desktop and phone UI exchange commands and acknowledge the committed main source (isolated database; simulated login)');
      await desktop.goto(base+"/legal/privacy",{waitUntil:"domcontentloaded",timeout:120000});
      for(let i=0;i<15;i++){if(!(await call(null)).body.sessions.length)break;await new Promise(r=>setTimeout(r,500));}
      assert.equal((await call(null)).body.sessions.length,0);
      checked.push('leaving the desktop room closes the connected phone session'); await desktopContext.close();
      await phoneContext.close();
    }finally{await browser.close();}
  }

  console.log(JSON.stringify({ok:true,localOnly:true,checks:checked}));
} finally {
  if(client)await client.end().catch(()=>{});
  if(started)docker('rm','-f',container);
}
