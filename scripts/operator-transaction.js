import {database} from '../server/db.js';

export async function operatorTransaction(url,operation){
 const pool=database(url);let client,failed=false,cleanup;
 try{
  client=await pool.connect();await client.query('BEGIN');
  const result=await operation(client);await client.query('COMMIT');return result;
 }catch(error){
  failed=true;
  if(client)try{await client.query('ROLLBACK');}catch{/* Preserve the operation error. */}
  throw error;
 }finally{
  try{client?.release();}catch(error){cleanup=error;}
  try{await pool.end();}catch(error){cleanup||=error;}
  if(!failed&&cleanup)throw cleanup;
 }
}
