import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
import {migrate} from '../scripts/migrate.js';
import {bootstrap} from '../scripts/bootstrap-admin.js';
import {transaction,closeDatabase} from '../server/db.js';
import handler from '../server/api.js';

const ownerBase=process.env.TEST_DATABASE_URL;
if(!ownerBase||!['localhost','127.0.0.1','[::1]'].includes(new URL(ownerBase).hostname))throw Error('TEST_DATABASE_URL must point to a disposable local PostgreSQL instance');
const dbName='rimdan_test_'+randomBytes(6).toString('hex');
const ownerURL=new URL(ownerBase);ownerURL.pathname='/'+dbName;
const appURL=new URL(ownerURL);appURL.username='rimdan_test_app';appURL.password='';
let root,owner,server,origin,admin,manager,employee,other,documentId,assetId;
const password='Fictional-Test-Password-2026';
async function request(path,method='GET',data,session,headers={}){
 const response=await fetch(origin+'/api/v1/'+path,{method,headers:{Origin:origin,...(data?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf||''}:{}),...headers},body:data?JSON.stringify(data):undefined});
 const type=response.headers.get('content-type');const result=type?.startsWith('application/json')?await response.json():Buffer.from(await response.arrayBuffer());return {status:response.status,data:result,headers:response.headers};
}
async function login(email){const result=await request('login','POST',{email,password});assert.equal(result.status,200);const session={cookie:result.headers.get('set-cookie').split(';')[0]};const info=await request('session','GET',null,session);assert.equal(info.status,200);return {...session,csrf:info.data.csrf,user:info.data.user};}
const content=()=>({title:'Fictional company letter',number:'TEST-001',recipient:'Fictional recipient',type:'letter',language:'fa',date:'2026-11-02',body:'متن آزمایشی',letterhead:'official-fa',format:{size:12,font:'Vazirmatn',spacing:1.95,align:'start'},marks:{signature:null,stamp:null}});
before(async()=>{
 root=new pg.Client({connectionString:ownerBase});await root.connect();await root.query(`CREATE DATABASE ${dbName}`);
 await root.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rimdan_test_app') THEN CREATE ROLE rimdan_test_app LOGIN; END IF; END $$");
 await migrate(ownerURL.href);await migrate(ownerURL.href);
 await root.query('GRANT rimdan_runtime TO rimdan_test_app');
 await bootstrap(ownerURL.href,'admin@test.invalid',password);
 owner=new pg.Client({connectionString:ownerURL.href});await owner.connect();
 process.env.DATABASE_URL=appURL.href;process.env.APP_ENV='development';
 server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;process.env.APP_ORIGIN=origin;
 admin=await login('admin@test.invalid');
 for(const [email,role] of [['manager@test.invalid','manager'],['employee@test.invalid','employee'],['other@test.invalid','manager']])assert.equal((await request('users','POST',{email,password,role},admin)).status,200);
 manager=await login('manager@test.invalid');employee=await login('employee@test.invalid');other=await login('other@test.invalid');
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await closeDatabase();await owner?.end();if(root){await root.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);await root.end();}});

test('server sessions are opaque, private, origin/CSRF guarded and no public signup exists',async()=>{
 assert.equal((await request('documents')).status,401);
 const auth=await request('login','POST',{email:'manager@test.invalid',password});assert.match(auth.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 assert.equal((await request('login','POST',{email:'manager@test.invalid',password:'incorrect-password'})).status,401);
 assert.equal((await request('users','POST',{email:'attack@test.invalid',role:'manager'})).status,401);
 assert.equal((await request('documents','POST',content(),manager,{'X-CSRF-Token':'wrong'})).status,403);
 assert.equal((await request('documents','POST',content(),manager,{Origin:'https://evil.invalid'})).status,403);
 assert.equal((await request('signup','POST',{},manager)).status,404);
});

test('employees cannot call document mutations, mark uploads, templates, roles or output APIs directly',async()=>{
 for(const [path,method,data] of [['documents','POST',content()],['assets','POST',{}],['templates','GET',null],['users','GET',null],['audit','GET',null]])assert.equal((await request(path,method,data,employee)).status,403,path);
 assert.equal((await request('users','GET',null,manager)).status,403);
 const created=await request('documents','POST',content(),manager);assert.equal(created.status,200);documentId=created.data.id;
 assert.equal((await request('documents/'+documentId,'GET',null,employee)).status,404);
 for(const [suffix,method,data] of [['','PATCH',{...content(),version:1}],['','DELETE',{version:1}],['/duplicate','POST',{}],['/export','POST',{}],['/print','POST',{}]])assert.equal((await request('documents/'+documentId+suffix,method,data,employee)).status,403);
 assert.equal((await request('documents','GET',null,employee)).data.length,0);
});

test('database RLS independently denies employee writes, role escalation and draft reads',async()=>{
 const c=new pg.Client({connectionString:appURL.href});await c.connect();try{
  await c.query('BEGIN');await c.query("SELECT set_config('app.user_id',$1,true)",[employee.user.id]);assert.equal((await c.query('SELECT * FROM documents')).rowCount,0);
  assert.equal((await c.query("UPDATE accounts SET role='administrator' WHERE id=$1",[employee.user.id])).rowCount,0);
  await assert.rejects(()=>c.query("INSERT INTO documents(title,type,language,content,created_by) VALUES('Attack','letter','en','{}',$1)",[employee.user.id]),e=>e.code==='42501');
  await c.query('ROLLBACK');
  await assert.rejects(()=>c.query('SELECT password_hash FROM accounts'),e=>e.code==='42501');
  await assert.rejects(()=>c.query("INSERT INTO audit_records(entity,action) VALUES('attack','forged')"),e=>e.code==='42501');
 }finally{await c.end();}
});

test('exactly one active administrator is a database invariant; self-role change is rejected',async()=>{
 await assert.rejects(()=>owner.query("INSERT INTO accounts(email,password_hash,role,active) SELECT 'second@test.invalid',password_hash,'administrator',true FROM accounts WHERE id=$1",[admin.user.id]),e=>e.code==='23505');
 await owner.query('BEGIN');await owner.query("UPDATE accounts SET active=false WHERE role='administrator'");await assert.rejects(()=>owner.query('COMMIT'),e=>e.code==='23514');
 assert.equal((await request('users/'+admin.user.id,'PATCH',{role:'employee',active:true},admin)).status,403);
 assert.equal((await request('users/'+manager.user.id,'PATCH',{role:'administrator',active:true},admin)).status,400);
 const count=await owner.query("SELECT count(*)::int n FROM accounts WHERE role='administrator' AND active");assert.equal(count.rows[0].n,1);
 await assert.rejects(()=>bootstrap(ownerURL.href,'another@test.invalid',password),/non-empty/);
});

test('mark assets are validated, private and grant-controlled; signing/stamping are audited',async()=>{
 const png=await sharp({create:{width:64,height:64,channels:4,background:{r:30,g:70,b:130,alpha:.5}}}).png().toBuffer();
 const asset=await request('assets','POST',{kind:'signature',dataUrl:'data:image/png;base64,'+png.toString('base64')},manager);assert.equal(asset.status,200);assetId=asset.data.id;
 assert.equal((await request('assets/'+assetId)).status,401);assert.equal((await request('assets/'+assetId,'GET',null,other)).status,404);assert.equal((await request('assets/'+assetId,'GET',null,employee)).status,403);
 assert.equal((await request('assets','POST',{kind:'stamp',dataUrl:'data:image/png;base64,'+Buffer.from('<svg/>').toString('base64')},manager)).status,400);
 const d={...content(),version:1,marks:{signature:{assetId,x:40,y:210,width:20,ratio:1},stamp:null}};
 assert.equal((await request('documents','POST',d,other)).status,403);
 const saved=await request('documents/'+documentId,'PATCH',d,manager);assert.equal(saved.status,200);
 assert.equal((await request('documents/'+documentId+'/assets/'+assetId,'GET',null,employee)).status,404);
 assert.equal((await request('assets/'+assetId+'/grants','POST',{accountId:other.user.id},manager)).status,403);
 assert.equal((await request('assets/'+assetId+'/grants','POST',{accountId:other.user.id},admin)).status,200);
 assert.equal((await request('documents','POST',d,other)).status,200);
 assert.equal((await request('assets/'+assetId+'/grants','DELETE',{accountId:other.user.id},admin)).status,200);
 assert.equal((await request('documents','POST',d,other)).status,403);
 const stamps=await request('assets','POST',{kind:'stamp',dataUrl:'data:image/png;base64,'+png.toString('base64')},manager);assert.equal(stamps.status,200);
 const next={...saved.data,marks:{...saved.data.marks,stamp:{assetId:stamps.data.id,x:130,y:200,width:20,ratio:1}}};assert.equal((await request('documents/'+documentId,'PATCH',next,manager)).status,200);
 const audit=await request('audit','GET',null,admin);assert.ok(audit.data.some(r=>r.action==='document_signing_changed'));assert.ok(audit.data.some(r=>r.action==='document_stamping_changed'));
});

test('finalized-only employee reads, no employee export, optimistic concurrency, archive/delete/duplicate',async()=>{
 let current=(await request('documents/'+documentId,'GET',null,manager)).data;
 const finalized=await request('documents/'+documentId,'PATCH',{...current,status:'finalized'},manager);assert.equal(finalized.status,200);
 assert.equal((await request('documents/'+documentId,'GET',null,employee)).status,200);
 assert.equal((await request(`documents/${documentId}/assets/${assetId}`,'GET',null,employee)).status,200);
 assert.equal((await request('documents/'+documentId+'/export','POST',{},employee)).status,403);
 const beforeOutput=(await owner.query("SELECT count(*)::int n FROM audit_records WHERE action IN ('document_print','document_export')")).rows[0].n;
 for(const operation of ['print','export'])assert.equal((await request('documents/'+documentId+'/'+operation,'POST',{version:finalized.data.version-1},manager)).status,409);
 assert.equal((await owner.query("SELECT count(*)::int n FROM audit_records WHERE action IN ('document_print','document_export')")).rows[0].n,beforeOutput);
 assert.equal((await request('documents/'+documentId+'/print','POST',{version:finalized.data.version},manager)).status,200);
 current=finalized.data;
 const attempts=await Promise.all([request('documents/'+documentId,'PATCH',{...current,title:'Revision A'},manager),request('documents/'+documentId,'PATCH',{...current,title:'Revision B'},other)]);
 assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);
 const duplicate=await request('documents/'+documentId+'/duplicate','POST',{},manager);assert.equal(duplicate.status,200);assert.equal(duplicate.data.marks.signature.assetId,assetId);
 const restrictedCopy=await request('documents/'+documentId+'/duplicate','POST',{},other);assert.equal(restrictedCopy.status,200);assert.equal(restrictedCopy.data.marks.signature,null);
 current=(await request('documents/'+documentId,'GET',null,manager)).data;
 const archived=await request('documents/'+documentId,'PATCH',{...current,status:'archived'},manager);assert.equal(archived.status,200);assert.equal((await request('documents/'+documentId,'GET',null,employee)).status,404);
 assert.equal((await request('documents/'+documentId,'DELETE',{version:archived.data.version},manager)).status,200);
 assert.equal((await request('documents/'+documentId,'GET',null,manager)).status,404);
 const records=(await request('audit','GET',null,admin)).data;assert.ok(records.some(x=>x.action==='document_deleted'));assert.ok(records.some(x=>x.action==='document_print'));
});

test('templates are manager-writeable; explicit local imports are idempotent and remain drafts',async()=>{
 const template={key:'test-template',name_en:'Test',name_fa:'آزمایش',body_en:'Fictional body',body_fa:'متن آزمایشی'};
 const created=await request('templates','POST',template,manager);assert.equal(created.status,200);
 assert.equal((await request('templates/'+created.data.id,'PATCH',{...template,version:1,body_en:'Changed'},manager)).status,200);
 assert.equal((await request('templates/'+created.data.id,'DELETE',{version:2},manager)).status,200);
 const data={...content(),status:'finalized',importKey:'local:fixture-001'};
 const a=await request('documents','POST',data,manager),b=await request('documents','POST',data,manager);assert.equal(a.status,200);assert.equal(a.data.id,b.data.id);assert.equal(a.data.status,'draft');
});

test('admin-only invitations are single-use; role changes/deactivation immediately restrict sessions',async()=>{
 const invitation=await request('users','POST',{email:'invite@test.invalid',role:'employee'},admin);assert.equal(invitation.status,200);
 let secret=new URL(invitation.data.invitationURL).hash.slice(8);assert.ok(secret);
 assert.equal((await request('users/'+invitation.data.account.id,'PATCH',{active:false},admin)).status,200);
 assert.equal((await request('invitations/accept','POST',{token:secret,password})).status,400);
 const reissued=await request('users/'+invitation.data.account.id+'/invitation','POST',{},admin);assert.equal(reissued.status,200);secret=new URL(reissued.data.invitationURL).hash.slice(8);
 assert.equal((await request('invitations/accept','POST',{token:secret,password})).status,200);
 assert.equal((await request('invitations/accept','POST',{token:secret,password})).status,400);
 const accepted=await login('invite@test.invalid');assert.equal(accepted.user.role,'employee');
 assert.equal((await request('users/'+other.user.id,'PATCH',{role:'employee',active:true},admin)).status,200);
 assert.equal((await request('documents','POST',content(),other)).status,403);
 assert.equal((await request('users/'+manager.user.id,'PATCH',{role:'manager',active:false},admin)).status,200);
 assert.equal((await request('documents','GET',null,manager)).status,401);
 assert.equal((await request('users/'+manager.user.id,'PATCH',{active:true},admin)).status,200);
 assert.equal((await request('session','GET',null,manager)).status,401);
 assert.equal((await login('manager@test.invalid')).user.role,'manager');
 const audit=(await request('audit','GET',null,admin)).data;assert.ok(audit.some(x=>x.action==='account_changed'));
 assert.equal((await request('logout','POST',{},employee)).status,200);assert.equal((await request('session','GET',null,employee)).status,401);
});

test('expired sessions, throttling and production cookie flags',async()=>{
 const fresh=await login('invite@test.invalid');
 await owner.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE account_id=$1",[fresh.user.id]);
 assert.equal((await request('session','GET',null,fresh)).status,401);
 for(let i=0;i<20;i++)assert.equal((await request('login','POST',{email:'nonexistent-rate@test.invalid',password:'Incorrect-Password'})).status,401);
 assert.equal((await request('login','POST',{email:'nonexistent-rate@test.invalid',password:'Incorrect-Password'})).status,429);
 const {cookie}=await import('../server/auth.js');const oldOrigin=process.env.APP_ORIGIN,oldEnv=process.env.APP_ENV;process.env.APP_ORIGIN='https://example.invalid';process.env.APP_ENV='production';
 try{const value=cookie('test');assert.match(value,/^__Host-rimdan_session=/);assert.match(value,/; Secure$/);assert.match(value,/HttpOnly; SameSite=Strict/);}finally{process.env.APP_ORIGIN=oldOrigin;process.env.APP_ENV=oldEnv;}
});

test('runtime refuses both owner credentials and inherited owner membership',async()=>{
 const previous=process.env.DATABASE_URL;const role='rimdan_privileged_'+randomBytes(6).toString('hex');
 await closeDatabase();
 try{
  process.env.DATABASE_URL=ownerURL.href;await assert.rejects(()=>transaction(c=>c.query('SELECT 1')),/Unsafe runtime/);await closeDatabase();
  await root.query(`CREATE ROLE ${role} LOGIN IN ROLE postgres`);const inherited=new URL(ownerURL);inherited.username=role;inherited.password='';process.env.DATABASE_URL=inherited.href;
  await assert.rejects(()=>transaction(c=>c.query('SELECT 1')),/Unsafe runtime/);
 }finally{await closeDatabase();process.env.DATABASE_URL=previous;await root.query(`DROP ROLE IF EXISTS ${role}`);}
});


test('Administrator-only readiness and runtime credential CLI use no owner privileges',async()=>{
 assert.equal((await request('ready')).status,401);
 assert.equal((await request('ready','GET',null,admin)).status,200);
 assert.equal((await request('ready','GET',null,await login('manager@test.invalid'))).status,403);
 assert.equal((await request('ready','GET',null,await login('employee@test.invalid'))).status,403);
 const result=spawnSync(process.execPath,['scripts/check-runtime.js'],{encoding:'utf8',env:{...process.env,DATABASE_URL:appURL.href},timeout:20000});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{ready:true});
});


test('Phase 3 selected audiences are enforced for staff and finalized employees',async()=>{
 // Earlier tests exercise deactivation and session revocation; create fresh fixtures.
 const currentManager=await login('manager@test.invalid');
 const currentEmployee=await login('employee@test.invalid');
 const targets=await request('share-targets','GET',null,currentManager);
 assert.equal(targets.status,200);
 const recipient=targets.data.find(x=>x.email==='employee@test.invalid');
 assert.ok(recipient?.id);
 const created=await request('documents','POST',{...content(),title:'Restricted fictional test',audience:'selected',visibleTo:[recipient.id]},currentManager);
 assert.equal(created.status,200);
 const id=created.data.id;
 assert.equal((await request('documents/'+id,'GET',null,other)).status,404);
 assert.equal((await request('documents/'+id,'GET',null,currentEmployee)).status,404);
 const finished=await request('documents/'+id,'PATCH',{...content(),title:'Restricted fictional test',audience:'selected',visibleTo:[recipient.id],status:'finalized',version:created.data.version},currentManager);
 assert.equal(finished.status,200);
 assert.equal((await request('documents/'+id,'GET',null,currentEmployee)).status,200);
 assert.equal((await request('documents/'+id,'GET',null,other)).status,404);
 assert.equal((await request('documents/'+id,'GET',null,admin)).status,200);
 assert.ok([403,404].includes((await request('documents/'+id,'PATCH',{...content(),version:finished.data.version},other)).status));
 assert.ok([403,404].includes((await request('documents/'+id,'POST',{version:finished.data.version},other)).status));
 const unshared=await request('documents/'+id,'PATCH',{...content(),title:'Restricted fictional test',audience:'selected',visibleTo:[],status:'finalized',version:finished.data.version},currentManager);
 assert.equal(unshared.status,200);
 assert.equal((await request('documents/'+id,'GET',null,currentEmployee)).status,404);
});
test('Phase 3 manual one-time password reset revokes sessions and rejects replay',async()=>{
 const target=(await owner.query("SELECT id FROM accounts WHERE email='employee@test.invalid'")).rows[0];
 const issued=await request('users/'+target.id+'/recovery','POST',{},admin);
 assert.equal(issued.status,200);
 assert.equal(issued.data.delivery,'manual');
 const token=new URL(issued.data.recoveryURL).hash.slice('#reset='.length);
 const updated='Fictional-Recovered-Password-2026';
 assert.equal((await request('password-reset/accept','POST',{token,password:updated})).status,200);
 assert.equal((await request('session','GET',null,employee)).status,401);
 assert.notEqual((await request('password-reset/accept','POST',{token,password:updated})).status,200);
 assert.equal((await request('login','POST',{email:'employee@test.invalid',password})).status,401);
 assert.equal((await request('login','POST',{email:'employee@test.invalid',password:updated})).status,200);
});
