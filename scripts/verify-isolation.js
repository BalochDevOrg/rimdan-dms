import {fileURLToPath} from 'node:url';
import {database} from '../server/db.js';
import {logFailure} from '../server/errors.js';
import {ownerURL} from './owner-connection.js';
export const tables=['accounts','sessions','invitations','auth_buckets','documents','assets','asset_grants','document_assets','templates','audit_records','schema_migrations','document_recipients','password_resets'];
export const functions=['enforce_administrator()','actor_id()','actor_role()','staff()','admin()','protect_account()','record_changes()','auth_lookup(text)','session_lookup(text)','session_create(uuid,text,text)','session_remove(text)','consume_limit(text,integer)','accept_invitation(text,text)','audit_output(uuid,text)','can_apply_asset(uuid)','delete_document(uuid,integer)','revoke_deactivated_sessions()','can_access_document(uuid,uuid,text,text)','can_manage_document(uuid)','list_share_targets()','issue_password_reset(uuid,text)','redeem_password_reset(text,text)','audit_recipient_change()'];
// Read-only: checks effective privileges (including inherited/PUBLIC grants),
// not just ACL rows. This remains useful even when the Data API is disabled.
export async function verifyIsolation(c,{requireApiRoles=false}={}){
 const roles=(await c.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') ORDER BY rolname")).rows.map(r=>r.rolname);
 if(requireApiRoles&&roles.length!==3)throw Error('All three Supabase API roles are required');
 const unsafeRuntime=await c.query(`SELECT 1 FROM pg_roles WHERE rolname='rimdan_runtime'
  AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid))`);
 if(unsafeRuntime.rowCount)throw Error('Unsafe rimdan_runtime role');
 const denied=[...roles,'rimdan_runtime'];
 // Expand ACLs instead of naming MAINTAIN: also works on PostgreSQL 16,
 // where that privilege does not exist. Preserve explicit runtime table grants.
 const ledger=await c.query(`SELECT 1 FROM pg_class c
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='public.schema_migrations'::regclass
   AND CASE WHEN a.grantee=0 THEN true ELSE pg_has_role('rimdan_runtime',a.grantee,'USAGE') END`);
 if(ledger.rowCount)throw Error('rimdan_runtime has migration ledger ACL privileges');
 for(const role of denied){
  if((await c.query("SELECT has_schema_privilege($1,'public','CREATE') AS allowed",[role])).rows[0].allowed)throw Error(role+' can create public objects');
  for(const table of role==='rimdan_runtime'?['schema_migrations']:tables){
   const result=await c.query(`SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') AS allowed`,[role,'public.'+table]);
   if(result.rows[0].allowed)throw Error(role+' has access to '+table);
  }
  if(role!=='rimdan_runtime'){
   for(const fn of functions)if((await c.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,'public.'+fn])).rows[0].allowed)throw Error(role+' can execute '+fn);
  }
  for(const {name} of (await c.query(`SELECT DISTINCT s.oid::regclass::text AS name FROM pg_class s
   JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass
   JOIN pg_class t ON t.oid=d.refobjid
   WHERE s.relkind='S' AND t.oid=ANY($1::regclass[]) AND d.deptype IN ('a','i')`,[tables.map(t=>'public.'+t)])).rows){
   if((await c.query("SELECT has_sequence_privilege($1,$2,'USAGE,SELECT,UPDATE') AS allowed",[role,name])).rows[0].allowed)throw Error(role+' has sequence access');
  }
 }
 const rls=await c.query('SELECT relname FROM pg_class WHERE oid=ANY($1::regclass[]) AND NOT relrowsecurity',[tables.map(t=>'public.'+t)]);
 if(rls.rowCount)throw Error('Application RLS is disabled');
 const paths=await c.query(`SELECT oid::regprocedure FROM pg_proc WHERE oid=ANY($1::regprocedure[])
  AND (NOT coalesce(proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'],false)
    OR proowner<>(SELECT relowner FROM pg_class WHERE oid='public.accounts'::regclass))`,[functions.map(f=>'public.'+f)]);
 if(paths.rowCount)throw Error('Unsafe function ownership or search_path');
 // PUBLIC's effective rights apply even on PostgreSQL without Supabase roles.
 const publicGrants=await c.query(`SELECT 1 FROM (
  SELECT relacl AS acl,relowner AS owner,CASE WHEN relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END AS kind FROM pg_class
   WHERE oid=ANY($1::regclass[]) OR oid=pg_get_serial_sequence('public.audit_records','id')::regclass
  UNION ALL SELECT a.attacl,c.relowner,'c'::"char" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
   WHERE a.attrelid=ANY($1::regclass[]) AND a.attacl IS NOT NULL
  UNION ALL SELECT proacl,proowner,'f'::"char" FROM pg_proc WHERE oid=ANY($2::regprocedure[])
 ) objects CROSS JOIN LATERAL aclexplode(coalesce(acl,acldefault(kind,owner))) a
 WHERE a.grantee=0 OR EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=ANY($3::text[])
   AND pg_has_role(r.oid,a.grantee,'USAGE'))`,[tables.map(t=>'public.'+t),functions.map(f=>'public.'+f),roles]);
 // Catalog expansion also covers version-specific privileges such as MAINTAIN.
 if(publicGrants.rowCount)throw Error('PUBLIC/API roles retain application ACL privileges');
 const defaults=await c.query(`WITH owner AS (SELECT relowner AS id FROM pg_class WHERE oid='public.accounts'::regclass),
  kinds(kind) AS (VALUES ('r'::"char"),('S'::"char"),('f'::"char")), grants AS (
   SELECT a.* FROM owner CROSS JOIN kinds
    LEFT JOIN pg_default_acl d ON d.defaclrole=owner.id AND d.defaclnamespace=0 AND d.defaclobjtype=kinds.kind
    CROSS JOIN LATERAL aclexplode(coalesce(d.defaclacl,acldefault(kinds.kind,owner.id))) a
   UNION ALL SELECT a.* FROM owner JOIN pg_default_acl d ON d.defaclrole=owner.id
    AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype IN ('r','S','f')
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  ) SELECT 1 FROM grants WHERE grantee=0 OR EXISTS
   (SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[]) AND pg_has_role(oid,grantee,'USAGE'))`,[denied]);
 if(defaults.rowCount)throw Error('Unsafe owner default privileges');
 return {apiRoles:roles,tables:tables.length,functions:functions.length};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 let pool;try{pool=database(ownerURL());const result=await verifyIsolation(pool,{requireApiRoles:process.argv.includes('--require-api-roles')});console.log('Isolation verified:',JSON.stringify(result));}
 catch(e){logFailure(e,{stage:'isolation_check'});process.exitCode=1;}finally{await pool?.end();}
}
