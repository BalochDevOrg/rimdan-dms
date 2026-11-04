import {fileURLToPath} from 'node:url';
import {operatorTransaction} from './operator-transaction.js';
import {logFailure} from '../server/errors.js';
import {hashPassword} from '../server/auth.js';
import {ownerURL} from './owner-connection.js';
import {verifyIsolation} from './verify-isolation.js';
export async function bootstrap(url,email,password){
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email))throw Error('Valid bootstrap email required');
 const hash=await hashPassword(password);
 return operatorTransaction(url,async c=>{await c.query('SET LOCAL search_path=pg_catalog,public,pg_temp');
  const ready=await c.query("SELECT 1 FROM public.schema_migrations WHERE version='008_supabase_isolation.sql'");
  if(!ready.rowCount)throw Error('Apply all security migrations before bootstrap');
  await verifyIsolation(c);
  await c.query('LOCK TABLE accounts IN EXCLUSIVE MODE');
  if((await c.query('SELECT 1 FROM accounts LIMIT 1')).rowCount)throw Error('Bootstrap refuses a non-empty accounts table');
  await c.query("INSERT INTO accounts(email,password_hash,role,active) VALUES($1,$2,'administrator',true)",[email.toLowerCase(),hash]);
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url))bootstrap(ownerURL(),process.env.BOOTSTRAP_ADMIN_EMAIL,process.env.BOOTSTRAP_ADMIN_PASSWORD).then(()=>console.log('Initial administrator initialized')).catch(e=>{logFailure(e,{stage:'bootstrap'});process.exitCode=1;});
