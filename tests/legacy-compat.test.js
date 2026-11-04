import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {bootstrap} from '../scripts/bootstrap-admin.js';
import {closeDatabase} from '../server/db.js';
import handler from '../server/api.js';

// Disposable, isolated verification of a database intentionally left at
// migrations 001-008: no customer database, no DDL against Supabase.
const base=process.env.TEST_DATABASE_URL;
if(!base||!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))
 throw Error('Legacy compatibility tests require loopback TEST_DATABASE_URL');
const name='rimdan_legacy_'+randomBytes(5).toString('hex');
const adminURL=new URL(base);adminURL.pathname='/'+name;
const appURL=new URL(adminURL);appURL.username='rimdan_test_legacy_app';appURL.password='';
const pass='Fictional-Compatibility-Password-2026';
let root,owner,server,origin,session;
async function request(path,method='GET',body){
 const response=await fetch(origin+'/api/v1/'+path,{
  method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{} )},
  body:body?JSON.stringify(body):undefined
 });
 return {status:response.status,data:await response.json(),headers:response.headers};
}
before(async()=>{
 root=new pg.Client({connectionString:base});await root.connect();
 await root.query('CREATE DATABASE '+name);
 await root.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rimdan_test_legacy_app') THEN CREATE ROLE rimdan_test_legacy_app LOGIN; END IF; END $$");
 owner=new pg.Client({connectionString:adminURL.href});await owner.connect();
 await owner.query('BEGIN');
 await owner.query('SET LOCAL search_path=public,pg_catalog,pg_temp');
 const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(n=>/^00[1-8]_.*\.sql$/.test(n)).sort();
 assert.equal(files.length,8);
 for(const file of files)await owner.query(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 await owner.query('COMMIT');
 await root.query('GRANT rimdan_runtime TO rimdan_test_legacy_app');
 await bootstrap(adminURL.href,'legacy-admin@test.invalid',pass);
 process.env.DATABASE_URL=appURL.href;process.env.APP_ENV='development';
 server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;process.env.APP_ORIGIN=origin;
 const login=await request('login','POST',{email:'legacy-admin@test.invalid',password:pass});
 assert.equal(login.status,200);
 session={cookie:login.headers.get('set-cookie').split(';')[0]};
 const info=await request('session');
 assert.equal(info.status,200);session.csrf=info.data.csrf;
});
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 await closeDatabase();await owner?.end();
 if(root){await root.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await root.end();}
});
const content=()=>({title:'Legacy fictional letter',number:'LEGACY-001',recipient:'Fictional',type:'letter',language:'fa',date:'2026-11-04',body:'متن آزمایشی',letterhead:'official-fa',format:{size:12,font:'Vazirmatn',spacing:1.95,align:'start'},marks:{signature:null,stamp:null}});
test('pre-migration 009 login and ordinary document operations remain available',async()=>{
 assert.deepEqual((await request('capabilities')).data,{phase3:false});
 assert.equal((await request('documents')).status,200);
 const created=await request('documents','POST',content());
 assert.equal(created.status,200,JSON.stringify(created.data));
 assert.equal(created.data.audience,'all');
 const found=await request('documents/'+created.data.id);
 assert.equal(found.status,200);
 const saved=await request('documents/'+created.data.id,'PATCH',{...content(),title:'Updated legacy letter',version:created.data.version});
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.equal(saved.data.title,'Updated legacy letter');
 assert.equal((await request('documents')).data.length,1);
});
test('pre-migration 009 never silently enables selected-user access',async()=>{
 const restricted=await request('documents','POST',{...content(),audience:'selected',visibleTo:[]});
 assert.equal(restricted.status,503);
 assert.deepEqual((await request('share-targets')).data,[]);
 const reset=await request('users/00000000-0000-4000-8000-000000000001/recovery','POST',{});
 assert.equal(reset.status,503);
});
