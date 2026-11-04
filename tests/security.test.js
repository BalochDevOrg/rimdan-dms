import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
import {migrate} from '../scripts/migrate.js';
import {bootstrap} from '../scripts/bootstrap-admin.js';
import {verifyIsolation,functions,tables} from '../scripts/verify-isolation.js';
import {databaseOptions,database} from '../server/db.js';

const base=process.env.TEST_DATABASE_URL;
if(!base||!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw Error('Disposable local TEST_DATABASE_URL required');
const apiRoles=['anon','authenticated','service_role'];
let root;const databases=[];const migrationRole='rimdan_migrator_'+randomBytes(6).toString('hex');
before(async()=>{
 root=new pg.Client({connectionString:base});await root.connect();
 for(const role of apiRoles)await root.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
 await root.query('ALTER ROLE service_role BYPASSRLS');
 await root.query(`CREATE ROLE ${migrationRole} LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS`);
});
after(async()=>{for(const name of databases)await root.query(`DROP DATABASE ${name} WITH(FORCE)`);await root.query(`DROP ROLE ${migrationRole}`);await root?.end();});
async function fixture(asRestrictedOwner=false){
 const name='rimdan_security_'+randomBytes(6).toString('hex');databases.push(name);await root.query(`CREATE DATABASE ${name}${asRestrictedOwner?' OWNER '+migrationRole:''}`);
 const url=new URL(base);url.pathname='/'+name;if(asRestrictedOwner){url.username=migrationRole;url.password='';}
 const c=new pg.Client({connectionString:url.href});await c.connect();
 // Reproduce explicit Supabase grants AND PostgreSQL's implicit PUBLIC execute.
 await c.query(`GRANT USAGE,CREATE ON SCHEMA public TO anon,authenticated,service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;`);
 return {url:url.href,c};
}
async function denied(c,role,sql){
 await c.query('BEGIN');try{await c.query(`SET LOCAL ROLE ${role}`);await assert.rejects(()=>c.query(sql),e=>e.code==='42501',role+': '+sql);}finally{await c.query('ROLLBACK');}
}
async function exercise(c){
 assert.equal((await verifyIsolation(c,{requireApiRoles:true})).apiRoles.length,3);
 for(const role of apiRoles){
  for(const sql of ["SELECT * FROM public.auth_lookup('nobody@test.invalid')","SELECT * FROM public.session_lookup('test')",
   "SELECT public.session_create(gen_random_uuid(),'test','test')","SELECT public.session_remove('test')",
   "SELECT public.consume_limit('test',100)","SELECT public.accept_invitation('test','hash')",
   'SELECT * FROM public.schema_migrations',"INSERT INTO public.schema_migrations VALUES('forged','x',now())",
   "UPDATE public.schema_migrations SET checksum='forged'",'DELETE FROM public.schema_migrations',
   'TRUNCATE public.schema_migrations','SELECT email FROM public.accounts',
   "SELECT nextval('public.audit_records_id_seq')"])await denied(c,role,sql);
 }
 await denied(c,'rimdan_runtime','SELECT * FROM public.schema_migrations');
 await denied(c,'rimdan_runtime',"UPDATE public.schema_migrations SET checksum='forged'");
 await c.query(`CREATE TABLE public.future_probe(id bigint GENERATED ALWAYS AS IDENTITY);
  CREATE FUNCTION public.future_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';`);
 for(const role of [...apiRoles,'rimdan_runtime']){
  for(const sql of ['SELECT * FROM public.future_probe','SELECT public.future_probe()',"SELECT nextval('public.future_probe_id_seq')"])await denied(c,role,sql);
 }
 await c.query('DROP TABLE public.future_probe; DROP FUNCTION public.future_probe()');
}
test('fresh install commits eight migrations with Supabase-style default grants; rerun is idempotent',async()=>{
 const {url,c}=await fixture();try{await migrate(url);await migrate(url);assert.equal((await c.query('SELECT * FROM public.schema_migrations')).rowCount,8);await exercise(c);}finally{await c.end();}
});
test('operator CLI entrypoints migrate, verify isolation and bootstrap locally',async()=>{
 const {url,c}=await fixture();try{
  const env={...process.env,MIGRATION_DATABASE_URL:url,BOOTSTRAP_ADMIN_EMAIL:'cli@test.invalid',BOOTSTRAP_ADMIN_PASSWORD:'Fictional-Test-Password-2026'};
  for(const [script,args,expected] of [['migrate.js',[],/Migrations applied/],['verify-isolation.js',['--require-api-roles'],/Isolation verified/],['bootstrap-admin.js',[],/Initial administrator initialized/]]){
   const result=spawnSync(process.execPath,['scripts/'+script,...args],{encoding:'utf8',env,timeout:20000});
   assert.equal(result.status,0,result.stderr);assert.match(result.stdout,expected);
  }
  assert.equal((await c.query("SELECT count(*)::int n FROM public.accounts WHERE role='administrator' AND active")).rows[0].n,1);
 }finally{await c.end();}
});
test('migrations require ownership but do not require a superuser or BYPASSRLS owner',async()=>{
 const {url,c}=await fixture(true);try{
  await migrate(url);await migrate(url);await verifyIsolation(c,{requireApiRoles:true});
  assert.equal((await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper,false);
 }finally{await c.end();}
});
test('seven-migration vulnerable upgrade retains original checksums and data, removes column grants',async()=>{
 const {url,c}=await fixture();try{
  await c.query('CREATE TABLE public.schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>/^00[1-7]_.*\.sql$/.test(n)).sort()){
   const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');await c.query(sql);
   await c.query('INSERT INTO public.schema_migrations(version,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);
  }
  const old=(await c.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
  // Confirm this fixture reproduces the audit before attempting remediation.
  assert.equal((await c.query("SELECT has_function_privilege('anon','public.auth_lookup(text)','EXECUTE') AS allowed")).rows[0].allowed,true);
  assert.equal((await c.query("SELECT has_table_privilege('service_role','public.schema_migrations','UPDATE') AS allowed")).rows[0].allowed,true);
  await assert.rejects(()=>bootstrap(url,'blocked@test.invalid','Fictional-Test-Password-2026'),/Apply all security migrations/);
  await c.query("INSERT INTO public.accounts(email,password_hash,role,active) VALUES('fixture@test.invalid','fixture-hash','administrator',true)");
  await c.query('GRANT SELECT(email) ON public.accounts TO anon; GRANT UPDATE(checksum) ON public.schema_migrations TO service_role');
  await migrate(url);assert.deepEqual((await c.query("SELECT version,checksum FROM public.schema_migrations WHERE version< '008' ORDER BY version")).rows,old);
  assert.equal((await c.query('SELECT email FROM public.accounts')).rows[0].email,'fixture@test.invalid');await exercise(c);
 }finally{await c.end();}
});
test('checksum drift and unknown history fail closed; concurrent migration runners serialize',async()=>{
 const {url,c}=await fixture();try{
  await Promise.all([migrate(url),migrate(url)]);
  await c.query("UPDATE public.schema_migrations SET checksum='tampered' WHERE version='001_initial.sql'");
  await assert.rejects(()=>migrate(url),/checksum differs/);
  assert.equal((await c.query("SELECT checksum FROM public.schema_migrations WHERE version='001_initial.sql'")).rows[0].checksum,'tampered');
  await c.query('DELETE FROM public.schema_migrations');await c.query("INSERT INTO public.schema_migrations(version,checksum) VALUES('999_unknown.sql','unknown')");
  await assert.rejects(()=>migrate(url),/Unknown or out-of-order/);
 }finally{await c.end();}
});
test('unsafe API membership aborts fresh installation atomically',async()=>{
 const {url,c}=await fixture();try{
  // rimdan_runtime was created by the earlier tests; memberships are cluster-wide.
  await root.query('GRANT rimdan_runtime TO anon');
  try{await assert.rejects(()=>migrate(url),/Unsafe API role membership/);}finally{await root.query('REVOKE rimdan_runtime FROM anon');}
  assert.equal((await c.query("SELECT to_regclass('public.accounts') AS table_name")).rows[0].table_name,null);
  assert.equal((await c.query("SELECT to_regclass('public.schema_migrations') AS table_name")).rows[0].table_name,null);
  await migrate(url);await verifyIsolation(c,{requireApiRoles:true});
 }finally{await c.end();}
});
test('isolation verifier detects regressions in ACLs, function paths and defaults',async()=>{
 const {url,c}=await fixture();try{await migrate(url);
  const regressions=['GRANT EXECUTE ON FUNCTION public.auth_lookup(text) TO anon',
   'GRANT SELECT(checksum) ON public.schema_migrations TO authenticated',
   'ALTER FUNCTION public.actor_role() SET search_path=public',
   'ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC',
   'GRANT SELECT(email) ON public.accounts TO PUBLIC',
   'GRANT USAGE ON SEQUENCE public.audit_records_id_seq TO PUBLIC',
   'ALTER ROLE rimdan_runtime BYPASSRLS',
   'GRANT USAGE ON SEQUENCE public.audit_records_id_seq TO rimdan_runtime'];
  if(Number((await c.query('SHOW server_version_num')).rows[0].server_version_num)>=170000)regressions.push('GRANT MAINTAIN ON public.schema_migrations TO service_role','GRANT MAINTAIN ON public.schema_migrations TO rimdan_runtime');
  for(const sql of regressions){
   await c.query('BEGIN');try{await c.query(sql);await assert.rejects(()=>verifyIsolation(c,{requireApiRoles:true}));}finally{await c.query('ROLLBACK');}
  }
 }finally{await c.end();}
});
test('TLS configuration verifies certificates and hostnames and rejects URL overrides',()=>{
 const url='postgresql://rimdan_app.project:encoded%40password@pooler.example.invalid:6543/postgres?sslmode=verify-full';
 const config=databaseOptions(url);assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(typeof config.ssl.checkServerIdentity,'function');assert.equal(config.connectionString,undefined);assert.equal(config.password,'encoded@password');
 for(const suffix of ['&ssl=no-verify','&sslmode=disable','&host=localhost','&uselibpqcompat=true'])assert.throws(()=>databaseOptions(url+suffix),/Unsupported or duplicate/);
 for(const mode of ['disable','require','verify-ca','no-verify'])assert.throws(()=>databaseOptions(url.replace('verify-full',mode)),/requires sslmode=verify-full/);
 assert.equal(databaseOptions('postgresql://postgres@127.0.0.1:55439/postgres').ssl,false);
 const old=process.env.NODE_TLS_REJECT_UNAUTHORIZED;process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
 try{assert.throws(()=>databaseOptions(url),/verification must remain/);}finally{if(old===undefined)delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;else process.env.NODE_TLS_REJECT_UNAUTHORIZED=old;}
});
test('local TLS handshake accepts trusted CA and rejects untrusted CA and wrong hostname',
 {skip:!process.env.TEST_TLS_CA},async()=>{
 const trusted=new URL(base);trusted.hostname='localhost';trusted.search='';
 trusted.searchParams.set('sslmode','verify-full');trusted.searchParams.set('sslrootcert',process.env.TEST_TLS_CA);
 const good=database(trusted.href);
 try{assert.equal((await good.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);}finally{await good.end();}
 const untrusted=new URL(trusted);untrusted.searchParams.delete('sslrootcert');
 const old=process.env.DATABASE_SSL_CA;delete process.env.DATABASE_SSL_CA;
 const badCA=database(untrusted.href);
 try{await assert.rejects(()=>badCA.query('SELECT 1'),e=>['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(e.code));}
 finally{await badCA.end();if(old!==undefined)process.env.DATABASE_SSL_CA=old;}
 const mismatch=new URL(trusted);mismatch.hostname='127.0.0.1';const badName=database(mismatch.href);
 try{await assert.rejects(()=>badName.query('SELECT 1'),e=>e.code==='ERR_TLS_CERT_ALTNAME_INVALID');}finally{await badName.end();}
});
