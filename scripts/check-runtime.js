import {fileURLToPath} from 'node:url';
import {configuration} from '../server/auth.js';
import {transaction,closeDatabase} from '../server/db.js';
import {logFailure} from '../server/errors.js';

// Runtime credentials only; never reads or changes migration/account metadata.
export async function checkRuntime(){
 configuration();await transaction(c=>c.query('SELECT 1'));return {ready:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await checkRuntime()));}
 catch(error){logFailure(error,{route:'readiness',stage:'runtime_check'});process.exitCode=1;}
 finally{try{await closeDatabase();}catch(error){logFailure(error,{route:'readiness',stage:'cleanup'});process.exitCode=1;}}
}
