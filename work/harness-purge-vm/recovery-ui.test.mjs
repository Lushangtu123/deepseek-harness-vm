import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {RECOVERY_HTML} from './web-health.mjs';
const page=(id,nextCursor=null,truncated=false)=>({readOnly:true,currentRecovery:'ready-v30',observedAt:'2026-10-29T05:30:00Z',snapshotState:'observed',snapshots:[],images:[{id,logicalBytes:4,allocatedBytes:4}],storage:{freeBytes:10},truncated,nextCursor,archiveScan:{entriesScanned:1,entriesRemaining:nextCursor?1:0,visitedDirectories:3,skippedMetadataDirectories:1,reasons:truncated?['depth-limit']:[]}});
function fixture(responses){
 const element=()=>({textContent:'',hidden:false,disabled:false,children:[],events:{},appendChild(node){this.children.push(node)},replaceChildren(){this.children=[]},addEventListener(name,fn){this.events[name]=fn}});
 const nodes=Object.fromEntries(['free','snap-count','image-count','status','error','snapshots','images','refresh','more'].map(id=>[id,element()]));
 const urls=[];const context={document:{getElementById:id=>nodes[id],createElement:element},AbortController,URLSearchParams,setTimeout:()=>0,clearTimeout(){},fetch:async url=>{urls.push(url);const result=responses.shift();if(result instanceof Error)throw result;return{ok:true,json:async()=>result}}};
 vm.runInNewContext(RECOVERY_HTML.match(/<script>([\s\S]*)<\/script>/)[1],context);
 return{nodes,urls,async settle(){for(let i=0;i<12;i++)await Promise.resolve()}};
}
test('Load-more appends distinct images, preserves previous limitations and ends pagination',async()=>{
 const f=fixture([page('a.qcow2','probe-a',true),page('b.qcow2')]);await f.settle();
 assert.equal(typeof f.nodes.more.events.click,'function','Recovery page needs a working continuation control');assert.equal(f.nodes.more.hidden,false);
 await f.nodes.more.events.click();await f.settle();
 assert.equal(f.nodes['image-count'].textContent,'2');assert.equal(f.nodes.images.children.length,2);assert.equal(f.nodes.more.hidden,true);assert.match(f.nodes.status.textContent,/深度/);assert.match(f.urls[1],/after=probe-a/);
});
test('A failed next page retains visible results and the same retry cursor',async()=>{
 const f=fixture([page('a.qcow2','probe-a'),Error('synthetic unavailable'),page('b.qcow2')]);await f.settle();
 assert.equal(typeof f.nodes.more.events.click,'function');await f.nodes.more.events.click();await f.settle();assert.equal(f.nodes.images.children.length,1);assert.equal(f.nodes.more.disabled,false);
 await f.nodes.more.events.click();await f.settle();assert.equal(f.urls[1],f.urls[2]);assert.equal(f.nodes.images.children.length,2);
});
