// Deliberate operator-only connection gate. No environment file is auto-loaded.
export function ownerURL(){
 const url=process.env.MIGRATION_DATABASE_URL;if(!url)throw Error('Set MIGRATION_DATABASE_URL securely');
 let parsed;try{parsed=new URL(url);}catch{throw Error('Invalid migration database URL');}
 const local=['127.0.0.1','localhost','[::1]'].includes(parsed.hostname);
 if(!local&&!process.argv.includes('--approve-production'))throw Error('Remote database operations require explicit --approve-production and operator approval');
 return url;
}
