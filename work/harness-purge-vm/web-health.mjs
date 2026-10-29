export const HEALTH_HTML = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harness 本机连接状态</title>
<style>
:root{color-scheme:light;font-family:"Avenir Next","PingFang SC","Microsoft YaHei",sans-serif;color:#17253c;background:#f4f7fc}*{box-sizing:border-box}body{max-width:940px;margin:64px auto;padding:0 28px;font-size:14px;line-height:1.7}h1{font-size:30px;letter-spacing:-.04em;line-height:1.3;margin:12px 0}h1:before{content:"LOCAL CONNECTION";display:block;font-size:10px;letter-spacing:.2em;color:#5072a9;margin-bottom:12px}p{color:#586b86}table{width:100%;border-collapse:separate;border-spacing:0;margin:22px 0;background:#fff;border:1px solid #dfe7f2;border-radius:16px;overflow:hidden;box-shadow:0 6px 22px #233e6506}th,td{text-align:left;padding:14px 20px;border-bottom:1px solid #edf1f7;font-size:13px}th{color:#536783;font-weight:600;background:#f9fbfe;font-size:11px}tr:last-child td{border:0}td:last-child{font-family:Menlo,Consolas,monospace;color:#60718a}button,a{font-family:inherit;font-size:12px;font-weight:600;line-height:1.5}button{appearance:none;background:#2459d8;border:1px solid #2459d8;color:#fff;border-radius:9px;padding:9px 16px;margin:12px 12px 0 0;cursor:pointer}button:hover{background:#1949be}a{color:#2459d8;text-underline-offset:4px}button:focus-visible,a:focus-visible{outline:3px solid #2459d8;outline-offset:4px}#error{color:#a32134;overflow-wrap:anywhere}#summary{padding:14px 18px;border:1px solid #dfe7f2;border-radius:12px;background:#fff;color:#3c526f}small{display:block;color:#586b86;font-size:11px;line-height:1.8;margin-top:20px}@media(max-width:600px){body{margin:28px auto;padding:0 16px}h1{font-size:24px}th,td{padding:11px 10px;font-size:11px}td:first-child{max-width:145px;overflow-wrap:anywhere}}
</style>
<h1>Harness 本机链路状态</h1><p>按本机入口实际观察显示。未观察到表示尚无记录，不代表已经通过检查。</p><button id="refresh">刷新状态</button> <a href="/#redteam-full">返回演练台</a><p id="error" role="alert"></p><p id="freshness" role="status"></p><table><thead><tr><th>层级</th><th>最近观察</th><th>耗时</th><th>最后观察</th></tr></thead><tbody id="layers"></tbody></table><p id="summary"></p><h2>最近异常与后续成功</h2><p>当前状态与历史记录分开显示。后续请求完整成功仅说明该类别的一次请求已完成，不代表整个服务均已恢复。</p><div style="max-height:440px;overflow:auto"><table aria-label="最近诊断事件"><thead><tr><th>时间 / 序号</th><th>类别</th><th>阶段</th><th>事件</th><th>耗时</th></tr></thead><tbody id="events"></tbody></table></div><small>只保留最近 100 条状态、类别和耗时。没有请求正文、Cookie、查询参数或工具输出；关闭入口即清空记录。遇到登录失效，请重新运行启动入口。</small>
<script>const labels={entry:'本机入口',transport:'VM HTTP 连接',index:'首屏文档',assets:'脚本与样式',api:'Harness API',redteam:'演练资料 API',purge:'插件 API',websocket:'WebSocket',sse:'插件订阅 SSE'};
const states={'ok':'正常','receiving':'正在接收正文','cancelled':'请求已取消','connected':'已连接','closed':'已断开','not-observed':'未观察到','auth-required':'登录已失效 / 需要登录','denied':'访问被拒绝','http-error':'HTTP 错误','connection-error':'连接失败','timeout':'等待超时'};
let refreshGeneration=0,activeRefresh,latest,readClock,attemptClock,failedRead=false;
const clock=()=>({wall:Date.now(),mono:typeof performance==='undefined'?Date.now():performance.now()});
const elapsed=stamp=>{if(!stamp)return Infinity;const now=clock(),wall=now.wall-stamp.wall,mono=now.mono-stamp.mono;return wall<0||mono<0?Infinity:Math.max(wall,mono)};
function renderLayers(){
 if(!latest)return;
 const viewAge=elapsed(readClock),table=document.getElementById('layers');table.replaceChildren();
 for(const [key,label]of Object.entries(labels)){
  const item=latest.layers[key]||{state:'not-observed'};
  const age=Number.isFinite(item.ageMs)?item.ageMs+viewAge:Infinity;
  const stale=failedRead||viewAge>=60000||item.stale===true||(!item.live&&age>=60000);
  const state=item.error==='body-incomplete'?'正文中断':item.error==='body-timeout'?'正文等待超时':item.phase==='complete'&&item.state==='ok'?'正文已完整接收':states[item.state]||'未知';
  const date=Date.parse(item.observedAt),observed=Number.isFinite(date)?new Date(date).toLocaleString('zh-CN'):'未记录';
  const row=document.createElement('tr');
  for(const value of [label,item.state!=='not-observed'&&stale?'上次：'+state+' · 当前待观察':state,item.responseMs===undefined?'—':item.responseMs+' ms',observed]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell)}table.appendChild(row);
 }
 const fresh=document.getElementById('freshness');if(fresh)fresh.textContent='记录读取：'+new Date(readClock.wall).toLocaleString('zh-CN')+' · '+(failedRead?'本次读取失败，上次记录供参考':viewAge>=60000?'读取已过期，请刷新':viewAge<10000?'刚刚读取':Math.floor(viewAge/1000)+' 秒前读取')+'。刷新只读取入口记录，不执行 VM 健康探测；单层上次观察超过 60 秒标为待观察。';
 document.getElementById('summary').textContent=(failedRead||viewAge>=60000?'上次记录订阅：':'当前订阅：')+'WebSocket '+latest.active.websocket+'，SSE '+latest.active.sse+'；已保留 '+latest.recent.length+' 条诊断记录。';
}
async function refresh(){
 const generation=++refreshGeneration;activeRefresh?.abort();const controller=new AbortController();activeRefresh=controller;attemptClock=clock();
 const button=document.getElementById('refresh'),error=document.getElementById('error');button.disabled=true;button.textContent='正在刷新…';error.textContent='';
 let abortRequest;const abort=()=>abortRequest?.(controller.signal.reason||Error('刷新已取消'));
 const timer=setTimeout(()=>controller.abort(Error('读取诊断超时，请重试。')),10000);
 try{
  const cancelled=new Promise((_,reject)=>{abortRequest=reject;controller.signal.addEventListener('abort',abort,{once:true})});
  const data=await Promise.race([(async()=>{const response=await fetch('/__harness/diagnostics',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('本机诊断入口不可用（HTTP '+response.status+'）');return response.json()})(),cancelled]);
  if(generation!==refreshGeneration||controller.signal.aborted)return;
  latest=data;readClock=clock();failedRead=false;renderLayers();
  const history=document.getElementById('events');history.replaceChildren();const failed=new Set(),events=[];
  const phases={queue:'排队',queued:'排队',headers:'等待响应头',body:'接收正文',complete:'完整结束',stream:'流式连接'};
  for(const item of data.recent.slice(-100)){
   const bad=['connection-error','timeout','http-error','auth-required','denied'].includes(item.state);
   const recovered=item.state==='ok'&&item.phase==='complete'&&failed.has(item.category);
   if(bad)failed.add(item.category);else if(recovered)failed.delete(item.category);
   if(!bad&&!recovered)continue;
   const time=Date.parse(item.observedAt),id=Number.isSafeInteger(item.eventId)?' #'+item.eventId:'';
   events.push([Number.isFinite(time)?new Date(time).toLocaleString('zh-CN')+id:'时间未记录'+id,labels[item.category]||'其他请求',phases[item.phase]||'阶段未记录',recovered?'后续请求完整成功':item.error==='body-incomplete'?'正文中断':item.error==='body-timeout'?'正文等待超时':states[item.state]||'未知',Number.isFinite(item.responseMs)?item.responseMs+' ms':'—']);
  }
  for(const values of events.reverse()){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell)}history.appendChild(row)}
  if(!events.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=5;cell.textContent='保留范围内尚无异常事件。';row.appendChild(cell);history.appendChild(row)}
 }catch(reason){if(generation===refreshGeneration){failedRead=true;error.textContent=reason.message||'无法读取本机状态，请重试。';renderLayers()}}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);if(generation===refreshGeneration){button.disabled=false;button.textContent='刷新状态';activeRefresh=null}}
}
const returned=()=>{renderLayers();if(document.visibilityState!=='hidden'&&!activeRefresh&&elapsed(attemptClock)>=5000)refresh()};
if(typeof window!=='undefined')window.addEventListener('focus',returned);document.addEventListener?.('visibilitychange',returned);
if(typeof setInterval!=='undefined'){const aging=setInterval(renderLayers,1000);aging?.unref?.()}
document.getElementById('refresh').addEventListener('click',refresh);refresh();</script></html>`

export const RECOVERY_HTML = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harness 恢复点管理</title>
<style>
:root{color-scheme:light;font-family:"Avenir Next","PingFang SC",system-ui,sans-serif;color:#1b2d46;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:42px 24px}header{display:flex;align-items:center;gap:18px;justify-content:space-between;flex-wrap:wrap}h1{font-size:28px;letter-spacing:-.04em;margin:5px 0 10px}h2{font-size:17px;margin:0 0 15px}.eyebrow{font-size:11px;color:#527094;letter-spacing:.12em;font-weight:700}p{color:#586c87;font-size:13px;line-height:1.8}button,a{font:600 12px/1.5 inherit}button{padding:9px 15px;border:1px solid #bfd0ed;background:#edf3ff;color:#2454a3;border-radius:9px;cursor:pointer}button:disabled{opacity:.55;cursor:wait}a{color:#315e9f;text-underline-offset:3px;margin-left:14px}:is(button,a):focus-visible{outline:3px solid #2459d8;outline-offset:3px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:25px 0}.card,section{background:#fff;border:1px solid #dfe6f1;border-radius:16px;padding:22px}.card span{display:block;font-size:11px;color:#637792}.card strong{display:block;font-size:25px;margin-top:10px}section{margin-top:18px}.note{margin:0 0 12px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}th{font-size:11px;color:#657a96;background:#f7f9fc}td,th{padding:12px 10px;border-bottom:1px solid #e7ecf4;vertical-align:top}td:first-child{overflow-wrap:anywhere;min-width:150px;max-width:390px}td:not(:first-child){min-width:100px}#error{color:#a12a3a}#status{min-height:22px}#error:empty{display:none}@media(max-width:640px){main{padding:25px 14px}.cards{grid-template-columns:1fr}.card{padding:16px}.card strong{font-size:22px}section{padding:16px}h1{font-size:24px}}
</style><main><header><div><div class="eyebrow">HARNESS · LOCAL RECOVERY</div><h1>恢复点与验收副本</h1></div><nav><button id="refresh">刷新清单</button><a href="/">返回 Harness</a></nav></header>
<p>此页只读，不启动、恢复或删除虚拟机。候选项需要人工复核；当前恢复点、原版基线和最近三个改进恢复点标记为建议保留。这些标记没有设置磁盘写保护。</p>
<div class="cards"><div class="card"><span>上次读取的宿主可用空间</span><strong id="free">待核对</strong></div><div class="card"><span>磁盘快照 · 本次显示</span><strong id="snap-count">待核对</strong></div><div class="card"><span>归档镜像 · 本次显示</span><strong id="image-count">待核对</strong></div></div>
<p id="status" role="status">正在读取本机清单…</p><p id="error" role="alert"></p>
<section><h2>磁盘快照与恢复归档</h2><p class="note">归档摘要匹配仅表示归档文件校验通过；实际恢复与启动结果以各轮验收记录为准。</p><div class="scroll"><table><thead><tr><th>名称</th><th>磁盘 / 归档</th><th>保留建议</th><th>建立时间</th></tr></thead><tbody id="snapshots"></tbody></table></div></section>
<section><h2>离线验收镜像</h2><p class="note">逻辑大小与分配块大小可能包含 APFS 共享数据，不能相加作为删除后可释放容量；本页不估算可回收空间。</p><div class="scroll"><table><thead><tr><th>归档内位置</th><th>逻辑大小</th><th>分配块大小</th><th>建议</th></tr></thead><tbody id="images"></tbody></table></div><button id="more" hidden>加载下一批</button><p class="note">按归档逐批读取，跳过辅助代码目录；目录变化后请刷新清单重新核对。</p></section></main>
<script>
const nodes=Object.fromEntries(['free','snap-count','image-count','status','error','snapshots','images','refresh','more'].map(id=>[id,document.getElementById(id)]));let generation=0,active,nextCursor=null,loadedRecovery=null;const images=new Map(),limits=new Set();let entriesScanned=0;
const size=value=>Number.isSafeInteger(value)&&value>=0?(value/1073741824).toFixed(2)+' GiB':'未确认';
const make=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el};
const row=(target,values)=>{const tr=document.createElement('tr');for(const value of values)tr.appendChild(make('td',value));target.appendChild(tr)};
async function refresh(append=false){
 if(append&&!nextCursor)return;
 const after=append?nextCursor:null;if(!append){nextCursor=null;nodes.more.hidden=true;}
 const current=++generation;active?.abort();const controller=new AbortController();active=controller;nodes.refresh.disabled=nodes.more.disabled=true;nodes.error.textContent='';nodes.status.textContent='正在重新读取；下方旧清单不代表当前状态。';
 const timer=setTimeout(()=>controller.abort(),11000);
 const aborted=new Promise((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('清单读取超时或已取消，请重试。')),{once:true}));
 try{
  const data=await Promise.race([fetch('/__harness/recoveries'+(after?'?'+new URLSearchParams({after}):''),{headers:{'x-harness-local':'1'},cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('清单暂不可用，请确认本机入口和磁盘可读取后重试。');return response.json()}),aborted]);
  if(current!==generation)return;
  if(append&&loadedRecovery!==data.currentRecovery)throw Error('恢复入口已变化，请刷新清单重新读取。');
  if(!append){images.clear();limits.clear();entriesScanned=0;}
  loadedRecovery=data.currentRecovery;nextCursor=data.nextCursor??null;
  for(const item of data.images)images.set(item.id,item);
  const reasons=data.archiveScan?.reasons??[];for(const reason of reasons)limits.add(reason);if(data.truncated&&!reasons.length)limits.add('unknown-limit');
  entriesScanned+=data.archiveScan?.entriesScanned??0;
  nodes.free.textContent=size(data.storage?.freeBytes);nodes['snap-count'].textContent=data.snapshotState==='observed'?String(data.snapshots.filter(item=>item.present).length):'未确认';nodes['image-count'].textContent=String(images.size);
  nodes.snapshots.replaceChildren();nodes.images.replaceChildren();
  const bundle={verified:'归档摘要匹配',missing:'未建立归档',invalid:'归档校验失败','not-reviewed':'非改进版归档'};
  for(const item of data.snapshots)row(nodes.snapshots,[item.name+(item.current?' · 读取时的恢复入口':''),(item.present===true?'快照已存在':item.present===false?'快照未建立':'快照未确认')+' / '+(bundle[item.bundleState]||'归档未确认'),item.protected?'建议保留':item.reviewCandidate?'人工复核候选':'待核对',item.createdAt?new Date(item.createdAt).toLocaleString('zh-CN'):'无归档时间']);
  for(const item of images.values())row(nodes.images,[item.id,size(item.logicalBytes),size(item.allocatedBytes),'人工复核候选']);
  if(!images.size)row(nodes.images,['本次扫描范围内没有可显示镜像','','','']);
  const labels={'snapshot-limit':'快照条数上限','entry-limit':'归档条目上限','directory-limit':'目录扫描上限','image-limit':'单批镜像条数上限','depth-limit':'目录深度上限','time-limit':'本次扫描时间上限','read-error':'部分目录不可读','invalid-root':'归档目录不可读','unknown-limit':'部分结果未读取'};
  nodes.more.hidden=!nextCursor;
  nodes.status.textContent='清单核对：'+(data.observedAt?new Date(data.observedAt).toLocaleString('zh-CN'):'时间未确认')+' · 读取时的恢复入口：'+data.currentRecovery+' · 已读取 '+entriesScanned+' 个归档条目'+(nextCursor?' · 还有 '+(data.archiveScan?.entriesRemaining??'若干')+' 个条目，可加载下一批。':' · 本轮归档批次已读取完。')+(limits.size?' · 清单仍有缺口：'+[...limits].map(reason=>labels[reason]||labels['unknown-limit']).join('、')+'。':'')+(data.snapshotState==='unavailable'?' · 磁盘快照元数据暂不可读，不能据此判断快照不存在。':'');
 }catch(error){if(current===generation){nodes.error.textContent=error.message;nodes.status.textContent='本次读取失败；下方若有旧清单，仅供历史参考。'}}
 finally{clearTimeout(timer);if(current===generation){nodes.refresh.disabled=nodes.more.disabled=false;active=undefined}}
}
nodes.refresh.addEventListener('click',()=>refresh());nodes.more.addEventListener('click',()=>refresh(true));refresh();
</script></html>`;

// Keep the requested position when clear; otherwise find its nearest free gap.
export function chooseWidgetPlacement(image, controls, width, height) {
 const gap=12,bottom=height-64,w=image.width,h=image.height;
 if(![width,height,image.x,image.y,w,h].every(Number.isFinite)||w<=0||h<=0||w>width-2*gap||h>bottom-gap)return null;
 const maxX=width-w-gap,maxY=bottom-h,clamp=(v,lo,hi)=>Math.max(lo,Math.min(v,hi));
 const obstacles=controls.filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0);
 const clear=p=>!obstacles.some(r=>p.x<r.x+r.width+4&&p.x+w>r.x-4&&p.y<r.y+r.height+4&&p.y+h>r.y-4);
 const preferred={x:clamp(image.x,gap,maxX),y:clamp(image.y,gap,maxY)};
 if(clear(preferred))return preferred;
 // At a nearest free position, y is either the requested y or an obstacle edge.
 // Sweep those rows and their merged blocked x intervals, avoiding a pixel scan.
 const ys=new Set([preferred.y,gap,maxY]);
 for(const r of obstacles)for(const y of [r.y-h-4,r.y+r.height+4])if(y>=gap&&y<=maxY)ys.add(y);
 let best=null,distance=Infinity;
 const consider=(left,right,y)=>{
  if(left>right)return;
  const x=clamp(preferred.x,left,right),d=(x-image.x)**2+(y-image.y)**2;
  if(d<distance){best={x,y};distance=d}
 };
 for(const y of ys){
  const intervals=obstacles.filter(r=>y<r.y+r.height+4&&y+h>r.y-4)
   .map(r=>[r.x-w-4,r.x+r.width+4]).filter(([a,b])=>b>gap&&a<maxX).sort((a,b)=>a[0]-b[0]);
  let cursor=gap;
  for(const [start,end]of intervals){
   if(start>=cursor)consider(cursor,Math.min(start,maxX),y);
   cursor=Math.max(cursor,end);
   if(cursor>maxX)break;
  }
  if(cursor<=maxX)consider(cursor,maxX,y);
 }
 return best;
}

export function planPetDock(corner,width,height,artWidth,artHeight) {
 if(!['top-left','top-right','bottom-left','bottom-right'].includes(corner)||![width,height,artWidth,artHeight].every(Number.isFinite)||width<160||height<100||artWidth<=0||artHeight<=0)return null;
 const limit=Math.min(200,Math.max(56,width-360),height-24),scale=Math.min(1,limit/Math.max(artWidth,artHeight));
 const w=artWidth*scale,h=artHeight*scale,lane=Math.ceil(w+24),left=corner.endsWith('left');
 return{x:left?12:width-w-12,y:corner.startsWith('top')?12:height-h-12,width:w,height:h,lane,leftLane:left?lane:0,rootLimit:limit/.5945};
}

export function dragPetCorner(start,end,width,height) {
 if(!start||![start.x,start.y,start.width,start.height,start.pointerX,start.pointerY,end?.clientX,end?.clientY,width,height].every(Number.isFinite)||end.clientX===0&&end.clientY===0)return null;
 const dx=end.clientX-start.pointerX,dy=end.clientY-start.pointerY;
 // Original endDrag owns the 3px drag threshold, edge zones, flip and persistence.
 // Manual movement releases our explicit preset rather than adding another snapper.
 return dx*dx+dy*dy<9?null:'free';
}

export function installPluginPetPanel(onAction) {
 if(!document.getElementById('harness-plugin-pet-style')){
  const style=document.createElement('style');style.id='harness-plugin-pet-style';
  style.textContent='.harness-pet-recovery{margin:20px 0;padding:16px;border:1px solid #dce5f2;border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-text-primary,#24365a);font:13px/1.7 inherit}.harness-pet-recovery h4{margin:0 0 6px;font-size:14px}.harness-pet-recovery p{margin:6px 0;overflow-wrap:anywhere}.harness-pet-recovery-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.harness-pet-recovery button{font:inherit;padding:7px 12px;border:1px solid #c5d4e9;border-radius:8px;background:#f1f6ff;color:#254d85;cursor:pointer}.harness-pet-recovery button:disabled{opacity:.55;cursor:default}.harness-pet-recovery button:focus-visible{outline:3px solid #2459d8;outline-offset:2px}@media(max-width:700px){[data-plugin-detail] [data-plugin-row]>div{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center}[data-plugin-detail] [data-plugin-row]>div>:nth-child(1){grid-column:1;grid-row:1}[data-plugin-detail] [data-plugin-row]>div>:nth-child(2){grid-column:1/-1;grid-row:2;min-width:0!important;width:auto!important;overflow-wrap:anywhere}[data-plugin-detail] [data-plugin-row]>div>:nth-child(2)>*{white-space:normal!important;max-width:100%;overflow-wrap:anywhere}[data-plugin-detail] [data-plugin-row]>div>:nth-child(3){grid-column:2;grid-row:1}[data-plugin-detail] [data-plugin-row]>div>[role="switch"]{grid-column:3;grid-row:1;justify-self:end}}';
  document.head.appendChild(style);
 }
 let panel,status,show,reset;
 return state=>{
  const detail=document.querySelector('[data-plugin-detail="dsh-whale-widget"]');
  if(!detail){panel?.remove();panel=null;return}
  if(!panel||!detail.contains(panel)){
   panel?.remove();panel=document.createElement('section');panel.className='harness-pet-recovery';panel.id='harness-pet-recovery';panel.setAttribute('aria-label','桌宠显示与位置');
   const title=document.createElement('h4');title.textContent='桌宠显示与位置';panel.appendChild(title);
   const note=document.createElement('p');note.textContent='桌宠挡住内容或暂时看不见时，可在这里恢复。';panel.appendChild(note);
   status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');panel.appendChild(status);
   const actions=document.createElement('div');actions.className='harness-pet-recovery-actions';panel.appendChild(actions);
   show=document.createElement('button');show.type='button';show.textContent='显示桌宠';show.addEventListener('click',()=>onAction('show'));actions.appendChild(show);
   reset=document.createElement('button');reset.type='button';reset.textContent='重置位置';reset.addEventListener('click',()=>onAction('reset'));actions.appendChild(reset);
   const section=detail.querySelector('[data-plugin-rows]');let anchor=section;
   while(anchor&&anchor.parentElement!==detail)anchor=anchor.parentElement;
   detail.insertBefore(panel,anchor??null);
  }
  const position={'top-left':'左上','top-right':'右上','bottom-left':'左下','bottom-right':'右下',free:'自由'}[state.corner]||'自由';
  const text=!state.available?'桌宠未运行。请检查插件开关；已开启时刷新页面。':state.hidden?'桌宠暂时隐藏，可尝试显示或重置位置。':'桌宠已显示 · 位置：'+position;
  if(status.textContent!==text)status.textContent=text;
  show.disabled=reset.disabled=!state.available;
 };
}

export function installFloatingLayout(choose,planDock,dragCorner,mountPetPanel) {
 const root=document.getElementById('root');
 if(!root||!document.querySelectorAll||document.getElementById('harness-floating-layout'))return;
 const style=document.createElement('style');style.id='harness-floating-layout';
 style.textContent='#root{height:calc(100dvh - 56px)!important}body:after{content:"";position:fixed;left:0;right:0;bottom:0;height:55px;background:var(--dsw-alias-bg-base,#fff);border-top:1px solid var(--dsw-alias-border-l1,#e4ebf5);z-index:8000;pointer-events:none}#harness-vm-identity{left:12px!important;right:auto!important;bottom:8px!important;max-width:calc(100vw - 24px)!important}#harness-vm-identity:not([open]) summary{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#harness-vm-identity[open]{max-height:calc(100dvh - 32px);overflow:auto}:is(.dshwv-root,.dshwv-menu)[data-harness-occluded="true"]{opacity:0!important}:is(.dshwv-root,.dshwv-menu)[data-harness-occluded="true"],:is(.dshwv-root,.dshwv-menu)[data-harness-occluded="true"] *{pointer-events:none!important}';
 document.head.appendChild(style);
 style.textContent+=':is(.dshwv-pop)[data-harness-occluded="true"]{opacity:0!important;pointer-events:none!important}:is(.dshwv-pop)[data-harness-occluded="true"] *{pointer-events:none!important}';
 if(planDock)style.textContent+='#root{width:calc(100% - var(--harness-pet-lane,0px))!important;margin-left:var(--harness-pet-left-lane,0px)!important}#root .dshp-launch{right:calc(16px + var(--harness-pet-lane,0px) - var(--harness-pet-left-lane,0px))!important;bottom:calc(16px + var(--harness-pet-footer-inset,0px))!important}#harness-vm-identity{left:calc(12px + var(--harness-pet-left-lane,0px))!important;max-width:calc(100vw - 24px - var(--harness-pet-lane,0px))!important}';
 let pending=false,dragging=false,dragMoved=false,dragStart=null,corner='free',storageAvailable=true,pluginEnabled=true,componentEnabled=true;const writtenStyles=new WeakMap(),hiddenStates=new WeakMap();
 const corners=['top-left','top-right','bottom-left','bottom-right','free'];
 if(planDock)try{const saved=localStorage.getItem('harness-pet-corner-v1');if(corners.includes(saved))corner=saved}catch{storageAvailable=false}
 const setProperty=(node,key,value)=>{if(node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value)};
 const changeCorner=value=>{corner=value;try{localStorage.setItem('harness-pet-corner-v1',value)}catch{storageAvailable=false}schedule()};
 const renderPetPanel=mountPetPanel?.(action=>{dragging=false;dragMoved=false;dragStart=null;const summary=document.getElementById('harness-vm-identity');if(summary?.open)summary.open=false;changeCorner(action==='reset'?'bottom-right':'free')});
 const dockMenus=new WeakSet();
 const addDockMenu=()=>{
  if(!planDock)return;
  for(const menu of document.querySelectorAll('.dshwv-menu')){
   if(dockMenus.has(menu))continue;dockMenus.add(menu);
   const row=document.createElement('div');row.className='harness-pet-dock';row.style.cssText='padding:8px;display:flex;gap:4px;flex-wrap:wrap;border-top:1px solid #dce5f2';
   const label=document.createElement('span');label.textContent='位置';label.style.cssText='width:100%;font-size:12px';row.appendChild(label);
   for(const [value,text]of [['top-left','左上'],['top-right','右上'],['bottom-left','左下'],['bottom-right','右下'],['free','自由']]){
    const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',value==='free'?'桌宠自由拖动':'桌宠停靠'+text+'角');button.style.cssText='padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#24365a;cursor:pointer';
    button.addEventListener('click',()=>changeCorner(value));row.appendChild(button);
   }
   menu.appendChild(row);
  }
 };
 const setHidden=(surface,hidden)=>{
  if(hidden&&!hiddenStates.has(surface)){
   hiddenStates.set(surface,{inert:surface.getAttribute('inert'),ariaHidden:surface.getAttribute('aria-hidden')});
   if(surface.contains(document.activeElement)){
    const summary=document.getElementById('harness-vm-identity')?.querySelector('summary');
    if(summary)summary.focus({preventScroll:true});else document.activeElement?.blur();
   }
   surface.setAttribute('inert','');surface.setAttribute('aria-hidden','true');
  }else if(!hidden&&hiddenStates.has(surface)){
   const saved=hiddenStates.get(surface);
   for(const [name,value]of [['inert',saved.inert],['aria-hidden',saved.ariaHidden]]){
    if(value===null)surface.removeAttribute(name);else surface.setAttribute(name,value);
   }
   hiddenStates.delete(surface);
  }
  if(surface.getAttribute('data-harness-occluded')!==String(hidden))surface.setAttribute('data-harness-occluded',String(hidden));
 };
 const update=()=>{
  pending=false;
  addDockMenu();
  const widget=document.querySelector('.dshwv-root'),img=widget?.querySelector('.dshwv-img');
  const pluginSwitch=document.querySelector('[role="switch"][aria-label="Enable dsh-whale-widget"]'),componentSwitch=document.querySelector('[role="switch"][aria-label="Enable component dsh-whale-widget"]');
  if(pluginSwitch)pluginEnabled=pluginSwitch.getAttribute('aria-checked')!=='false';
  if(componentSwitch&&pluginEnabled)componentEnabled=componentSwitch.getAttribute('aria-checked')!=='false';
  if(!widget||!img||!pluginEnabled||!componentEnabled){if(widget)setHidden(widget,true);for(const menu of document.querySelectorAll('.dshwv-menu'))setHidden(menu,true);renderPetPanel?.({available:false,hidden:true,corner});if(planDock)for(const node of [root,document.getElementById('harness-vm-identity')].filter(Boolean)){setProperty(node,'--harness-pet-lane','0px');setProperty(node,'--harness-pet-left-lane','0px');setProperty(node,'--harness-pet-footer-inset','0px')}return}
  // The original plugin can end a gesture itself (lost mouse-up, long press,
  // menu interaction). Its class is authoritative; never leave our guard stuck.
  if(dragging){if(widget.classList?.contains('dshwv-dragging'))return;dragging=false;dragMoved=false;dragStart=null}
  const measure=()=>{
   const paint=img.getBoundingClientRect(),box=widget.getBoundingClientRect(),art=getComputedStyle(img),css=getComputedStyle(widget);
   const width=parseFloat(art.width),height=parseFloat(art.height),rootWidth=parseFloat(css.width),rootHeight=parseFloat(css.height);
   if([width,height,rootWidth,rootHeight].every(n=>Number.isFinite(n)&&n>0)&&art.display!=='none'){
    const originX=Number.isFinite(parseFloat(widget.style.left))?parseFloat(widget.style.left):box.left,originY=Number.isFinite(parseFloat(widget.style.top))?parseFloat(widget.style.top):box.top;
    const flipped=widget.classList?.contains('dshwv-left')??false,x=originX+(flipped?0:rootWidth-width),y=originY+rootHeight-height;
    return{x,y,left:x,top:y,right:x+width,bottom:y+height,width,height,originX,originY,rootWidth,flipped};
   }
   return{x:paint.x,y:paint.y,left:paint.left,top:paint.top,right:paint.right,bottom:paint.bottom,width:paint.width,height:paint.height,originX:box.left,originY:box.top,rootWidth:box.width,flipped:false};
  };
  let geometry=measure(),dock=planDock?.(corner,innerWidth,innerHeight,geometry.width,geometry.height);
  if(planDock){
   for(const node of [root,document.getElementById('harness-vm-identity')].filter(Boolean)){
    setProperty(node,'--harness-pet-lane',(dock?.lane??0)+'px');setProperty(node,'--harness-pet-left-lane',(dock?.leftLane??0)+'px');
    setProperty(node,'--harness-pet-footer-inset',dock?'56px':'0px');
   }
   const limit=dock?dock.rootLimit+'px':'';
   if(widget.style.maxWidth!==limit)widget.style.maxWidth=limit;
   if(widget.style.maxHeight!==limit)widget.style.maxHeight=limit;
   geometry=measure();dock=planDock(corner,innerWidth,innerHeight,geometry.width,geometry.height);
   widget.setAttribute('data-harness-corner',dock?corner:'free');
   for(const menu of document.querySelectorAll('.dshwv-menu'))for(const row of menu.querySelectorAll('.harness-pet-dock')){
    const label=row.querySelector('span');const text='位置：'+({'top-left':'左上','top-right':'右上','bottom-left':'左下','bottom-right':'右下',free:'自由'}[corner])+(storageAvailable?'':'（仅本页）');if(label&&label.textContent!==text)label.textContent=text;
    for(const button of row.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.getAttribute('aria-label')===(corner==='free'?'桌宠自由拖动':'桌宠停靠'+{'top-left':'左上','top-right':'右上','bottom-left':'左下','bottom-right':'右下'}[corner]+'角')));
   }
  }
  const image=geometry;if(image.width<=0||image.height<=0){setHidden(widget,true);for(const menu of document.querySelectorAll('.dshwv-menu'))setHidden(menu,true);renderPetPanel?.({available:true,hidden:true,corner});return}
  const bounds={x:image.left,y:image.top,width:image.width,height:image.height};
  const controls=[];
  for(const el of document.querySelectorAll('button,input,textarea,select,a[href],summary,[role="switch"],[role="checkbox"],[role="combobox"],[role="menuitem"],[role="button"],[role="tab"],[role="treeitem"],[contenteditable="true"]')){
   if(el.closest('#harness-vm-identity,[class*="dshwv-"]'))continue;
   const r=el.getBoundingClientRect();
   if(r.width>0&&r.height>0&&r.x<innerWidth&&r.y<innerHeight-(dock?0:56)&&r.right>0&&r.bottom>0&&getComputedStyle(el).visibility==='visible')controls.push({x:r.x,y:r.y,width:r.width,height:r.height});
  }
  const overlaps=(r,c)=>r.left<c.x+c.width+4&&r.right>c.x-4&&r.top<c.y+c.height+4&&r.bottom>c.y-4;
  const dockBlocked=dock&&controls.some(c=>overlaps({left:dock.x,right:dock.x+dock.width,top:dock.y,bottom:dock.y+dock.height},c));
  const placement=document.getElementById('harness-vm-identity')?.open||dockBlocked?null:dock??choose({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height},controls,innerWidth,innerHeight);
  const hidden=placement===null;
  setHidden(widget,hidden);
  renderPetPanel?.({available:true,hidden,corner});
  for(const menu of document.querySelectorAll('.dshwv-menu'))setHidden(menu,hidden||!menu.classList.contains('dshwv-menu-open'));
  if(placement){
   const dx=placement.x-bounds.x,dy=placement.y-bounds.y;
   if(Math.abs(dx)>.5||Math.abs(dy)>.5){
    Object.assign(widget.style,{left:(image.originX+dx)+'px',top:(image.originY+dy)+'px',right:'auto',bottom:'auto'});
    writtenStyles.set(widget,widget.getAttribute('style'));
   }
  }
  // Bubble geometry is independent: opening a balance bubble must not move the
  // pet or silently hide the result. Prefer a gap, then use the native overlay.
  const anchor=measure();
  for(const popup of widget.querySelectorAll('.dshwv-pop.dshwv-pop-open')){
   setHidden(popup,false);
   const css=getComputedStyle(popup),r=popup.getBoundingClientRect(),width=parseFloat(css.width)||r.width,height=parseFloat(css.height)||r.height;
   if(!(width>0&&height>0))continue;
   const x=anchor.originX+(anchor.flipped?anchor.rootWidth-width:0),y=anchor.originY;
   const target=choose({x,y,width,height},controls,innerWidth,innerHeight)??{x:Math.max(8,Math.min(x,innerWidth-width-8)),y:Math.max(8,Math.min(y,innerHeight-height-8))};
   const left=(anchor.flipped?anchor.originX+anchor.rootWidth-target.x-width:target.x-anchor.originX)+'px',top=(target.y-anchor.originY)+'px';
   if(popup.style.left!==left)popup.style.left=left;if(popup.style.top!==top)popup.style.top=top;
   writtenStyles.set(popup,popup.getAttribute('style'));
  }
  if(dock)for(const menu of document.querySelectorAll('.dshwv-menu'))if(menu.classList.contains('dshwv-menu-open')){
   menu.style.maxWidth=(innerWidth-16)+'px';menu.style.maxHeight=(innerHeight-16)+'px';menu.style.overflowY='auto';
   const r=menu.getBoundingClientRect(),x=corner.endsWith('left')?12:innerWidth-r.width-12,y=corner.startsWith('top')?12+dock.height+8:innerHeight-dock.height-r.height-20;
   Object.assign(menu.style,{left:Math.max(8,Math.min(x,innerWidth-r.width-8))+'px',top:Math.max(8,Math.min(y,innerHeight-r.height-8))+'px',right:'auto',bottom:'auto'});
   writtenStyles.set(menu,menu.getAttribute('style'));
  }
 };
 const schedule=()=>{if(!pending){pending=true;setTimeout(update,100)}};
 if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{
  if(records.some(r=>r.attributeName==='open'||(!r.target.closest?.('#harness-vm-identity')&&!(r.attributeName==='style'&&writtenStyles.get(r.target)===r.target.getAttribute?.('style')))))schedule();
 }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','open','aria-checked']});
 if(typeof ResizeObserver!=='undefined'){const sizes=new ResizeObserver(schedule);sizes.observe(root)}
 window.addEventListener('resize',schedule);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',schedule);document.addEventListener('scroll',schedule,true);
 const ownsPointer=event=>dragging&&dragStart&&event.pointerId===dragStart.pointerId;
 const nativeDragging=()=>document.querySelector('.dshwv-root')?.classList?.contains('dshwv-dragging')===true;
 const finishDrag=(event,commit)=>{
  if(!ownsPointer(event))return;
  if(commit&&dragMoved&&dragStart.nativeAccepted&&dragCorner&&Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&(event.clientX!==0||event.clientY!==0))changeCorner('free');
  dragStart=null;dragging=false;dragMoved=false;schedule();
 };
 document.addEventListener('pointerdown',event=>{
  if(dragging||event.isPrimary===false||event.button!==undefined&&event.button!==0||!event.target.closest?.('.dshwv-img'))return;
  const r=document.querySelector('.dshwv-img')?.getBoundingClientRect();
  if(r){
   dragging=true;dragMoved=false;dragStart={x:r.x,y:r.y,width:r.width,height:r.height,pointerX:event.clientX,pointerY:event.clientY,pointerId:event.pointerId,nativeAccepted:false};
   schedule();
  }
 },true);
 document.addEventListener('pointermove',event=>{
  if(!ownsPointer(event))return;
  if(event.buttons===0){finishDrag(event,true);return}
  // Only a movement accepted by the original plugin is a drag. Its cursor
  // handler may remove this class before our buttons=0 callback on return.
  if(!nativeDragging()){finishDrag(event,false);return}
  dragStart.nativeAccepted=true;
  const dx=event.clientX-dragStart.pointerX,dy=event.clientY-dragStart.pointerY;if(dx*dx+dy*dy>=9)dragMoved=true;
 },true);
 document.addEventListener('pointerup',event=>finishDrag(event,true),true);
 document.addEventListener('pointercancel',event=>finishDrag(event,false),true);
 document.addEventListener('lostpointercapture',schedule,true);
 schedule();
}

// Identical local status UI for both guest versions; no guest source patch or runtime control.
export const ENVIRONMENT_BANNER = `(() => {
 if (document.getElementById('harness-vm-identity')) return;
 const box=document.createElement('details');box.id='harness-vm-identity';
 Object.assign(box.style,{position:'fixed',right:'16px',bottom:'16px',zIndex:'99990',maxWidth:'min(460px,calc(100vw - 32px))',font:'12px/1.7 "Avenir Next","PingFang SC",sans-serif',background:'#fff',color:'#293e5d',border:'1px solid #dce5f2',borderRadius:'12px',boxShadow:'0 5px 24px #18366b14',overflowWrap:'anywhere',colorScheme:'light'});
 const title=document.createElement('summary');title.textContent='VM · 正在核对运行版本';box.appendChild(title);
 const info=document.createElement('div');info.style.whiteSpace='pre-line';box.appendChild(info);
 const refresh=document.createElement('button');refresh.textContent='刷新版本状态';refresh.type='button';box.appendChild(refresh);
 const health=document.createElement('a');health.href='/__harness/health';health.textContent='连接诊断';health.style.marginLeft='12px';box.appendChild(health);const recoveries=document.createElement('a');recoveries.href='/__harness/recovery';recoveries.textContent='恢复点管理';recoveries.style.marginLeft='12px';box.appendChild(recoveries);const appearance=document.createElement('style');appearance.textContent='#harness-vm-identity{overflow:hidden}#harness-vm-identity summary{list-style:none;padding:10px 14px;cursor:pointer;font-size:11px;font-weight:600;display:flex;align-items:center;gap:9px}#harness-vm-identity summary::-webkit-details-marker{display:none}#harness-vm-identity summary:before{content:\"VM\";font:700 9px/1.6 Menlo,monospace;color:#315b9f;background:#eaf1ff;border:1px solid #d6e3fc;border-radius:5px;padding:2px 5px}#harness-vm-identity summary:after{content:\"⌃\";margin-left:auto;color:#6b7e99;transform:rotate(180deg)}#harness-vm-identity[open] summary:after{transform:none}#harness-vm-identity[open] summary{border-bottom:1px solid #e4ebf5;background:#f8faff}#harness-vm-identity>div{padding:14px 16px;font-size:11px;line-height:1.9;color:#576c87}#harness-vm-identity button{appearance:none;margin:0 0 14px 16px;padding:6px 11px;background:#eef4ff;border:1px solid #ccdbf7;border-radius:7px;color:#2d5596;font-family:inherit;font-size:11px;font-weight:600;line-height:1.5;cursor:pointer}#harness-vm-identity button:disabled{opacity:.55}#harness-vm-identity a{font-size:11px;color:#315b9f;text-underline-offset:3px}#harness-vm-identity :is(summary,button,a):focus-visible{outline:3px solid #2459d8;outline-offset:-3px}';box.appendChild(appearance);document.body.appendChild(box);
 const clock=()=>({mono:performance.now(),wall:Date.now()});
 const elapsed=stamp=>{if(!stamp)return Infinity;const mono=performance.now()-stamp.mono,wall=Date.now()-stamp.wall;return mono<0||wall<0?Infinity:Math.max(mono,wall)};
 let latest,checkedClock,attemptClock,expiry,detail='',busy=false,failed=false;
 function render(){
  const age=elapsed(checkedClock),seconds=Math.floor(age/1000),label=!Number.isFinite(age)?'核对时间已变化':seconds<10?'刚刚核对':seconds<60?seconds+' 秒前核对':Math.floor(seconds/60)+' 分钟前核对';
  if(!latest){title.textContent=failed?'VM · 版本状态暂时不可用':'VM · 正在核对运行版本';return}
  const mode={original:'完整原版',improved:'改进版',unknown:'版本未验证'}[latest.mode]||'版本未验证';
  const coverage={matches:'已覆盖程序、工具和配置',older:'存在未覆盖或已变更项',missing:'未建立',invalid:'校验失败'}[latest.recovery?.state]||'未验证';
  title.textContent=busy?'VM · 正在重新核对 · '+label:failed?'VM · 状态核对失败 · '+label:age>=60000?'VM · '+mode+' · 状态待重新核对 · '+label:'VM · '+mode+' · 恢复点：'+coverage+' · '+label;
  info.textContent=detail+'\\n核对有效期：60 秒；过期后需重新核对。'+(failed?'\\n本次核对失败，上次结果仅供参考；请确认 VM 已启动后刷新。':'');
 }
 async function update(){
  if(busy)return;busy=true;attemptClock=clock();refresh.disabled=true;render();
  const controller=new AbortController();let rejectAbort;
  const abort=()=>rejectAbort?.(Error('status cancelled'));
  const timer=setTimeout(()=>controller.abort(),11000);
  controller.signal.addEventListener('abort',abort,{once:true});
  try{
  const cancelled=new Promise((_,reject)=>{rejectAbort=reject});
  const data=await Promise.race([cancelled,(async()=>{const response=await fetch('/__harness/environment',{headers:{'x-harness-local':'1'},cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('unavailable');return response.json()})()]);
  latest=data;checkedClock=clock();failed=false;clearTimeout(expiry);expiry=setTimeout(render,60000);expiry?.unref?.();
  if(data.mode==='improved')(${installFloatingLayout.toString()})(${chooseWidgetPlacement.toString()},${planPetDock.toString()},${dragPetCorner.toString()},${installPluginPetPanel.toString()});
  detail='配置目录：'+data.configDir+'\\nHarness 安装包版本：'+(data.runtimePackageVersion||'未确认')+'\\n恢复点（程序、工具和配置）：'+(data.recovery?.name||'无')+(data.recovery?.createdAt?'\\n建立时间：'+new Date(data.recovery.createdAt).toLocaleString('zh-CN'):'')+'\\n运行状态核对：'+new Date(data.observedAt).toLocaleTimeString('zh-CN')+'\\n'+Object.entries({program:'改进版程序',runtime:'核心运行时',tools:'工具',config:'配置',plugins:'已导入插件'}).map(([key,label])=>label+'：'+({matches:'已覆盖',older:'未覆盖最新',missing:'未建立',uncovered:'未纳入核对'}[data.recovery?.groups?.[key]?.state]||'未验证')).join('；')+(data.recovery?.uncoveredFiles?.length?'\\n未覆盖文件：'+data.recovery.uncoveredFiles.join('、'):'')+(data.recovery?.differentFiles?.length?'\\n变更文件：'+data.recovery.differentFiles.join('、')+(data.recovery.differenceDetailsTruncated?'（仅显示部分）':''):'')+(data.recovery?.launchAgentsMatch===false?'\\n宿主启动配置与恢复点不同。':'')+(data.recovery?.state==='older'?'\\n建议：先确认改动来源，再建立新恢复点；不会自动覆盖文件。':'')+'\\n覆盖仅指所列文件，不代表之后新增的数据已备份。'+(data.modeFileMatches?'':'\\n版本标记与实际进程不一致，请检查启动入口。');
 }catch{failed=true;if(!latest)info.textContent='无法核对实际进程，请确认 VM 已启动后刷新。';}
 finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);busy=false;refresh.disabled=false;render()}}
 const returned=()=>{render();if(document.visibilityState!=='hidden'&&!busy&&elapsed(attemptClock)>=5000)update()};
 refresh.addEventListener('click',update);window.addEventListener('focus',returned);document.addEventListener?.('visibilitychange',returned);
 const aging=setInterval(render,10000);aging?.unref?.();update();
})();`

export function createDiagnostics() {
  const recent = [], layers = {}, stamps = {}, active = { websocket: 0, sse: 0 }; let eventId = 0
  const observe = (key,item) => { const wall=Date.now();stamps[key]={wall,mono:performance.now()};layers[key]={...item,observedAt:item.observedAt||new Date(wall).toISOString()} }
  const category = url => {
    const route = String(url).split('?', 1)[0]
    if (route === '/') return 'index'
    for (const [prefix, name] of [['/assets/', 'assets'], ['/plugins/', 'assets'], ['/api/', 'api'], ['/redteam/', 'redteam'], ['/dsh-purge/', 'purge']]) {
      if (route.startsWith(prefix)) return name
    }
    return 'other'
  }
  return {
    begin(url, method) {
      return { category: category(url), method: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method) ? method : 'OTHER', started: performance.now() }
    },
    headers(request, status, queuedMs) {
      const item = { category: request.category, method: request.method, state: 'receiving', phase: 'headers', status, responseMs: Math.round(performance.now() - request.started), queuedMs: Math.round(queuedMs || 0) }
      observe(request.category,item)
      observe('transport',{ state: 'ok', phase: 'headers', responseMs: item.responseMs })
    },
    finish(request, status, error, queuedMs, phase = 'complete') {
      const state = error ? (['deadline', 'body-timeout'].includes(error) ? 'timeout' : error === 'client-cancelled' ? 'cancelled' : 'connection-error')
        : status === 401 ? 'auth-required' : status === 403 ? 'denied' : status >= 400 ? 'http-error' : 'ok'
      const item = { eventId: ++eventId, observedAt: new Date().toISOString(), category: request.category, method: request.method, state, phase, responseMs: Math.round(performance.now() - request.started), queuedMs: Math.round(queuedMs || 0) }
      if (status !== undefined) item.status = status
      if (error) item.error = error
      observe(request.category,item)
      observe('transport',{ state: error ? item.state : 'ok', responseMs: item.responseMs })
      recent.push(item)
      if (recent.length > 100) recent.shift()
    },
    stream(kind, socket) {
      active[kind]++
      observe(kind,{ state: 'connected' })
      socket.once('close', () => { active[kind]--; observe(kind,{ state: active[kind] ? 'connected' : 'closed' }) })
    },
    streamFailure(kind) { if (!active[kind]) observe(kind,{ state: 'connection-error' }) },
    snapshot() {
      const wall=Date.now(),mono=performance.now(),observed={};
      for(const [key,item]of Object.entries(layers)){
        const stamp=stamps[key],dw=wall-stamp.wall,dm=mono-stamp.mono,age=dw<0||dm<0?Infinity:Math.max(dw,dm),live=(key==='websocket'||key==='sse')&&active[key]>0;
        observed[key]={...item,ageMs:Number.isFinite(age)?Math.round(age):null,stale:!Number.isFinite(age)||!live&&age>=60000,live};
      }
      return {observedAt:new Date(wall).toISOString(),layers:{entry:{state:'ok',observedAt:new Date(wall).toISOString(),ageMs:0,stale:false,live:true},...observed},active:{...active},recent:[...recent]}
    },
  }
}
