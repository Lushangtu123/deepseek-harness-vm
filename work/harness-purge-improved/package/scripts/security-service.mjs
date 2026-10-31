import {homedir} from 'node:os';
import {realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {RedteamStore} from '../lib/redteam/store-core.js';
import {executeSecurityOp,securityFor} from '../lib/redteam/personal-security-workbench.mjs';
import {createSecurityServer,reconcileSecurityProjects} from '../lib/redteam/personal-security-service.mjs';

const root='/home/purge/.dsh-improved/redteam';
if(process.platform!=='linux'||homedir()!=='/home/purge'||process.getuid()!==1000||process.env.DSH_HOME!=='/home/purge/.dsh-improved'||process.env.LISTEN_PID!==String(process.pid)||process.env.LISTEN_FDS!=='1'||realpathSync(root)!==root)throw Error('Dedicated socket-activated VM service required');
// A killed prior owner may leave Docker's daemon holding its scan container.
// Stop only the fixed workbench namespace before reconciling interrupted rows.
const names=execFileSync('/usr/bin/sudo',['-n','/usr/bin/docker','ps','--filter','label=personal.harness.security=true','--format','{{.Names}}'],{encoding:'utf8',timeout:8000}).trim().split('\n').filter(Boolean);
for(const name of names){if(!/^dsh-sec-[a-f0-9-]{36}$/.test(name))throw Error('Unconfirmed scan container; service startup stopped');execFileSync('/usr/bin/sudo',['-n','/usr/bin/docker','stop','--time','3',name],{stdio:'ignore',timeout:10000})}
const store=new RedteamStore(root),bench=securityFor(store);
const reconciliation=reconcileSecurityProjects(store,bench);
if(reconciliation.failedProjects||reconciliation.listingUnavailable)console.warn('Some security projects need individual inspection:',JSON.stringify(reconciliation));
const server=createSecurityServer({dispatch:(request,options)=>executeSecurityOp(store,request,options),observe:value=>console.warn('Security diagnostic:',JSON.stringify(value))});
server.on('error',()=>{console.error('Security service listener unavailable');process.exitCode=1});server.listen({fd:3});
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await server.shutdown();await bench.dispose();await store.close()}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stop().catch(()=>{console.error('Security service shutdown unconfirmed');process.exitCode=1})});
