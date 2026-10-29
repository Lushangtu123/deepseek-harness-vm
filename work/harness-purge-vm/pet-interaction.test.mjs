import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as health from './web-health.mjs';

const rect=(x,y,width,height)=>({x,y,left:x,top:y,right:x+width,bottom:y+height,width,height});
function fixture({corner='bottom-right',controls=[],flipped=false}={}){
 const timers=[],events=new Map(),saved=new Map([['harness-pet-corner-v1',corner]]);
 const style=()=>({setProperty(k,v){this[k]=v},getPropertyValue(k){return this[k]??''}});
 const el=()=>({style:style(),attrs:new Map(),children:[],appendChild(e){this.children.push(e)},setAttribute(k,v){this.attrs.set(k,String(v))},getAttribute(k){return this.attrs.get(k)??null},removeAttribute(k){this.attrs.delete(k)},contains(){return false},querySelectorAll(){return[]},addEventListener(){}});
 const app=el(),widget=el(),popup=el(),panel=el();panel.open=false;let squash=1,transition=0,computedDimensions=true;
 widget.style.left='965px';widget.style.top='405px';widget.classList={contains:c=>c==='dshwv-left'&&flipped};
 const size=()=>Math.min(300,parseFloat(widget.style.maxWidth)||Infinity),art=()=>size()*.5945;
 widget.getBoundingClientRect=()=>rect(parseFloat(widget.style.left)+transition,parseFloat(widget.style.top),size(),size());
 const image={getBoundingClientRect(){const b=widget.getBoundingClientRect(),w=art();return rect(b.left+(flipped?0:size()-w)-(squash-1)*w/2,b.top+size()-w*squash,w*squash,w*squash)}};
 widget.querySelector=()=>image;widget.querySelectorAll=q=>q==='.dshwv-pop.dshwv-pop-open'?[popup]:[];
 popup.getBoundingClientRect=()=>{const b=widget.getBoundingClientRect(),w=size(),h=w*700/1026;return rect(b.left+(flipped?-parseFloat(popup.style.left||0):parseFloat(popup.style.left||0)),b.top+parseFloat(popup.style.top||0),w,h)};
 const document={head:{appendChild(){}},body:{},activeElement:null,getElementById:id=>id==='root'?app:id==='harness-vm-identity'?panel:null,createElement:el,querySelector:q=>q==='.dshwv-root'?widget:q==='.dshwv-img'?image:null,querySelectorAll:q=>q==='.dshwv-menu'?[]:controls.map(r=>({closest:()=>null,getBoundingClientRect:()=>r})),addEventListener:(n,f)=>events.set(n,f)};
 const getComputedStyle=e=>({visibility:'visible',display:'block',opacity:e.getAttribute?.('data-harness-occluded')==='true'?'0':'1',width:computedDimensions?(e===image?art():size())+'px':'auto',height:computedDimensions?(e===image?art():e===popup?size()*700/1026:size())+'px':'auto'});
 const context={document,window:{addEventListener:(n,f)=>events.set(n,f)},innerWidth:1280,innerHeight:720,getComputedStyle,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},setTimeout:f=>timers.push(f)};
 vm.runInNewContext('('+health.installFloatingLayout.toString()+')('+health.chooseWidgetPlacement.toString()+','+health.planPetDock.toString()+','+health.dragPetCorner.toString()+')',context);
 return{widget,popup,image,saved,events,run(){let n=0;while(timers.length&&n++<20)timers.shift()();assert.ok(n<20)},refresh(){events.get('resize')();this.run()},animate(s,t=0){squash=s;transition=t;this.refresh()},useNativeRectFallback(){computedDimensions=false;const read=image.getBoundingClientRect;image.getBoundingClientRect=()=>Object.create(read());this.refresh()}};
}

test('Native squish and root transition frames cannot feed back into dock coordinates',()=>{
 for(const corner of ['free','bottom-right'])for(const flipped of [false,true]){
  const f=fixture({flipped,corner});f.run();const position=[f.widget.style.left,f.widget.style.top];
  for(const [s,t]of [[1.12,-8],[.97,-2],[1.01,0],[1,0]]){f.animate(s,t);assert.deepEqual([f.widget.style.left,f.widget.style.top],position,'Animated paint bounds must not become new layout coordinates')}
 }
});
test('An open balance bubble moves independently of the pet and remains visible over a nearby control',()=>{
 const controls=[rect(940,400,110,40)];const f=fixture({controls});f.run();
 assert.equal(f.widget.getAttribute('data-harness-occluded'),'false');assert.equal(f.popup.getAttribute('data-harness-occluded'),'false','Opening the balance bubble must not make it transparent');
 assert.equal(f.popup.getAttribute('inert'),null);const r=f.popup.getBoundingClientRect();assert.ok(r.x>=8&&r.y>=8&&r.right<=1272&&r.bottom<=712);
 assert.ok(!controls.some(c=>r.left<c.right+4&&r.right>c.left-4&&r.top<c.bottom+4&&r.bottom>c.top-4),'Use an available gap for the popup');
});
test('A balance popup with no unoccupied gap falls back to the original visible overlay',()=>{
 const f=fixture({controls:[rect(0,0,1080,720),rect(1080,0,200,500)]});f.run();
 assert.equal(f.widget.getAttribute('data-harness-occluded'),'false');assert.equal(f.popup.getAttribute('data-harness-occluded'),'false');assert.equal(f.popup.getAttribute('inert'),null);
});
test('Top-corner balance bubbles stay inside the viewport in both native flip orientations',()=>{
 for(const flipped of [false,true]){const f=fixture({corner:'top-left',flipped});f.run();const r=f.popup.getBoundingClientRect();assert.ok(r.left>=8&&r.top>=8&&r.right<=1272&&r.bottom<=712,JSON.stringify(r));assert.equal(f.popup.getAttribute('data-harness-occluded'),'false')}
});
test('Manual drag returns position ownership to original native snap settings instead of a second snapper',()=>{
 const start={x:1088,y:528,width:180,height:180,pointerX:1178,pointerY:618};
 assert.equal(health.dragPetCorner(start,{clientX:1178,clientY:623},1280,720),'free','Original 3px drag threshold must also release our preset');
 assert.equal(health.dragPetCorner(start,{clientX:1178,clientY:680},1280,720),'free','Do not duplicate the original edge snapper');
 assert.equal(health.dragPetCorner(start,{clientX:1179,clientY:618},1280,720),null);assert.equal(health.dragPetCorner(start,{clientX:0,clientY:0},1280,720),null);
});
test('Interacting with a bubble cannot release a preset as though it were dragging the character',()=>{
 const f=fixture();f.run();f.events.get('pointerdown')({target:{closest:q=>q==='.dshwv-root'?f.widget:null},clientX:1100,clientY:450});
 f.events.get('pointerup')({clientX:1120,clientY:450});f.run();assert.equal(f.saved.get('harness-pet-corner-v1'),'bottom-right');
});
test('A drag crossing the native threshold and returning to its starting point still releases the preset',()=>{
 const f=fixture();f.run();f.events.get('pointerdown')({target:{closest:q=>q==='.dshwv-img'?f.image:null},clientX:1180,clientY:620});
 f.events.get('pointermove')({clientX:1190,clientY:620});f.events.get('pointermove')({clientX:1181,clientY:620});f.events.get('pointerup')({clientX:1181,clientY:620});f.run();
 assert.equal(f.saved.get('harness-pet-corner-v1'),'free');
});
test('Cancelling a drag crossing the native threshold retains the explicit corner',()=>{
 const f=fixture();f.run();f.events.get('pointerdown')({target:{closest:q=>q==='.dshwv-img'?f.image:null},clientX:1180,clientY:620});f.events.get('pointermove')({clientX:1190,clientY:620});
 f.events.get('pointercancel')({clientX:0,clientY:0});f.run();assert.equal(f.saved.get('harness-pet-corner-v1'),'bottom-right');
});
test('Fallback geometry retains native DOMRect prototype properties when computed sizes are unavailable',()=>{
 const f=fixture();f.run();f.useNativeRectFallback();assert.equal(f.widget.getAttribute('data-harness-occluded'),'false');assert.equal(f.widget.getAttribute('data-harness-corner'),'bottom-right');
});
