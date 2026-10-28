import test from 'node:test';
import assert from 'node:assert/strict';
import * as health from './web-health.mjs';
const rect=(x,y,w,h)=>({x,y,width:w,height:h});
test('A widget covering a settings switch moves to an unoccupied edge',()=>{
 assert.equal(typeof health.chooseWidgetPlacement,'function','Missing floating occlusion guard');
 const result=health.chooseWidgetPlacement(rect(1090,470,180,180),[rect(1180,570,36,20)],1280,720);
 assert.ok(result);assert.ok(result.x+180<=1280&&result.y+180<=656);
 assert.ok(!(result.x<1216&&result.x+180>1180&&result.y<590&&result.y+180>570));
});
test('When every candidate is obstructed, the widget yields instead of covering controls',()=>{
 assert.equal(typeof health.chooseWidgetPlacement,'function');
 assert.equal(health.chooseWidgetPlacement(rect(10,10,180,180),[rect(0,0,425,664)],425,664),null);
});
test('An already clear widget is stable and a narrow viewport stays within the page',()=>{
 assert.equal(typeof health.chooseWidgetPlacement,'function');
 assert.deepEqual(health.chooseWidgetPlacement(rect(240,200,160,160),[],425,664),{x:240,y:200});
 assert.equal(health.chooseWidgetPlacement(rect(0,0,500,500),[],425,664),null);
});
