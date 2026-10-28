import test from 'node:test';
import assert from 'node:assert/strict';
import * as entry from './web-entry.mjs';
import * as health from './web-health.mjs';
const catalog={readOnly:true,currentRecovery:'ready-workbench-v12-20261027',observedAt:'2026-10-27T00:00:00Z',snapshotState:'observed',snapshots:[{name:'ready-workbench-v12-20261027',present:true,current:true,protected:true,reviewCandidate:false,bundleState:'verified',createdAt:'2026-10-27T00:00:00Z'}],images:[{id:'restore-probe-v10/offline-image/Data/ubuntu.qcow2',logicalBytes:20,allocatedBytes:16,reviewCandidate:true}],storage:{freeBytes:200,totalBytes:400,primaryLogicalBytes:100,primaryAllocatedBytes:80},truncated:false};
test('Recovery reader coalesces fixed metadata reads and strips private or malformed fields',async()=>{
 assert.equal(typeof entry.createRecoveryReader,'function','Missing recovery metadata reader');
 let calls=0,resolve;
 const read=entry.createRecoveryReader({run:()=>{calls++;return new Promise(done=>{resolve=done})}});
 const a=read(),b=read();await Promise.resolve();assert.equal(calls,1);
 resolve({stdout:JSON.stringify({...catalog,privateKey:'private-secret',images:[...catalog.images,{id:'../private.qcow2'},{id:'folder/token.qcow2'}]})});
 const value=await a;assert.deepEqual(await b,value);assert.equal(value.images.length,1);assert.ok(!JSON.stringify(value).includes('private-secret'));
 assert.equal((await read()).readOnly,true);assert.equal(calls,1);
});
test('Recovery metadata is read-only, fixed-target, same-origin and requires the local header',async()=>{
 assert.equal(typeof entry.createRecoveryReader,'function');
 let calls=0;const server=entry.createWebEntry({recoveryReader:async()=>{calls++;return catalog}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const [method,headers,status] of [['GET',{},403],['POST',{'x-harness-local':'1'},405],['GET',{'x-harness-local':'1','sec-fetch-site':'cross-site'},403],['GET',{'x-harness-local':'1',origin:'https://outside.invalid'},403]]){
   const response=await fetch(base+'/__harness/recoveries',{method,headers});assert.equal(response.status,status);await response.text();
  }
  assert.equal(calls,0);
  const response=await fetch(base+'/__harness/recoveries',{headers:{'x-harness-local':'1'}});assert.equal(response.status,200);assert.deepEqual(await response.json(),catalog);assert.equal(calls,1);
  const page=await fetch(base+'/__harness/recovery');assert.equal(page.status,200);assert.match(await page.text(),/恢复点与验收副本/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('Recovery page explains shared allocation, review-only candidates and protection',()=>{
 assert.equal(typeof health.RECOVERY_HTML,'string','Missing recovery page');
 for(const text of ['只读','共享','人工','最近三个','恢复点与验收副本'])assert.ok(health.RECOVERY_HTML.includes(text),text);
 assert.ok(!health.RECOVERY_HTML.includes('innerHTML'));
});
