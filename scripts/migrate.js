import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {database} from '../server/db.js';
export async function migrate(url){
 const pool=database(url),client=await pool.connect();
 try{
  await client.query("SELECT pg_advisory_lock(4877001)");
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
   const sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
   const old=await client.query('SELECT checksum FROM schema_migrations WHERE version=$1',[name]);
   if(old.rowCount){if(old.rows[0].checksum!==hash)throw Error('Applied migration checksum differs: '+name);continue;}
   await client.query('BEGIN');try{await client.query(sql);await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[name,hash]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}
  }
 }finally{await client.query('SELECT pg_advisory_unlock(4877001)').catch(()=>{});client.release();await pool.end();}
}
export function ownerURL(){
 const url=process.env.MIGRATION_DATABASE_URL;if(!url)throw Error('Set MIGRATION_DATABASE_URL securely');
 const local=['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname);
 if(!local&&!process.argv.includes('--approve-production'))throw Error('Remote database operations require explicit --approve-production and operator approval');
 return url;
}
if(process.argv[1]===fileURLToPath(import.meta.url))migrate(ownerURL()).then(()=>console.log('Migrations applied')).catch(e=>{console.error(e.message);process.exitCode=1;});
