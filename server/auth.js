import {randomBytes,createHash,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive),options={N:131072,r:8,p:1,maxmem:256*1024*1024};
export const token=()=>randomBytes(32).toString('base64url');
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function passwordValid(value){return typeof value==='string'&&value.length>=12&&value.length<=128;}
export async function hashPassword(password){
 if(!passwordValid(password))throw Object.assign(new Error('Password must be 12–128 characters'),{status:400});
 const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64,options);
 return `scrypt-131072:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password,encoded){
 const parts=String(encoded||'').split(':');const valid=parts.length===3&&parts[0]==='scrypt-131072'&&/^[a-f0-9]{128}$/.test(parts[2]);
 const actual=await scrypt(String(password),valid?parts[1]:'nonexistent-account-salt',64,options);
 return valid&&timingSafeEqual(actual,Buffer.from(parts[2],'hex'));
}
export function constantEqual(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
export function configuration(){
 const origin=new URL(process.env.APP_ORIGIN||'https://not-configured.invalid');
 const local=process.env.APP_ENV==='development'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)&&process.env.VERCEL!=='1';
 if(!process.env.APP_ORIGIN||(!local&&origin.protocol!=='https:'))throw Object.assign(new Error('Server origin must be configured securely'),{status:503});
 return {origin:origin.origin,local,cookie:local?'rimdan_dev_session':'__Host-rimdan_session'};
}
export function cookie(value,clear=false){const c=configuration();return `${c.cookie}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:28800}${c.local?'':'; Secure'}`;}
export function readCookie(req){const name=configuration().cookie;return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
