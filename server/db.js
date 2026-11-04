import pg from 'pg';
import {X509Certificate} from 'node:crypto';
import {fault,logFailure,connectionFailure} from './errors.js';
import {readFileSync} from 'node:fs';
import {checkServerIdentity,getCACertificates} from 'node:tls';
let pool;
export function databaseOptions(url=process.env.DATABASE_URL){
 if(!url)throw fault(503,'configuration_database','Database configuration is required');
 let parsed;try{parsed=new URL(url);}catch{throw fault(503,'configuration_database','Invalid PostgreSQL URL');}
 if(!['postgres:','postgresql:'].includes(parsed.protocol))throw fault(503,'configuration_database','Invalid PostgreSQL protocol');
 for(const key of parsed.searchParams.keys()){
  if(!['sslmode','sslrootcert'].includes(key)||parsed.searchParams.getAll(key).length!==1)throw fault(503,'configuration_database','Unsupported or duplicate PostgreSQL URL option');
 }
 const local=['127.0.0.1','localhost','[::1]'].includes(parsed.hostname);
 const mode=parsed.searchParams.get('sslmode');
 if(!local&&mode!=='verify-full')throw fault(503,'configuration_database','Remote PostgreSQL requires sslmode=verify-full');
 if(mode&&!['disable','verify-full'].includes(mode))throw fault(503,'configuration_database','Use sslmode=verify-full (or disable on loopback only)');
 if(!local&&process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw fault(503,'configuration_database','TLS certificate verification must remain enabled');
 const caPath=parsed.searchParams.get('sslrootcert');
 const host=parsed.hostname.replace(/^\[|\]$/g,'');
 if(caPath&&mode!=='verify-full')throw fault(503,'configuration_database','sslrootcert requires sslmode=verify-full');
 let customCA;
 try{
  customCA=caPath?readFileSync(caPath,'utf8'):process.env.DATABASE_SSL_CA;
  if(customCA){
   const certificates=customCA.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)||[];
   if(!certificates.length||customCA.replace(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,'').trim())throw Error('Invalid certificate');
   for(const certificate of certificates)new X509Certificate(certificate);
  }
 }catch{throw fault(503,'configuration_certificate','Database certificate configuration is invalid');}
 if(!host||!parsed.username||!parsed.pathname.slice(1)||parsed.hash)throw fault(503,'configuration_database','Database URL fields are invalid');
 let user,password,dbname;
 try{user=decodeURIComponent(parsed.username);password=decodeURIComponent(parsed.password);dbname=decodeURIComponent(parsed.pathname.slice(1));}
 catch{throw fault(503,'configuration_database','Database URL encoding is invalid');}
 // Explicit fields prevent URL ssl/host/user overrides in pg-connection-string.
 // Never pass connectionString alongside ssl: the URL parser can replace ssl.
 return {host,port:Number(parsed.port||5432),
  user,password,database:dbname,
  // pg omits SNI for IP hosts; bind identity checking to the actual URL host
  // rather than allowing tls.connect's fallback hostname (localhost).
  ssl:mode==='verify-full'?{rejectUnauthorized:true,checkServerIdentity:(_name,cert)=>checkServerIdentity(host,cert),
   // Keep standard trust for publicly signed poolers while adding the project CA.
   ...(customCA?{ca:[...getCACertificates('default'),customCA]}:{})}:false,
  max:process.env.VERCEL==='1'?1:4,idleTimeoutMillis:10000,connectionTimeoutMillis:10000};
}
export function database(url=process.env.DATABASE_URL){
 const value=new pg.Pool(databaseOptions(url));
 value.on('error',error=>logFailure(connectionFailure(error),{route:'pool',stage:'idle_connection',event:'rimdan_pool_failure'}));
 return value;
}
export function getPool(){return pool||=database();}
export async function transaction(fn,actor=null){
 let client;try{client=await getPool().connect();}catch(error){throw connectionFailure(error);}
 try{
  await client.query('BEGIN');
  await client.query('SET LOCAL search_path=pg_catalog,public,pg_temp');
  const {rows:[role]}=await client.query(`SELECT r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
   (EXISTS(SELECT 1 FROM pg_class owned WHERE owned.relnamespace='public'::regnamespace
      AND pg_has_role(current_user,owned.relowner,'MEMBER'))
    OR EXISTS(SELECT 1 FROM pg_proc owned WHERE owned.pronamespace='public'::regnamespace
      AND pg_has_role(current_user,owned.proowner,'MEMBER'))) AS owner,
   pg_has_role(current_user,'rimdan_runtime','USAGE') AS runtime,
   has_schema_privilege(current_user,'public','CREATE') AS can_create,
   EXISTS(SELECT 1 FROM pg_roles parent WHERE parent.rolname NOT IN (current_user,'rimdan_runtime')
     AND pg_has_role(current_user,parent.oid,'MEMBER')) AS extra_roles
   FROM pg_roles r JOIN pg_class c ON c.oid='public.accounts'::regclass WHERE r.rolname=current_user`);
  if(!role||role.rolsuper||role.rolbypassrls||role.rolcreaterole||role.rolcreatedb||role.rolreplication||role.owner||!role.runtime||role.can_create||role.extra_roles)throw fault(503,'database_role','Unsafe runtime database role');
  await client.query("SELECT set_config('app.user_id',$1,true)",[actor||'']);
  const value=await fn(client);await client.query('COMMIT');return value;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
export async function closeDatabase(){if(pool){await pool.end();pool=null;}}
