import {transaction,databaseOptions} from './db.js';
import {logFailure,requestId,fault} from './errors.js';
import {token,digest,hashPassword,verifyPassword,passwordValid,configuration,cookie,readCookie,constantEqual} from './auth.js';
import {fail,uuid,text,validateDocument,verifyAssets,linkAssets,normalizeAsset,wire} from './documents.js';
const accountColumns='id,email,role,active,created_at,has_password';
function audienceOf(value,fallback='all'){const v=value===undefined?fallback:value;if(!['all','selected'].includes(v))fail(400,'Invalid audience');return v;}
async function share(c,id,mode,ids,actor){
 const list=mode==='all'?[]:ids;
 if(!Array.isArray(list)||list.length>100||list.some(x=>!uuid(x))||new Set(list).size!==list.length)fail(400,'Invalid recipients');
 if(list.length&&(await c.query('SELECT id FROM list_share_targets() WHERE id=ANY($1::uuid[])',[list])).rowCount!==list.length)fail(400,'Recipient unavailable');
 await c.query('DELETE FROM document_recipients WHERE document_id=$1 AND NOT(account_id=ANY($2::uuid[]))',[id,list]);
 for(const account of list)await c.query('INSERT INTO document_recipients(document_id,account_id,granted_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,account,actor]);
}
async function phase3Enabled(c){
 const {rows:[r]}=await c.query("SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.documents'::regclass AND attname='audience' AND NOT attisdropped) AS enabled");
 return r.enabled;
}
async function sharedWire(c,d){
 const audience=d.audience||'all';
 const visibleTo=audience==='selected'?(await c.query('SELECT account_id FROM document_recipients WHERE document_id=$1 ORDER BY account_id',[d.id])).rows.map(r=>r.account_id):[];
 return {...wire(d),audience,visibleTo};
}
function phase3Required(){throw fault(503,'feature_unavailable','Document sharing and account recovery require Phase 3 database migration');}

const staff=user=>{if(!['administrator','manager'].includes(user.role))fail(403,'Read-only account');};
const admin=user=>{if(user.role!=='administrator')fail(403,'Administrator required');};
async function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))fail(415,'JSON required');
 let raw;
 if(req.body!==undefined)raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
 else{
  let length=0,parts=[];for await(const chunk of req){length+=chunk.length;if(length>4*1024*1024)fail(413,'Request too large');parts.push(chunk);}
  raw=Buffer.concat(parts).toString()||'{}';
 }
 if(typeof raw!=='string')fail(400,'JSON object required');
 if(Buffer.byteLength(raw)>4*1024*1024)fail(413,'Request too large');
 let value;try{value=JSON.parse(raw);}catch{fail(400,'Invalid JSON');}
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'JSON object required');
 return value;
}
function send(res,status,value){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}
async function limit(c,req,key,max){
 const ip=process.env.VERCEL==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0]:req.socket?.remoteAddress||'local';
 for(const [bucket,cap] of [[digest('ip:'+ip),100],[digest(key),max]]){
  const {rows:[row]}=await c.query('SELECT consume_limit($1,$2) AS allowed',[bucket,cap]);if(!row.allowed)fail(429,'Too many attempts; retry in 15 minutes');
 }
}
export default async function handler(req,res){
 const id=requestId();let stage='configuration',route='unknown';
 res.setHeader('X-Request-ID',id);
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie');
 try{
  const url=new URL(req.url,'https://request.invalid');
  const path=String(req.query?.path||url.searchParams.get('path')||url.pathname.replace(/^\/api\/v1\/?/,''));
  const parts=path.split('/').filter(Boolean),method=req.method;
  route=['config','login','session','logout','ready','documents','assets','templates','users','invitations','audit','summary','share-targets','password-reset','capabilities'].includes(parts[0])?parts[0]:'unknown';
  const config=configuration();
  if(path==='config'&&method==='GET'){databaseOptions();return send(res,200,{mode:'server'});}
  stage='request_validation';
  const mutation=!['GET','HEAD'].includes(method);
  if(mutation&&req.headers.origin!==config.origin)fail(403,'Origin rejected');
  const payload=mutation?await body(req):{};
  if(path==='login'&&method==='POST'){
   const email=text(payload.email,254).toLowerCase();if(typeof payload.password!=='string'||payload.password.length>128)fail(400,'Invalid credentials');
   // Rate-limit writes must commit even for failed password attempts.
   stage='login_rate_limit';await transaction(c=>limit(c,req,'login:'+email,20));
   stage='login_lookup';const account=await transaction(async c=>(await c.query('SELECT * FROM auth_lookup($1)',[email])).rows[0]);
   stage='password_verify';if(!await verifyPassword(payload.password,account?.password_hash)||!account?.active)fail(401,'Invalid email or password');
   stage='session_create';const value=token(),csrf=token();await transaction(c=>c.query('SELECT session_create($1,$2,$3)',[account.id,digest(value),csrf]));
   res.setHeader('Set-Cookie',cookie(value));return send(res,200,{ok:true});
  }
  if(path==='invitations/accept'&&method==='POST'){
   await transaction(c=>limit(c,req,'invitation:'+digest(String(payload.token||'')),20));
   if(typeof payload.token!=='string'||payload.token.length>100||!passwordValid(payload.password))fail(400,'Invalid invitation or password');
   const hash=await hashPassword(payload.password);
   const {rows:[row]}=await transaction(c=>c.query('SELECT accept_invitation($1,$2) AS id',[digest(payload.token),hash]));
   if(!row.id)fail(400,'Invitation invalid, expired or already used');return send(res,200,{ok:true});
  }
  if(path==='password-reset/accept'&&method==='POST'){
   stage='password_reset';const secret=typeof payload.token==='string'?payload.token:'';
   await transaction(c=>limit(c,req,'reset:'+digest(secret),12));
   if(secret.length<20||secret.length>100||!passwordValid(payload.password))fail(400,'Invalid or expired recovery link');
   const hash=await hashPassword(payload.password);
   const {rows:[r]}=await transaction(c=>c.query('SELECT redeem_password_reset($1,$2) AS ok',[digest(secret),hash]));
   if(!r.ok)fail(400,'Invalid or expired recovery link');
   return send(res,200,{ok:true});
  }
  if(path==='password-reset/request'&&method==='POST'){
   stage='password_reset_request';const address=text(payload.email||'',254).trim().toLowerCase();
   await transaction(c=>limit(c,req,'reset-request:'+digest(address),8));
   return send(res,200,{message:'Contact your company Administrator for a secure recovery link.'});
  }
  stage='session_lookup';const sessionToken=readCookie(req);
  const user=await transaction(async c=>(await c.query('SELECT * FROM session_lookup($1)',[digest(sessionToken)])).rows[0]);
  if(!user)fail(401,'Authentication required');
  if(mutation&&!constantEqual(req.headers['x-csrf-token'],user.csrf))fail(403,'CSRF token rejected');
  if(path==='session'&&method==='GET')return send(res,200,{user:{id:user.id,email:user.email,role:user.role},csrf:user.csrf});
  if(path==='logout'&&method==='POST'){await transaction(c=>c.query('SELECT session_remove($1)',[digest(sessionToken)]));res.setHeader('Set-Cookie',cookie('',true));return send(res,200,{ok:true});}
  stage='resource';
  const result=await transaction(async c=>{
   if(path==='ready'&&method==='GET'){admin(user);await c.query('SELECT 1');return {ready:true};}
   if(path==='capabilities'&&method==='GET')return {phase3:await phase3Enabled(c)};
    if(path==='share-targets'&&method==='GET'){staff(user);return await phase3Enabled(c)?(await c.query('SELECT * FROM list_share_targets()')).rows:[];}
   if(path==='summary'&&method==='GET')return (await c.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='draft')::int AS draft,count(*) FILTER(WHERE status='finalized')::int AS finalized,count(*) FILTER(WHERE status='archived')::int AS archived FROM documents")).rows[0];
   if(parts[0]==='users'){
    admin(user);
    if(parts.length===1&&method==='GET')return (await c.query(`SELECT ${accountColumns},EXISTS(SELECT 1 FROM invitations i WHERE i.account_id=accounts.id AND i.used_at IS NULL) AS pending FROM accounts ORDER BY created_at`)).rows;
    if(parts.length===1&&method==='POST'){
     const email=text(payload.email,254).trim().toLowerCase(),role=payload.role;
     if(!/^\S+@\S+\.\S+$/.test(email)||!['manager','employee'].includes(role))fail(400,'Invalid email or role');
     const hash=payload.password?await hashPassword(payload.password):null;
     const {rows:[account]}=await c.query(`INSERT INTO accounts(email,password_hash,role,active) VALUES($1,$2,$3,$4) RETURNING ${accountColumns}`,[email,hash,role,!!hash]);
     if(hash)return {account};
     const secret=token();await c.query("INSERT INTO invitations(account_id,token_hash,expires_at,created_by) VALUES($1,$2,now()+interval '24 hours',$3)",[account.id,digest(secret),user.id]);
     return {account,invitationURL:config.origin+'/#invite='+secret};
    }
    if(parts.length===2&&uuid(parts[1])&&method==='PATCH'){
     if(parts[1]===user.id)fail(403,'Cannot modify your own role or activity');
     const {rows:[old]}=await c.query('SELECT role,active FROM accounts WHERE id=$1',[parts[1]]);if(!old||old.role==='administrator')fail(404,'Account unavailable');
     if(payload.role===undefined&&payload.active===undefined)fail(400,'Account change required');
     const role=payload.role??old.role,active=payload.active??old.active;
     if(!['manager','employee'].includes(role)||typeof active!=='boolean')fail(400,'Invalid role or activity');
     if(payload.active===true&&(await c.query('SELECT 1 FROM invitations WHERE account_id=$1 AND used_at IS NULL',[parts[1]])).rowCount)fail(400,'Pending invitation must be accepted');
     const {rows:[row]}=await c.query(`UPDATE accounts SET role=$1,active=$2 WHERE id=$3 AND role<>'administrator' RETURNING ${accountColumns}`,[role,active,parts[1]]);
     if(payload.active===false)await c.query('UPDATE invitations SET used_at=now() WHERE account_id=$1 AND used_at IS NULL',[parts[1]]);
     if(!row)fail(404,'Account unavailable');return row;
    }
    if(parts.length===3&&uuid(parts[1])&&parts[2]==='recovery'&&method==='POST'){
      if(!await phase3Enabled(c))phase3Required();
      const secret=token(),r=await c.query('SELECT issue_password_reset($1,$2) AS ok',[parts[1],digest(secret)]);
      if(!r.rows[0].ok)fail(404,'Active account unavailable');
      return {recoveryURL:config.origin+'/#reset='+secret,delivery:'manual',expiresMinutes:30};
     }
     if(parts.length===3&&uuid(parts[1])&&parts[2]==='invitation'&&method==='POST'){
     const target=(await c.query("SELECT id FROM accounts WHERE id=$1 AND NOT active AND role<>'administrator'",[parts[1]])).rows[0];if(!target)fail(400,'Inactive non-administrator account required');
     await c.query('UPDATE invitations SET used_at=now() WHERE account_id=$1 AND used_at IS NULL',[parts[1]]);
     const secret=token();await c.query("INSERT INTO invitations(account_id,token_hash,expires_at,created_by) VALUES($1,$2,now()+interval '24 hours',$3)",[parts[1],digest(secret),user.id]);return {invitationURL:config.origin+'/#invite='+secret};
    }
   }
   if(parts[0]==='audit'&&method==='GET'){admin(user);return (await c.query('SELECT * FROM audit_records ORDER BY id DESC LIMIT 500')).rows;}
   if(parts[0]==='assets'){
    staff(user);
    if(parts.length===1&&method==='POST'){
     const a=await normalizeAsset(payload);const {rows:[row]}=await c.query('INSERT INTO assets(owner_id,kind,mime,bytes,width,height) VALUES($1,$2,\'image/png\',$3,$4,$5) RETURNING id,kind,width,height',[user.id,a.kind,a.bytes,a.width,a.height]);return row;
    }
    if(uuid(parts[1])&&parts.length===3&&parts[2]==='grants'&&['POST','DELETE'].includes(method)){
     admin(user);if(!uuid(payload.accountId))fail(400,'Invalid account');if(method==='DELETE'){await c.query('DELETE FROM asset_grants WHERE asset_id=$1 AND account_id=$2',[parts[1],payload.accountId]);return {ok:true};}await c.query('INSERT INTO asset_grants(asset_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[parts[1],payload.accountId]);return {ok:true};
    }
    if(uuid(parts[1])&&parts.length===2&&method==='GET'){
     const {rows:[a]}=await c.query('SELECT * FROM assets a WHERE id=$1 AND (admin() OR owner_id=$2 OR EXISTS(SELECT 1 FROM asset_grants g WHERE g.asset_id=a.id AND g.account_id=$2))',[parts[1],user.id]);if(!a)fail(404,'Asset unavailable');return {binary:a.bytes};
    }
    if(uuid(parts[1])&&parts.length===2&&method==='DELETE'){
     const {rowCount}=await c.query('DELETE FROM assets WHERE id=$1 RETURNING id',[parts[1]]);if(!rowCount)fail(404,'Asset unavailable');return {ok:true};
    }
   }
   if(parts[0]==='templates'){
    staff(user);
    if(parts.length===1&&method==='GET')return (await c.query('SELECT * FROM templates ORDER BY key')).rows;
    if((method==='POST'&&parts.length===1)||(method==='PATCH'&&uuid(parts[1])&&parts.length===2)){
     const values=[text(payload.key,80),text(payload.name_fa,200),text(payload.name_en,200),text(payload.body_fa,200000),text(payload.body_en,200000)];
     if(!/^[a-z0-9-]+$/.test(values[0]))fail(400,'Invalid template key');
     if(method==='POST')return (await c.query('INSERT INTO templates(key,name_fa,name_en,body_fa,body_en) VALUES($1,$2,$3,$4,$5) RETURNING *',values)).rows[0];
     const {rows:[row]}=await c.query('UPDATE templates SET key=$1,name_fa=$2,name_en=$3,body_fa=$4,body_en=$5,version=version+1,updated_at=now() WHERE id=$6 AND version=$7 RETURNING *',[...values,parts[1],payload.version]);if(!row)fail(409,'Template version conflict');return row;
    }
    if(method==='DELETE'&&uuid(parts[1])){const {rowCount}=await c.query('DELETE FROM templates WHERE id=$1 AND version=$2',[parts[1],payload.version]);if(!rowCount)fail(409,'Template version conflict');return {ok:true};}
   }
   if(parts[0]==='documents'){
    const hasPhase3=await phase3Enabled(c);
    if(parts.length===1&&method==='GET'){
     const q=text(url.searchParams.get('q')||'',200);
     const offset=Number(url.searchParams.get('offset')||0),status=url.searchParams.get('status')||'',type=url.searchParams.get('type')||'';
     if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!['','draft','finalized','archived'].includes(status)||!['','letter','invoice','receipt','delivery','transaction','custom'].includes(type))fail(400,'Invalid search filters');
     const hasPhase3=await phase3Enabled(c);
     const columns='id,title,number,recipient,type,language,status,'+(hasPhase3?'audience':'\'all\'::text AS audience')+',version,updated_at,created_by,import_key';
     const rows=(await c.query("SELECT "+columns+" FROM documents WHERE (title ILIKE '%'||$1||'%' OR number ILIKE '%'||$1||'%' OR recipient ILIKE '%'||$1||'%') AND ($2='' OR status=$2) AND ($3='' OR type=$3) ORDER BY updated_at DESC,id LIMIT 1000 OFFSET $4",[q,status,type,offset])).rows;
     return rows.map(r=>({...r,updated:r.updated_at,importKey:r.import_key}));
    }
    const id=parts[1];if(id&&!uuid(id))fail(404,'Document unavailable');
    if(parts.length===4&&parts[2]==='assets'&&uuid(parts[3])&&method==='GET'){
     const {rows:[asset]}=await c.query('SELECT a.bytes FROM documents d JOIN document_assets l ON l.document_id=d.id JOIN assets a ON a.id=l.asset_id WHERE d.id=$1 AND a.id=$2',[id,parts[3]]);if(!asset)fail(404,'Asset unavailable');return {binary:asset.bytes};
    }
    if(parts.length===2&&method==='GET'){const {rows:[d]}=await c.query('SELECT * FROM documents WHERE id=$1',[id]);if(!d)fail(404,'Document unavailable');return sharedWire(c,d);}
    staff(user);
    if(parts.length===3&&['print','export'].includes(parts[2])&&method==='POST'){
     const {rows:[d]}=await c.query('SELECT * FROM documents WHERE id=$1 FOR SHARE',[id]);if(!d)fail(404,'Document unavailable');
     if(!Number.isSafeInteger(payload.version)||payload.version!==d.version)fail(409,'Document changed; reopen before printing or exporting');
     // Audit insertion is a narrow definer function, never a general table grant.
     await c.query('SELECT audit_output($1,$2)',[id,parts[2]]);return sharedWire(c,d);
    }
    if(parts.length===3&&parts[2]==='duplicate'&&method==='POST'){
     const {rows:[source]}=await c.query('SELECT * FROM documents WHERE id=$1',[id]);if(!source)fail(404,'Document unavailable');
     const content={...source.content,title:source.title+' — Copy',marks:{...source.content.marks}};
     for(const kind of ['signature','stamp'])if(content.marks[kind]&&!(await c.query('SELECT can_apply_asset($1) AS ok',[content.marks[kind].assetId])).rows[0].ok)content.marks[kind]=null;
     if(content.letterheadAsset&&!(await c.query('SELECT can_apply_asset($1) AS ok',[content.letterheadAsset])).rows[0].ok){content.letterhead=`official-${source.language}`;delete content.letterheadAsset;}
     const allowed=await verifyAssets(c,content,user.id);
     if(!hasPhase3&&source.audience==='selected')phase3Required();
     const copied=hasPhase3
      ?(await c.query('INSERT INTO documents(title,number,recipient,type,language,content,created_by,audience) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[content.title,content.number,content.recipient,content.type,content.language,content,user.id,source.audience==='selected'?'selected':'all'])).rows[0]
      :(await c.query('INSERT INTO documents(title,number,recipient,type,language,content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[content.title,content.number,content.recipient,content.type,content.language,content,user.id])).rows[0];
     await linkAssets(c,copied.id,allowed);return sharedWire(c,copied);
    }
    if(parts.length===1&&method==='POST'){
     const d=validateDocument(payload);const assets=await verifyAssets(c,d,user.id);
     const key=payload.importKey?text(payload.importKey,200):null;
     if(key){const prior=await c.query('SELECT * FROM documents WHERE import_owner=$1 AND import_key=$2',[user.id,key]);if(prior.rowCount)return sharedWire(c,prior.rows[0]);}
     const mode=audienceOf(payload.audience);
     if(!hasPhase3&&mode==='selected')phase3Required();
     const {rows:[row]}=hasPhase3
      ?await c.query('INSERT INTO documents(title,number,recipient,type,language,content,created_by,import_owner,import_key,audience) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[d.title,d.number,d.recipient,d.type,d.language,d,user.id,key?user.id:null,key,mode])
      :await c.query('INSERT INTO documents(title,number,recipient,type,language,content,created_by,import_owner,import_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[d.title,d.number,d.recipient,d.type,d.language,d,user.id,key?user.id:null,key]);
     if(hasPhase3)await share(c,row.id,mode,payload.visibleTo||[],user.id);
     await linkAssets(c,row.id,assets);return sharedWire(c,row);
    }
    if(parts.length===2&&['PATCH','DELETE'].includes(method)){
     const {rows:[old]}=await c.query('SELECT * FROM documents WHERE id=$1 FOR UPDATE',[id]);if(!old)fail(404,'Document unavailable');if(payload.version!==old.version)fail(409,'Document changed; reload before saving');
     if(method==='DELETE'){const {rows:[deleted]}=await c.query('SELECT delete_document($1,$2) AS ok',[id,payload.version]);if(!deleted.ok)fail(409,'Document version conflict');return {ok:true};}
     const d=validateDocument(payload),status=payload.status||old.status;if(!['draft','finalized','archived'].includes(status))fail(400,'Invalid status');
     const assets=await verifyAssets(c,d,user.id,id);
      const mode=audienceOf(payload.audience,old.audience);
      if(!hasPhase3&&mode==='selected')phase3Required();
      const recipients=hasPhase3?(payload.visibleTo===undefined?(await c.query('SELECT account_id FROM document_recipients WHERE document_id=$1',[id])).rows.map(r=>r.account_id):payload.visibleTo):[];
      const {rows:[row]}=hasPhase3
       ?await c.query('UPDATE documents SET title=$1,number=$2,recipient=$3,type=$4,language=$5,status=$6,content=$7,audience=$9,version=version+1,updated_at=now() WHERE id=$8 RETURNING *',[d.title,d.number,d.recipient,d.type,d.language,status,d,id,mode])
       :await c.query('UPDATE documents SET title=$1,number=$2,recipient=$3,type=$4,language=$5,status=$6,content=$7,version=version+1,updated_at=now() WHERE id=$8 RETURNING *',[d.title,d.number,d.recipient,d.type,d.language,status,d,id]);
      if(hasPhase3)await share(c,id,mode,recipients,user.id);
      await linkAssets(c,id,assets);return sharedWire(c,row);
    }
   }
   fail(404,'Route unavailable');
  },user.id);
  if(result?.binary){res.setHeader('Content-Type','image/png');res.setHeader('Content-Disposition','inline');res.end(result.binary);return;}
  send(res,200,result);
 }catch(e){
  const detail=logFailure(e,{id,route,stage,method:['GET','POST','PATCH','DELETE','HEAD','PUT','OPTIONS'].includes(req.method)?req.method:'OTHER'});
  send(res,detail.status,{error:detail.message,category:detail.category,requestId:id});
 }
}
