import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const moduleUrl=new URL('../package/lib/redteam/personal-security-auth.mjs',import.meta.url);
async function api(){assert.ok(fs.existsSync(moduleUrl),'Private ZAP session adapter is missing');return import(moduleUrl)}
const session=(extra={})=>({version:1,revision:'879b1b08-0a7d-4f84-9f1d-d50cb7f94072',origin:'http://127.0.0.1:15000',header:'Cookie',value:'sid=AUTH_CANARY_'+ 'X'.repeat(32),verifyPath:'/account',loggedInMarker:'HARNESS_AUTHENTICATED',excludePaths:['/logout'],expiresAt:new Date(Date.now()+600000).toISOString(),...extra});
function fixture(value=session()){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'harness-private-session-'))),file=path.join(root,'local-login.json');fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});return{root,file,value,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('Private session reader accepts only an owner-private profile bound to its exact loopback origin',async()=>{
 const {readZapAuthProfile}=await api(),f=fixture();try{
  const value=readZapAuthProfile('local-login','http://127.0.0.1:15000',{root:f.root});assert.equal(value.header,'Cookie');assert.equal(value.value,f.value.value);assert.equal(value.revision,f.value.revision);
  assert.throws(()=>readZapAuthProfile('local-login','http://127.0.0.1:15001',{root:f.root}));
  assert.throws(()=>readZapAuthProfile('../local-login','http://127.0.0.1:15000',{root:f.root}));
  fs.chmodSync(f.file,0o644);assert.throws(()=>readZapAuthProfile('local-login',f.value.origin,{root:f.root}));
 }finally{f.close()}
});

test('Session verification makes one anonymous and one authenticated local request and returns no credential',async()=>{
 const {verifyZapSession,readZapAuthProfile}=await api();assert.equal(typeof verifyZapSession,'function','Session verification is missing');
 const http=await import('node:http'),seen=[],credential='sid=AUTH_CANARY_'+ 'Y'.repeat(32),server=http.createServer((req,res)=>{seen.push({path:req.url,cookie:req.headers.cookie??null});res.writeHead(req.headers.cookie===credential?200:401,{'Content-Type':'text/plain'});res.end(req.headers.cookie===credential?'HARNESS_AUTHENTICATED':'LOGIN_REQUIRED')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,f=fixture(session({origin,value:credential}));
 try{const result=await verifyZapSession(readZapAuthProfile('local-login',origin,{root:f.root}));assert.equal(result.verified,true);assert.deepEqual(seen,[{path:'/account',cookie:null},{path:'/account',cookie:credential}]);assert.ok(!JSON.stringify(result).includes('AUTH_CANARY'))}finally{await new Promise(resolve=>server.close(resolve));f.close()}
});

test('Private profiles normalize expiry and logout prefixes consistently with the ZAP hook',async()=>{
 const {readZapAuthProfile}=await api();
 for(const verifyPath of ['/logout','/logout/child']){const f=fixture(session({verifyPath,excludePaths:['/logout/']}));try{assert.throws(()=>readZapAuthProfile('local-login',f.value.origin,{root:f.root}),'Excluded logout route must not be probed')}finally{f.close()}}
});

test('Private profiles normalize expiry to the Python hook ISO format',async()=>{
 const {readZapAuthProfile}=await api();
 const expiry=new Date(Date.now()+600000).toUTCString(),f=fixture(session({expiresAt:expiry,excludePaths:['/logout/']}));try{const value=readZapAuthProfile('local-login',f.value.origin,{root:f.root});assert.equal(value.expiresAt,new Date(expiry).toISOString());assert.deepEqual(value.excludePaths,['/logout'])}finally{f.close()}
});

test('Private session files reject symlinks, hardlinks, oversized content and unsafe credential or verification fields',async()=>{
 const {readZapAuthProfile}=await api();
 for(const value of [session({value:'sid=short'}),session({value:'sid=TOKEN_CANARY_123456789\r\nX-Escape: value'}),session({header:'Host'}),session({origin:'https://remote.invalid'}),session({verifyPath:'/a/../b'}),session({verifyPath:'//other'}),session({expiresAt:'2000-01-01T00:00:00Z'}),session({extra:'forbidden'}),session({loggedInMarker:'a'.repeat(129)})]){const f=fixture(value);try{assert.throws(()=>readZapAuthProfile('local-login',value.origin,{root:f.root}),error=>error.code==='AUTH_PROFILE'&&!error.message.includes('CANARY'))}finally{f.close()}}
 for(const mode of ['symlink','hardlink','oversized','directory']){const f=fixture();try{if(mode==='symlink'){fs.renameSync(f.file,f.file+'.real');fs.symlinkSync(f.file+'.real',f.file)}if(mode==='hardlink')fs.linkSync(f.file,f.file+'.other');if(mode==='oversized')fs.writeFileSync(f.file,' '.repeat(8193));if(mode==='directory')fs.chmodSync(f.root,0o755);assert.throws(()=>readZapAuthProfile('local-login',f.value.origin,{root:f.root}))}finally{f.close()}}
});
test('Anonymous markers, redirects and oversized responses cannot confirm authentication or forward credentials',async()=>{
 const {verifyZapSession}=await api(),http=await import('node:http');let sinkHits=0;const sink=http.createServer((req,res)=>{sinkHits++;res.end('HARNESS_AUTHENTICATED')});await new Promise(r=>sink.listen(0,'127.0.0.1',r));
 try{for(const mode of ['public-marker','redirect','oversized','invalid-session']){let requests=[];const server=http.createServer((req,res)=>{requests.push(req.headers.cookie??null);if(mode==='redirect'){res.writeHead(302,{Location:'http://127.0.0.1:'+sink.address().port+'/account'});res.end()}else if(mode==='oversized')res.end('x'.repeat(65537));else if(mode==='public-marker')res.end('HARNESS_AUTHENTICATED');else{res.writeHead(401);res.end('LOGIN_REQUIRED')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await assert.rejects(verifyZapSession(session({origin:'http://127.0.0.1:'+server.address().port})),error=>error.code==='AUTH_VERIFY'&&!error.message.includes('CANARY'));if(mode==='public-marker'||mode==='oversized')assert.deepEqual(requests,[null]);assert.equal(sinkHits,0)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}}}finally{await new Promise(r=>sink.close(r))}
});
test('Verification timeout and cancellation stop pending local requests without leaking session values',async()=>{
 const {verifyZapSession}=await api(),http=await import('node:http');let hits=0;const server=http.createServer(()=>{hits++});await new Promise(r=>server.listen(0,'127.0.0.1',r));const auth=session({origin:'http://127.0.0.1:'+server.address().port});try{
  const pre=new AbortController();pre.abort();await assert.rejects(verifyZapSession(auth,{signal:pre.signal}),error=>error.name==='AbortError');assert.equal(hits,0);
  const start=performance.now();await assert.rejects(verifyZapSession(auth,{timeoutMs:80}),error=>error.code==='AUTH_VERIFY');assert.ok(performance.now()-start<1000);
  const abort=new AbortController(),pending=verifyZapSession(auth,{signal:abort.signal});setTimeout(()=>abort.abort(),30);await assert.rejects(pending,error=>error.name==='AbortError');assert.ok(hits<=2);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
