import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {EvidenceLedger} from '../package/lib/redteam/evidence-ledger.mjs';

test('public evidence verify tool preserves engagement identity when matching a real ledger row',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const ledger=new EvidenceLedger(db);
    const item={operation:'read',parameters:{path:'/fixture/a'},result:{text:'fixture'},
      engagement_id:'fixture-a'};
    assert.equal(ledger.record(item).ok,true);
    const source=fs.readFileSync(new URL('../package/lib/redteam/tools.js',import.meta.url),'utf8');
    const nameAt=source.indexOf("name: 'redteam_evidence_verify'");
    const start=source.lastIndexOf('  ctx.tools.register(',nameAt);
    const end=source.indexOf('\n  ctx.tools.register(',nameAt);
    let tool;
    vm.runInNewContext(source.slice(start,end),{ctx:{tools:{register:t=>{tool=t;}}},
      store:{},reviewedTool:x=>x,defineTool:x=>x,text:x=>x,resolveEngagement:()=> 'fixture-a',ledgerOf:()=>ledger});
    const result=JSON.parse(await tool.execute(item,{}));
    assert.equal(result.matched,true);
  }finally{db.close();}
});
