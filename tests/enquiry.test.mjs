import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {handleEnquiry,validateEnquiry} from '../src/server/enquiry.ts';
const now=Date.now();
const input=()=>({project:'orla',context:'Synthetic test only',name:'Website QA',email:'qa@example.invalid',phone:'',message:'Synthetic record, no follow-up.',consent:true,website:'',startedAt:now-5000,submissionId:randomUUID()});
const request=(value,headers={})=>new Request('https://example.test/api/enquiry',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.test',...headers},body:typeof value==='string'?value:JSON.stringify(value)});
function memoryStore(){const records=new Map();return{records,async write(path,value){if(records.has(path))throw new Error('exists');records.set(path,value);},async read(path){return records.get(path)||null;}};}
test('valid enquiry is saved once; retry keeps its receipt; changed data cannot overwrite',async()=>{
 const store=memoryStore(),value=input();
 let r=await handleEnquiry(request(value),'orla',{store,now,clientAddress:'idempotency'});assert.equal(r.status,201);assert.deepEqual(await r.json(),{ok:true,id:value.submissionId});
 r=await handleEnquiry(request(value),'orla',{store,now,clientAddress:'idempotency'});assert.equal(r.status,200);assert.equal(store.records.size,1);
 r=await handleEnquiry(request({...value,name:'Changed name'}),'orla',{store,now,clientAddress:'idempotency'});assert.equal(r.status,409);assert.equal(store.records.size,1);
});
test('invalid fields, missing consent and bot field do not reach storage',async()=>{
 const store=memoryStore();
 for(const patch of [{name:''},{email:'invalid'},{consent:false},{website:'bot.example'},{message:'x'.repeat(2001)},{startedAt:now+60000},{project:'wrong'}]){
  const r=await handleEnquiry(request({...input(),...patch}),'orla',{store,now,clientAddress:'validation'});assert.equal(r.status,422);
 }
 assert.equal(store.records.size,0);
});
test('cross-origin and oversized requests fail before any write',async()=>{
 const store=memoryStore();
 assert.equal((await handleEnquiry(request(input(),{origin:'https://foreign.test'}),'orla',{store,now})).status,403);
 assert.equal((await handleEnquiry(request('x'.repeat(17000)),'orla',{store,now})).status,413);
 assert.equal((await handleEnquiry(request('{broken'),'orla',{store,now})).status,400);
 assert.equal(store.records.size,0);
});
test('a storage failure cannot produce success; a completed timed-out write is recovered',async()=>{
 const value=input();
 const unavailable={async write(){throw new Error('offline');},async read(){throw new Error('offline');}};
 assert.equal((await handleEnquiry(request(value),'orla',{store:unavailable,now,clientAddress:'storage'})).status,503);
 const store=memoryStore();const timedOut={async write(path,value){await store.write(path,value);throw new Error('timeout after commit');},read:store.read.bind(store)};
 assert.equal((await handleEnquiry(request(value),'orla',{store:timedOut,now,clientAddress:'storage'})).status,200);assert.equal(store.records.size,1);
});
test('response does not return personal details or storage paths',async()=>{
 const r=await handleEnquiry(request(input()),'orla',{store:memoryStore(),now,clientAddress:'privacy'});
 assert.equal(r.headers.get('cache-control'),'no-store');const data=await r.json();assert.deepEqual(Object.keys(data).sort(),['id','ok']);
});
