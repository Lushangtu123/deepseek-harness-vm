import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,readSync,readFileSync,lstatSync,fstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

export const SECURITY_RUNTIME_ROOT='/home/purge/tools/security-workbench';
const TOOLS=['semgrep','trivy','zap'];
const HASH=/^[a-f0-9]{64}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const VERSION=/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;

function ordinary(root,name,maxBytes){
 const file=join(root,name);
 if(realpathSync(root)!==root||realpathSync(file)!==file)throw Error('unsafe runtime path');
 const info=lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>maxBytes)throw Error('invalid runtime file');
 return{file,info};
}
function small(root,name,maxBytes){
 const {file}=ordinary(root,name,maxBytes),fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{if(fstatSync(fd).size>maxBytes)throw Error('runtime file changed');const raw=readFileSync(fd);if(raw.length>maxBytes)throw Error('runtime file changed');return raw}finally{closeSync(fd)}
}
export function readRuntimeManifest(root=SECURITY_RUNTIME_ROOT){
 const value=JSON.parse(small(resolve(root),'images.json',128*1024));
 if(value?.schemaVersion!==1||!Array.isArray(value.tools)||value.tools.length!==3)throw Error('invalid manifest');
 if(!HASH.test(value.rulesSha256||''))throw Error('invalid rules identity');
 for(const tool of TOOLS){
  const rows=value.tools.filter(row=>row?.tool===tool),row=rows[0];
  if(rows.length!==1||!IMAGE.test(row.imageId||'')||row.imageRef!=='personal-security/'+tool+'@'+row.imageId||!VERSION.test(row.version||''))throw Error('invalid pinned image');
 }
 return value;
}
function hashDatabase(root,expected){
 if(!HASH.test(expected?.fileSha256||'')||!Number.isSafeInteger(expected.fileBytes)||expected.fileBytes<4096||expected.fileBytes>2*1024**3)throw Error('数据库完整性摘要未登记');
 const {file,info}=ordinary(root,'cache/db/trivy.db',2*1024**3);
 if(info.size!==expected.fileBytes)throw Error('漏洞数据库大小不匹配');
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW),hash=createHash('sha256'),buffer=Buffer.alloc(512*1024),deadline=performance.now()+8000;
 try{
  const before=fstatSync(fd);let bytes=0,count;
  while((count=readSync(fd,buffer,0,buffer.length,null))>0){bytes+=count;hash.update(buffer.subarray(0,count));if(performance.now()>deadline||bytes>expected.fileBytes)throw Error('漏洞数据库校验未完成')}
  const after=fstatSync(fd);
  if(bytes!==expected.fileBytes||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||hash.digest('hex')!==expected.fileSha256)throw Error('漏洞数据库摘要不匹配');
 }finally{closeSync(fd)}
}
export function inspectLocalImages(refs){
 const args=['-n','/usr/bin/docker','image','inspect','--format','{{.Id}} {{.Architecture}} {{.Os}}',...refs];let output;
 try{output=execFileSync('/usr/bin/sudo',args,{encoding:'utf8',timeout:2500,maxBuffer:64*1024,stdio:['ignore','pipe','pipe']})}
 catch(error){if(error.status!==1||!error.stdout)return{available:false,images:[]};output=String(error.stdout)}
 const images=output.trim().split('\n').filter(Boolean).map(line=>{const [id,architecture,os,...extra]=line.trim().split(/\s+/);if(!IMAGE.test(id)||extra.length)throw Error('invalid Docker reply');return{id,architecture,os}});
 return{available:true,images};
}
function identity(root){
 return ['images.json','rules.json','cache/db/trivy.db','cache/db/metadata.json','last-db-update.json'].map(name=>{
  try{const {info}=ordinary(root,name,2*1024**3);return[name,info.ino,info.size,info.mtimeMs,info.ctimeMs]}
  catch{return[name,'unavailable']}
 }).map(row=>row.join(':')).join('|');
}
function timestamp(value){
 if(typeof value!=='string')return NaN;
 const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!parts)return NaN;
 const [,year,month,day,hour,minute,second,zone]=parts,n=Number;
 const calendar=new Date(0);calendar.setUTCFullYear(n(year),n(month),0);
 if(n(month)<1||n(month)>12||n(day)<1||n(day)>calendar.getUTCDate()||n(hour)>23||n(minute)>59||n(second)>59||(zone!=='Z'&&(n(zone.slice(1,3))>23||n(zone.slice(4))>59)))return NaN;
 return Date.parse(value);
}
export function createRuntimeInspector({root=SECURITY_RUNTIME_ROOT,now=Date.now,inspectImages=inspectLocalImages}={}){
 root=resolve(root);let last;
 return{read({force=false,maintenanceValidation=false}={}){
  // Read this before the cache: an interrupted update must never inherit ready evidence.
  let maintenance=false;
  try{lstatSync(join(root,'maintenance.json'));maintenance=true}catch(error){maintenance=error.code!=='ENOENT'}
  if(maintenance&&!maintenanceValidation){const checkedAt=new Date(now()).toISOString();return Object.fromEntries(TOOLS.map(tool=>[tool,{ready:false,version:null,reason:'漏洞库维护尚未完成，请从Mac启动器检查或恢复',warning:null,checkedAt,cached:false}]))}
  const at=now(),key=identity(root);
  if(!force&&last&&last.key===key&&at>=last.at&&at-last.at<30000)return Object.fromEntries(TOOLS.map(tool=>[tool,{...last.value[tool],cached:true}]));
  const checkedAt=new Date(at).toISOString(),value=Object.fromEntries(TOOLS.map(tool=>[tool,{ready:false,version:null,reason:'运行清单缺失、结构无效或路径不安全',warning:null,checkedAt,cached:false}]));
  let manifest;
  try{manifest=readRuntimeManifest(root)}catch{return value}
  let observed;
  try{observed=inspectImages(manifest.tools.map(row=>row.imageId));if(!observed||!Array.isArray(observed.images))throw Error('invalid inspector reply')}
  catch{observed={available:false,images:[]}}
  for(const tool of TOOLS){
   const pin=manifest.tools.find(row=>row.tool===tool),image=observed.images.find(row=>row.id===pin.imageId),entry=value[tool];entry.version=pin.version;
   entry.ready=observed.available===true&&image?.architecture==='arm64'&&image.os==='linux';
   entry.reason=entry.ready?null:observed.available?'本地镜像未找到、架构或摘要不匹配':'Docker状态未确认，未验证本地镜像';
  }
  try{
   const raw=small(root,'rules.json',1024*1024);if(createHash('sha256').update(raw).digest('hex')!==manifest.rulesSha256)throw Error('rules changed');
   const rules=JSON.parse(raw).rules,ids=new Set(),languages=new Set();
   if(!Array.isArray(rules)||rules.length<1||rules.length>1000)throw Error('invalid rule list');
   for(const rule of rules){if(!rule||typeof rule.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(rule.id)||ids.has(rule.id)||!Array.isArray(rule.languages)||!rule.languages.length||rule.languages.some(language=>!['python','javascript','typescript'].includes(language)))throw Error('invalid rule identity');ids.add(rule.id);rule.languages.forEach(language=>languages.add(language))}
   value.semgrep.rules={version:typeof manifest.rulesVersion==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(manifest.rulesVersion)?manifest.rulesVersion:'未登记',count:rules.length,languages:[...languages].sort()};
  }
  catch{value.semgrep.ready=false;value.semgrep.reason='本地规则缺失、不安全或摘要不匹配'}
  const trivy=value.trivy;trivy.database={state:'unknown',updatedAt:null,nextUpdate:null,ageDays:null};
  try{const update=JSON.parse(small(root,'last-db-update.json',16384));if(['current','updated','rolled-back'].includes(update.state)&&Number.isFinite(timestamp(update.checkedAt)))trivy.lastUpdate={state:update.state,checkedAt:update.checkedAt}}catch{}
  try{
   const metadata=JSON.parse(small(root,'cache/db/metadata.json',16384)),expected=manifest.database?.metadata,updated=timestamp(metadata.UpdatedAt),next=timestamp(metadata.NextUpdate);
   if(metadata.Version!==2||!Number.isFinite(updated)||!Number.isFinite(next)||next<=updated||updated>at+300000||!expected||['Version','UpdatedAt','NextUpdate'].some(key=>expected[key]!==metadata[key]))throw Error('漏洞库元数据无效、不一致或时间超前');
   const ageDays=Math.floor(Math.max(0,at-updated)/86400000),state=at-updated>7*86400000?'stale':'fresh';
   trivy.database={state,updatedAt:new Date(updated).toISOString(),nextUpdate:new Date(next).toISOString(),ageDays};
   hashDatabase(root,manifest.database);
   if(state==='stale')trivy.warning='漏洞库已超过7天，结果不包含之后的漏洞信息；建议更新';
  }catch(error){trivy.ready=false;trivy.reason=/^(?:漏洞|数据库)/.test(error.message)?error.message:'漏洞数据库缺失、路径不安全或未能完成校验';trivy.database.state='unknown'}
  last={at,key,value};return value;
 }};
}
