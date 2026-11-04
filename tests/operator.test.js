import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {migrate} from '../scripts/migrate.js';
import {bootstrap} from '../scripts/bootstrap-admin.js';
import {operatorTransaction} from '../scripts/operator-transaction.js';

const url='postgresql://fixture@127.0.0.1:1/disposable';
const operations={migrate:()=>migrate(url),bootstrap:()=>bootstrap(url,'fixture@example.invalid','Fictional-Test-Password-2026')};
for(const [name,operation] of Object.entries(operations)){
 test(name+': acquisition failure closes pool and preserves original error despite end failure',async()=>{
  const connect=pg.Pool.prototype.connect,end=pg.Pool.prototype.end,original=new Error('Original acquisition error');let ends=0;
  pg.Pool.prototype.connect=async()=>{throw original;};pg.Pool.prototype.end=async()=>{ends++;throw Error('Cleanup failed');};
  try{await assert.rejects(operation,error=>error===original);assert.equal(ends,1);}
  finally{pg.Pool.prototype.connect=connect;pg.Pool.prototype.end=end;}
 });
 test(name+': query failure survives rollback, release and end failures',async()=>{
  const connect=pg.Pool.prototype.connect,end=pg.Pool.prototype.end,original=new Error('Original query error');let rollback=0,releases=0,ends=0;
  pg.Pool.prototype.connect=async()=>({query:async sql=>{if(sql==='BEGIN')return {};if(sql==='ROLLBACK'){rollback++;throw Error('Rollback failed');}throw original;},release(){releases++;throw Error('Release failed');}});
  pg.Pool.prototype.end=async()=>{ends++;throw Error('End failed');};
  try{await assert.rejects(operation,error=>error===original);assert.equal(rollback,1);assert.equal(releases,1);assert.equal(ends,1);}
  finally{pg.Pool.prototype.connect=connect;pg.Pool.prototype.end=end;}
 });
}
test('successful operator transaction reports cleanup failure and still ends pool',async()=>{
 const connect=pg.Pool.prototype.connect,end=pg.Pool.prototype.end,error=new Error('Release failure');let ends=0;
 pg.Pool.prototype.connect=async()=>({query:async()=>({}),release(){throw error;}});pg.Pool.prototype.end=async()=>{ends++;};
 try{await assert.rejects(()=>operatorTransaction(url,async()=>42),value=>value===error);assert.equal(ends,1);}
 finally{pg.Pool.prototype.connect=connect;pg.Pool.prototype.end=end;}
});
