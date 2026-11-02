import pg from 'pg';
let pool;
export function database(url=process.env.DATABASE_URL){
 if(!url)throw new Error('Database is not configured');
 const parsed=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)&&parsed.searchParams.get('sslmode')!=='verify-full')throw new Error('Remote PostgreSQL requires sslmode=verify-full');
 return new pg.Pool({connectionString:url,max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
}
export function getPool(){return pool||=database();}
export async function transaction(fn,actor=null){
 const client=await getPool().connect();
 try{
  const {rows:[role]}=await client.query(`SELECT r.rolsuper,r.rolbypassrls,pg_has_role(current_user,c.relowner,'MEMBER') AS owner FROM pg_roles r JOIN pg_class c ON c.oid='accounts'::regclass WHERE r.rolname=current_user`);
  if(!role||role.rolsuper||role.rolbypassrls||role.owner)throw new Error('Unsafe runtime database role');
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.user_id',$1,true)",[actor||'']);
  const value=await fn(client);await client.query('COMMIT');return value;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
export async function closeDatabase(){if(pool){await pool.end();pool=null;}}
