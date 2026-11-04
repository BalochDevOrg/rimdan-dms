import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import handler from '../server/api.js';
import {database,closeDatabase} from '../server/db.js';

const originalEnv={...process.env},connect=pg.Pool.prototype.connect,originalLog=console.error;
let scenario={},connections=0,logs=[];
const safeRole={rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolreplication:false,owner:false,runtime:true,can_create:false,extra_roles:false};
pg.Pool.prototype.connect=async()=>{
 connections++;
 if(scenario.error)throw scenario.error;
 return {release(){},async query(sql){
  if(sql.includes('SELECT r.rolsuper'))return {rows:[{...safeRole,...scenario.role}],rowCount:1};
  if(sql.includes('session_lookup'))return {rows:scenario.user?[{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',role:scenario.user,csrf:'fixture-csrf'}]:[],rowCount:scenario.user?1:0};
  return {rows:[],rowCount:0};
 }};
};
console.error=value=>logs.push(value);
after(async()=>{await closeDatabase();pg.Pool.prototype.connect=connect;console.error=originalLog;for(const k of Object.keys(process.env))if(!(k in originalEnv))delete process.env[k];Object.assign(process.env,originalEnv);});
async function reset(){
 await closeDatabase();scenario={};connections=0;logs=[];
 for(const key of ['DATABASE_SSL_CA','NODE_TLS_REJECT_UNAUTHORIZED'])delete process.env[key];
 process.env.APP_ORIGIN='https://fixture.example.invalid';process.env.APP_ENV='production';process.env.VERCEL='1';
 process.env.DATABASE_URL='postgresql://runtime:FICTIONAL_PASSWORD@db.example.invalid/postgres?sslmode=verify-full';
}
async function request(path='config',method='GET',body,headers={}){
 const req={url:'/api/v1/'+path,method,headers:{origin:process.env.APP_ORIGIN,'content-type':'application/json',...headers},...(body!==undefined?{body}:{})};
 const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(raw){this.body=JSON.parse(raw);}};
 await handler(req,res);return res;
}
test('missing, invalid and insecure origins are categorized configuration failures before DB access',async()=>{
 for(const origin of [undefined,'invalid origin','http://127.0.0.1:3000','https://user:secret@example.invalid/','https://fixture.example.invalid/path']){
  await reset();if(origin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=origin;
  for(const path of ['config','session']){const r=await request(path);assert.equal(r.statusCode,503);assert.equal(r.body.category,'configuration_origin');assert.equal(JSON.parse(logs.at(-1)).route,path);}
  assert.equal(connections,0);
 }
});
test('config validates missing/invalid database URLs and query options without connecting',async()=>{
 for(const url of [undefined,'not-a-url','https://user:secret@example.invalid/db','postgresql://runtime:secret@db.example.invalid/db?sslmode=require','postgresql://runtime:secret@db.example.invalid/db?sslmode=verify-full&host=localhost']){
  await reset();if(url===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=url;
  const r=await request();assert.equal(r.statusCode,503);assert.equal(r.body.category,'configuration_database');assert.equal(connections,0);
 }
 await reset();const r=await request();assert.equal(r.statusCode,200);assert.deepEqual(r.body,{mode:'server'});assert.equal(connections,0);
});
test('missing CA files and invalid PEM are configuration_certificate, with no path/PEM disclosure',async()=>{
 await reset();process.env.DATABASE_URL+='&sslrootcert=Z%3A%2Fmissing-fixture-certificate.crt';
 let r=await request();assert.equal(r.statusCode,503);assert.equal(r.body.category,'configuration_certificate');
 assert.ok(!JSON.stringify(r.body).includes('missing-fixture'));
 await reset();process.env.DATABASE_SSL_CA='SECRET_INVALID_CERTIFICATE';r=await request();assert.equal(r.body.category,'configuration_certificate');
 assert.ok(!JSON.stringify([...logs,r.body]).includes('SECRET_INVALID_CERTIFICATE'));
});
test('TLS, DB authentication and network failures have safe separate categories',async()=>{
 for(const [code,category] of [['SELF_SIGNED_CERT_IN_CHAIN','database_tls'],['ERR_TLS_CERT_ALTNAME_INVALID','database_tls'],['28P01','database_authentication'],['ECONNREFUSED','database_connection'],['ENOTFOUND','database_connection'],[undefined,'database_connection']]){
  await reset();scenario.error=Object.assign(new Error('SECRET_MESSAGE_WITH_URL_PASSWORD_SQL'),{code});
  const r=await request('session');assert.equal(r.statusCode,503);assert.equal(r.body.category,category);
  assert.ok(!JSON.stringify([...logs,r.body]).includes('SECRET_MESSAGE'));
 }
});
test('unsafe owner/extra role credentials are rejected, with database_role diagnostic',async()=>{
 for(const role of [{owner:true},{extra_roles:true},{runtime:false},{rolbypassrls:true}]){
  await reset();scenario.role=role;const r=await request('session');assert.equal(r.statusCode,503);assert.equal(r.body.category,'database_role');
 }
});
test('database readiness is Administrator-only and exposes only readiness',async()=>{
 await reset();assert.equal((await request('ready')).statusCode,401);
 for(const user of ['employee','manager']){scenario.user=user;assert.equal((await request('ready')).statusCode,403);}
 scenario.user='administrator';const r=await request('ready');assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ready:true});assert.equal(r.headers['cache-control'],'no-store, private');
});
test('JSON shape and MIME validation reject null/scalars/arrays before DB access',async()=>{
 for(const payload of [null,[],true,42,'null','[]','true','42','"text"']){
  await reset();const r=await request('login','POST',payload);assert.equal(r.statusCode,400);assert.equal(connections,0);
 }
 await reset();assert.equal((await request('login','POST',{}, {'content-type':'application/jsonp'})).statusCode,415);
});
test('Origin/CSRF checks remain enforced',async()=>{
 await reset();assert.equal((await request('login','POST',{}, {origin:'https://evil.example.invalid'})).statusCode,403);assert.equal(connections,0);
 scenario.user='manager';assert.equal((await request('documents','POST',{}, {'x-csrf-token':'wrong'})).statusCode,403);
});
test('logs contain only safe fields and correlate errors without sensitive data',async()=>{
 await reset();scenario.error=Object.assign(new Error('FICTIONAL_PASSWORD credential URL SQL document-content'),{code:'unknown-FICTIONAL_PASSWORD'});
 const r=await request('session');assert.equal(r.statusCode,503);assert.equal(r.body.category,'database_connection');
 const log=JSON.parse(logs[0]);assert.deepEqual(Object.keys(log).sort(),['category','code','event','method','requestId','route','stage'].sort());
 assert.equal(log.requestId,r.body.requestId);assert.equal(r.headers['x-request-id'],r.body.requestId);assert.equal(log.route,'session');
 assert.ok(!JSON.stringify([...logs,r.body]).includes('FICTIONAL_PASSWORD'));
});
test('idle pool errors are handled and sanitized without throwing',async()=>{
 await reset();const pool=database();try{
  assert.equal(pool.listenerCount('error'),1);assert.doesNotThrow(()=>pool.emit('error',Object.assign(new Error('SECRET_IDLE_ERROR'),{code:'ECONNRESET'})));
  assert.equal(JSON.parse(logs[0]).stage,'idle_connection');assert.ok(!logs[0].includes('SECRET_IDLE_ERROR'));
 }finally{await pool.end();}
});
