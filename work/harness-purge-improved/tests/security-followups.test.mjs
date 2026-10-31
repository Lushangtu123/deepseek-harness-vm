import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {SecurityWorkbench,parseScanOutput} from '../package/lib/redteam/personal-security-workbench.mjs';import {RedteamStore} from '../package/lib/redteam/store-core.js';
import {redactDisplay} from '../package/lib/redteam/personal-evidence-redaction.mjs';
async function fixture(runner){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'security-followup-'))),repo=path.join(root,'repo');fs.mkdirSync(repo);const store=new RedteamStore(path.join(root,'facts'));store.openEngagement('A');store.openEngagement('B');const bench=new SecurityWorkbench(store,{workspaceRoot:root,runner,toolStatus:()=>Object.fromEntries(['semgrep','trivy','zap'].map(t=>[t,{ready:true,version:'fixture'}]))});bench.saveScope('a',{requestId:'followup-scope',revision:0,repoRoot:repo,tools:['semgrep'],expiresAt:new Date(Date.now()+3600000).toISOString(),confirm:true});return{bench,store,close:async()=>{await bench.dispose();await store.close();fs.rmSync(root,{recursive:true,force:true})}}}
test('Scanner errors retain bounded source-free diagnostics while coverage remains partial',()=>{
 const value=parseScanOutput('semgrep',{results:[],errors:[{type:['PartialParsing',[{path:'/src/a.js',start:{line:7}}]],level:'warn',path:'/src/a.js',message:'Syntax error: private snippet password="SENSITIVE"'}],paths:{scanned:['/src/a.js']}});
 assert.equal(value.complete,false);assert.equal(value.diagnostics.total,1);assert.deepEqual(value.diagnostics.items,[{code:'PartialParsing',path:'a.js',line:7}]);assert.ok(!JSON.stringify(value).includes('SENSITIVE'));assert.ok(!JSON.stringify(value).includes('private snippet'));
 const many=parseScanOutput('semgrep',{results:[],errors:Array.from({length:30},()=>({type:'Timeout',path:'/src/a.js'})),paths:{scanned:['/src/a.js']}});assert.equal(many.diagnostics.total,30);assert.equal(many.diagnostics.items.length,20);assert.equal(many.diagnostics.truncated,true);
});
test('Native wait observes the exact task terminal state, does not duplicate work or close on timeout',async()=>{
 let resolve,calls=0;const f=await fixture(()=>{calls++;return new Promise(done=>{resolve=done})});try{const r=f.bench.start('a',{requestId:'followup-scan',profileRevision:1,tool:'semgrep'});await new Promise(setImmediate);
  const pending=await f.bench.wait('a',{id:r.id,waitSeconds:0});assert.equal(pending.run.state,'running');assert.equal(pending.timedOut,true);assert.equal(calls,1);await assert.rejects(f.bench.wait('b',{id:r.id,waitSeconds:0}));await assert.rejects(f.bench.wait('a',{id:r.id,waitSeconds:31}));
  const waiting=f.bench.wait('a',{id:r.id,waitSeconds:2});resolve({complete:true,coverageKey:'fixture',findings:[],coverageFiles:['a.js']});const final=await waiting;assert.equal(final.run.state,'completed');assert.equal(final.timedOut,false);assert.equal(calls,1);
 }finally{resolve?.({complete:false,coverageKey:'fixture',findings:[]});await f.close()}
});
test('Diagnostics persist and export literally without inventing legacy coverage reasons',async()=>{
 const result=parseScanOutput('semgrep',{results:[],errors:[{type:'PartialParsing',path:'/src/[bad](https://evil.invalid).js'}],paths:{scanned:['/src/a.js']}});const f=await fixture(async()=>({...result,coverageKey:'fixture'}));try{f.bench.start('a',{requestId:'followup-diagnostic',profileRevision:1,tool:'semgrep'});await f.bench.active.promise;const r=f.bench.report('a');assert.equal(r.runs[0].state,'partial');assert.equal(r.runs[0].details.diagnostics.total,1);assert.ok(r.markdown.includes('PartialParsing'));assert.ok(r.markdown.includes('\\[bad\\]'));assert.equal(r.summary.runs.notComplete,1)}finally{await f.close()}
});
test('Model report keyset pages cover every finding once under 6000 UTF8 bytes; stale and cross-project cursors refused',async()=>{
 const {modelSecurityResult}=await import('../package/lib/redteam/personal-security-model.mjs');const findings=Array.from({length:95},(_,i)=>({rule:'r'+i,title:'中'.repeat(400),severity:'high',location:'a.js:'+i,evidence:'untrusted'.repeat(200)}));const f=await fixture(async()=>({complete:true,coverageKey:'fixture',coverageFiles:['a.js'],findings}));try{f.bench.start('a',{requestId:'followup-many',profileRevision:1,tool:'semgrep'});await f.bench.active.promise;
  const status=await modelSecurityResult(f.bench,'a',{op:'securityStatus'});assert.equal(status.totalFindings,95);assert.equal(status.findings,undefined);assert.ok(Buffer.byteLength(JSON.stringify(status))<=6000);
  let cursor,ids=[],firstCursor;do{const page=await modelSecurityResult(f.bench,'a',{op:'securityReport',limit:10,...(cursor?{cursor}:{})});assert.ok(Buffer.byteLength(JSON.stringify(page))<=6000);assert.equal(page.totalFindings,95);assert.equal(page.summary.findings.total,95);ids.push(...page.page.items.map(f=>f.id));cursor=page.page.nextCursor;firstCursor??=cursor;if(!cursor)assert.equal(page.page.complete,true)}while(cursor);assert.equal(ids.length,95);assert.equal(new Set(ids).size,95);
  await assert.rejects(modelSecurityResult(f.bench,'b',{op:'securityReport',cursor:firstCursor}));const finding=f.bench.read('a').findings[0];f.bench.review('a',{requestId:'followup-review',id:finding.id,revision:finding.revision,status:'confirmed',note:'Owned synthetic fixture only'});await assert.rejects(modelSecurityResult(f.bench,'a',{op:'securityReport',cursor:firstCursor}),/变化/);assert.equal(f.bench.report('a').totalFindings,95);
 }finally{await f.close()}
});
test('Run history pages and malformed page controls do not alter task or finding data',async()=>{
 const {modelSecurityResult}=await import('../package/lib/redteam/personal-security-model.mjs');const f=await fixture(async()=>({complete:true,coverageKey:'fixture',findings:[]}));try{
  for(let i=0;i<12;i++){f.bench.start('a',{requestId:'followup-run-'+i,profileRevision:1,tool:'semgrep'});await f.bench.active.promise}
  let cursor,ids=[];do{const r=await modelSecurityResult(f.bench,'a',{op:'securityReport',section:'runs',limit:4,...(cursor?{cursor}:{})});assert.ok(Buffer.byteLength(JSON.stringify(r))<=6000);ids.push(...r.page.items.map(i=>i.id));cursor=r.page.nextCursor}while(cursor);assert.equal(new Set(ids).size,12);
  for(const input of [{limit:0},{limit:11},{cursor:'$$'},{cursor:Buffer.from('null').toString('base64url')},{section:'shell'},{unexpected:'true'}])await assert.rejects(modelSecurityResult(f.bench,'a',{op:'securityReport',...input}));
  assert.equal(f.bench.report('a').totalRuns,12);assert.equal(f.bench.report('a').totalFindings,0);
 }finally{await f.close()}
});
test('Final model serialization preserves redaction and rejects expanded text or masked control IDs as valid JSON',async()=>{
 const {securityModelWire}=await import('../package/lib/redteam/personal-security-model.mjs');
 const original={ok:true,engagement:'owned',page:{section:'findings',nextCursor:null,items:[{id:1,status:'unverified',tool:'semgrep',title:'a'.repeat(1000)}]}};
 const expanded=JSON.parse(securityModelWire(original,redactDisplay(original,['a'])));assert.equal(expanded.ok,false);assert.match(expanded.error,/6000/);assert.ok(Buffer.byteLength(JSON.stringify(expanded))<=6000);
 const cursor={ok:true,engagement:'owned',page:{section:'findings',nextCursor:'eyJafter',items:[]}};const masked=JSON.parse(securityModelWire(cursor,redactDisplay(cursor,['eyJ'])));assert.equal(masked.ok,false);assert.match(masked.error,/标识/);assert.ok(!JSON.stringify(masked).includes('eyJafter'));
 for(const original of [{ok:true,baseRunId:'known-secret',currentRunId:'current'},{ok:true,run:{id:'id',state:'running',tool:'known-secret'}},{ok:true,runs:[{id:'id',state:'running',tool:'known-secret'}]}])assert.equal(JSON.parse(securityModelWire(original,redactDisplay(original,['known-secret']))).ok,false);
 const ordinary={ok:true,engagement:'owned',page:{section:'findings',nextCursor:null,items:[{id:1,status:'unverified',tool:'semgrep',title:'known-secret'}]}};const safe=JSON.parse(securityModelWire(ordinary,redactDisplay(ordinary,['known-secret'])));assert.equal(safe.ok,true);assert.equal(safe.page.items[0].title,'[REDACTED]');
});
