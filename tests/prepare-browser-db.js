// Creates only a randomly named disposable database on loopback for browser tests.
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {migrate} from '../scripts/migrate.js';
import {bootstrap} from '../scripts/bootstrap-admin.js';
import {hashPassword} from '../server/auth.js';
const base=process.env.TEST_DATABASE_URL;
if(!base||!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Local TEST_DATABASE_URL required');
const c=new pg.Client({connectionString:base});await c.connect();
if(process.argv[2]==='drop'){
 const name=process.argv[3];if(!/^rimdan_ui_[a-f0-9]+$/.test(name))throw Error('Invalid test database');await c.query(`DROP DATABASE ${name} WITH(FORCE)`);await c.end();
}else{
 const name='rimdan_ui_'+randomBytes(6).toString('hex');await c.query(`CREATE DATABASE ${name}`);
 const url=new URL(base);url.pathname='/'+name;
 await migrate(url.href);await bootstrap(url.href,'admin@test.invalid','Fictional-Test-Password-2026');
 await c.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rimdan_test_app') THEN CREATE ROLE rimdan_test_app LOGIN; END IF; END $$");await c.query('GRANT rimdan_runtime TO rimdan_test_app');
 const db=new pg.Client({connectionString:url.href});await db.connect();const hash=await hashPassword('Fictional-Test-Password-2026');
 for(const [email,role] of [['manager@test.invalid','manager'],['employee@test.invalid','employee']])await db.query('INSERT INTO accounts(email,password_hash,role,active) VALUES($1,$2,$3,true)',[email,hash,role]);
 await db.end();await c.end();url.username='rimdan_test_app';url.password='';console.log(JSON.stringify({name,url:url.href}));
}
