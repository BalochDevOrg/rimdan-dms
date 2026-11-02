import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {database} from '../server/db.js';
import {verifyIsolation} from './verify-isolation.js';
import {ownerURL} from './owner-connection.js';
export {ownerURL} from './owner-connection.js';
export async function migrate(url){
 const files=await Promise.all((await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort().map(async name=>{
  const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
  return {name,sql,hash:createHash('sha256').update(sql).digest('hex')};
 }));
 const pool=database(url),client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(4877001)");
  // Legacy migrations create unqualified objects: public must be the creation
  // schema. Runtime/definer paths put pg_catalog first and never create objects.
  await client.query('SET LOCAL search_path=public,pg_catalog,pg_temp');
  await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query('LOCK TABLE public.schema_migrations IN ACCESS EXCLUSIVE MODE');
  const applied=(await client.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
  // Applied history must be an exact prefix, including checksums, before any SQL.
  for(let i=0;i<applied.length;i++){
   if(applied[i].version!==files[i]?.name)throw Error('Unknown or out-of-order applied migration: '+applied[i].version);
   if(applied[i].checksum!==files[i].hash)throw Error('Applied migration checksum differs: '+files[i].name);
  }
  for(const {name,sql,hash} of files.slice(applied.length)){
   await client.query(sql);await client.query('INSERT INTO public.schema_migrations(version,checksum) VALUES($1,$2)',[name,hash]);
  }
  await verifyIsolation(client);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
 finally{client.release();await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))migrate(ownerURL()).then(()=>console.log('Migrations applied')).catch(e=>{console.error(e.message);process.exitCode=1;});
