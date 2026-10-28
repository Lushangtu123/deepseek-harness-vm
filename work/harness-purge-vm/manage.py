#!/usr/bin/env python3
"""On-demand controller for one dedicated VM. Never opens or drives a browser."""
import argparse,copy,hashlib,inspect,json,math,os,plistlib,re,shutil,socket,stat,subprocess,sys,time,urllib.request,http.cookiejar,tempfile,fcntl,functools,threading
from contextlib import contextmanager
from pathlib import Path
ROOT=Path.home()/'Library/Application Support/Harness Purge Original'
VM=ROOT/'Harness Purge Original.utm'
SETUP=ROOT/'setup'
TOOLS=ROOT/'host-tools'
UUID='347CD41C-E149-4BD7-BC9E-21A55E06243A'
LABEL='com.personal.harness-purge-original-egress'
UTM='/Applications/UTM.app/Contents/MacOS/utmctl'
PLIST=Path.home()/'Library/LaunchAgents'/f'{LABEL}.plist'
PYTHON='/opt/homebrew/bin/python3'
CURRENT_RECOVERY='ready-workbench-v19-20261027'
REVIEWED_RECOVERIES=('ready-improved-20261026','ready-workbench-20261026','ready-workbench-v3-20261026','ready-workbench-v4-20261026','ready-workbench-v5-20261026','ready-workbench-v6-20261026','ready-workbench-v7-20261026','ready-workbench-v8-20261026','ready-workbench-v9-20261026','ready-workbench-v10-20261027','ready-workbench-v11-20261027','ready-workbench-v11b-20261027','ready-workbench-v12-20261027','ready-workbench-v13-20261027','ready-workbench-v14-20261027','ready-workbench-v15-20261027','ready-workbench-v16-20261027','ready-workbench-v17-20261027','ready-workbench-v18-20261027',CURRENT_RECOVERY)
RECOVERY_HELPERS={'manage.py','egress_proxy.py','qemu-image.py','web-entry.mjs','web-health.mjs'}
RECOVERY_TOOL_FILES={'.dsh-improved/tooling/toolchain-version-checker/'+name for name in ['index.mjs','process.mjs','check_versions.py','catalog.json']}|{'.local/bin/toolchain-versions'}
RECOVERY_CONFIG_FILES={'.dsh-improved/cordis.patch.yml','.dsh-improved/profiles/web/package.json','.dsh-improved/profiles/web/cordis.patch.yml','.dsh-improved/AGENTS.md','.config/harness-vm-mode','.local/bin/harness-vm-web'}
RECOVERY_PLUGIN_ROOT='tools/imported-dsh-plugins-20261027T185822Z/'
RECOVERY_PLUGINS={'dsh-context':'0.75.1','dsh-whale-widget':'0.4.2','dshmarket':'1.70.2'}
RECOVERY_RUNTIME_FILES={'tools/harness-improved-runtime/node_modules/@deepseek-ai/'+name+'/lib/index.js' for name in ['dsh-tools','dsh-tool-bash','dsh-permission-presets','dsh-user-approval']}|{'tools/harness-improved-runtime/node_modules/@deepseek-ai/dsh/package.json','tools/harness-improved-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'}

_operation_owner=threading.local()
_operation_labels={'start':'启动','stop':'关闭','switch':'切换版本','snapshot':'建立恢复点','restore':'恢复'}

@contextmanager
def vm_operation(action):
 if action not in _operation_labels:raise ValueError('Unknown VM operation')
 key=(os.getpid(),str(ROOT))
 if getattr(_operation_owner,'key',None)==key:
  yield;return
 if ROOT.is_symlink() or not ROOT.is_dir() or ROOT.stat().st_uid!=os.getuid() or ROOT.stat().st_mode&0o077:raise ValueError('VM operation lock requires the private owner directory')
 fd=os.open(ROOT/'.vm-operation.lock',os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW|os.O_CLOEXEC|os.O_NONBLOCK,0o600)
 acquired=False
 try:
  info=os.fstat(fd)
  if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077 or info.st_nlink!=1:raise ValueError('VM operation lock must be a private regular file')
  try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   try:active=json.loads(os.pread(fd,512,0)).get('action')
   except (ValueError,AttributeError):active=None
   if not isinstance(active,str):active=None
   raise RuntimeError('专用 VM 正在进行'+_operation_labels.get(active,'其他操作')+'，请等待完成后重试。') from None
  acquired=True
  data=json.dumps({'action':action,'pid':os.getpid()},ensure_ascii=True).encode()
  os.ftruncate(fd,0);os.pwrite(fd,data,0);os.fsync(fd);_operation_owner.key=key
  yield
 finally:
  try:
   if acquired:
    _operation_owner.key=None
    try:os.ftruncate(fd,0)
    finally:fcntl.flock(fd,fcntl.LOCK_UN)
  finally:os.close(fd)

def vm_mutation(action):
 def decorate(function):
  @functools.wraps(function)
  def guarded(*args,**kwargs):
   with vm_operation(action):return function(*args,**kwargs)
  return guarded
 return decorate

def network_args():return ['-netdev "user,id=purgenet,ipv6=off,restrict=on,hostfwd=tcp:127.0.0.1:49223-:22,hostfwd=tcp:127.0.0.1:49224-:3080,guestfwd=tcp:10.0.2.100:3128-cmd:/usr/bin/nc 127.0.0.1 49222"','-device virtio-net-pci,netdev=purgenet,mac=02:00:00:50:23:01',f'-drive "file={VM}/Data/seed.iso,if=none,media=cdrom,readonly=on,id=cloudseed"','-device virtio-scsi-pci,id=seedscsi','-device scsi-cd,bus=seedscsi.0,drive=cloudseed']

def expected_config_fixture():return {'Information':{'UUID':UUID},'Network':[],'Sharing':{'ClipboardSharing':False,'DirectoryShareMode':'None'},'Input':{'UsbSharing':False,'MaximumUsbShare':0},'QEMU':{'AdditionalArguments':network_args()},'Drive':[{'ImageName':'ubuntu.qcow2','ImageType':'Disk','Interface':'VirtIO','ReadOnly':False}],'Serial':[{'Mode':'TcpServer','Target':'Auto','TcpPort':49225,'WaitForConnection':False,'RemoteConnectionAllowed':False}]}

def validate_config(c):
 if c.get('Information',{}).get('UUID')!=UUID:raise ValueError('Wrong VM identity')
 if c.get('Network')!=[]:raise ValueError('Normal network interface is forbidden')
 if c.get('Sharing',{}).get('ClipboardSharing') is not False or c.get('Sharing',{}).get('DirectoryShareMode')!='None':raise ValueError('Host sharing/clipboard must remain off')
 if c.get('Input',{}).get('UsbSharing') is not False or c['Input'].get('MaximumUsbShare')!=0:raise ValueError('Host USB passthrough must remain off')
 if c.get('QEMU',{}).get('AdditionalArguments')!=network_args():raise ValueError('Restricted network/custom devices changed; launch refused pending review')
 drives=c.get('Drive',[])
 if len(drives)!=1 or drives[0].get('ImageName')!='ubuntu.qcow2' or drives[0].get('ImageType')!='Disk' or drives[0].get('Interface')!='VirtIO':raise ValueError('Unexpected guest disk or host path')
 serial=c.get('Serial',[])
 if len(serial)!=1 or serial[0].get('Mode')!='TcpServer' or serial[0].get('TcpPort')!=49225 or serial[0].get('RemoteConnectionAllowed') is not False:raise ValueError('Serial console must remain loopback only')

def validate():
 for p in [ROOT,VM,VM/'config.plist',VM/'Data',VM/'Data/ubuntu.qcow2',VM/'Data/seed.iso',SETUP,SETUP/'guest-ed25519',SETUP/'known_hosts']:
  if p.is_symlink():raise ValueError('Dedicated VM path cannot be a symlink')
  if not p.exists():raise ValueError('Missing VM prerequisite: '+str(p))
 if ROOT.stat().st_mode&0o077:raise ValueError('VM root must be owner-only')
 if (SETUP/'known_hosts').stat().st_mode&0o077:raise ValueError('Dedicated SSH trust file must be owner-only')
 lines=(SETUP/'known_hosts').read_text().splitlines()
 if len(lines)!=1 or not re.fullmatch(r'\[127\.0\.0\.1\]:49223 ssh-ed25519 [A-Za-z0-9+/=]+',lines[0]):raise ValueError('Dedicated SSH trust must contain exactly this VM host key')
 validate_config(plistlib.loads((VM/'config.plist').read_bytes()))

def command(argv,**kw):return subprocess.run(argv,check=True,capture_output=True,text=True,timeout=kw.pop('timeout',30),**kw)

def ssh(script,timeout=15,*,input=None):
 argv=['/usr/bin/ssh','-F','/dev/null','-p','49223','-i',str(SETUP/'guest-ed25519'),'-o','IdentityAgent=none','-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','ConnectTimeout=3','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile="'+str(SETUP/'known_hosts')+'"','-o','GlobalKnownHostsFile=/dev/null','purge@127.0.0.1',script]
 return command(argv,timeout=timeout,**({'input':input} if input is not None else {}))

def vm_status():return command([UTM,'status',UUID],timeout=10).stdout.strip()

WEB_LABEL='com.personal.harness-purge-original-web-entry'

def web_entry_job():return {'Label':WEB_LABEL,'ProgramArguments':['/opt/homebrew/bin/node',str(TOOLS/'web-entry.mjs')],'WorkingDirectory':str(TOOLS),'RunAtLoad':False,'KeepAlive':False,'ProcessType':'Background','StandardOutPath':str(ROOT/'web-entry.stdout.log'),'StandardErrorPath':str(ROOT/'web-entry.stderr.log')}

def web_entry_listener_owned():
 target='gui/'+str(os.getuid())+'/'+WEB_LABEL
 state=subprocess.run(['/bin/launchctl','print',target],capture_output=True,text=True,timeout=5)
 pid=re.search(r'^\s*pid = (\d+)\s*$',state.stdout,re.M)
 if state.returncode or not pid:return False
 result=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',pid.group(1),'-iTCP:49226','-sTCP:LISTEN','-Fn'],capture_output=True,text=True,timeout=5)
 return result.returncode==0 and {line for line in result.stdout.splitlines() if line.startswith('n')}=={'n127.0.0.1:49226'}

def web_entry_start():
 plist=Path.home()/'Library/LaunchAgents'/f'{WEB_LABEL}.plist'
 if plist.is_symlink() or plistlib.loads(plist.read_bytes())!=web_entry_job():raise ValueError('Stable web entry launch definition changed; refusing')
 domain='gui/'+str(os.getuid());target=domain+'/'+WEB_LABEL
 if subprocess.run(['/bin/launchctl','print',target],capture_output=True,timeout=10).returncode!=0:
  command(['/bin/launchctl','bootstrap',domain,str(plist)])
 command(['/bin/launchctl','kickstart',target])
 deadline=time.monotonic()+8
 while time.monotonic()<deadline:
  if web_entry_listener_owned():return
  time.sleep(0.1)
 raise RuntimeError('Stable entry listener is not owned by the managed process; no login token sent')

def web_entry_stop():
 target='gui/'+str(os.getuid())+'/'+WEB_LABEL
 result=subprocess.run(['/bin/launchctl','kill','SIGTERM',target],capture_output=True,timeout=10)
 if result.returncode:
  state=subprocess.run(['/bin/launchctl','print',target],capture_output=True,text=True,timeout=10)
  if state.returncode==0 and re.search(r'^\s*pid = \d+',state.stdout,re.M):raise RuntimeError('Stable web entry termination failed')
 deadline=time.monotonic()+8
 while time.monotonic()<deadline:
  try:
   with socket.create_connection(('127.0.0.1',49226),timeout=0.5):pass
  except ConnectionRefusedError:return
  time.sleep(0.2)
 raise RuntimeError('Stable web entry remains open after stop')

def job_spec():return {'Label':LABEL,'ProgramArguments':[PYTHON,str(TOOLS/'egress_proxy.py')],'WorkingDirectory':str(TOOLS),'RunAtLoad':False,'KeepAlive':False,'ProcessType':'Background','StandardOutPath':str(ROOT/'proxy.stdout.log'),'StandardErrorPath':str(ROOT/'proxy.stderr.log'),'SoftResourceLimits':{'NumberOfFiles':128,'NumberOfProcesses':24}}

def proxy_start():
 if plistlib.loads(PLIST.read_bytes())!=job_spec():raise ValueError('Proxy launch definition changed; refusing')
 domain='gui/'+str(os.getuid());target=domain+'/'+LABEL
 present=subprocess.run(['/bin/launchctl','print',target],capture_output=True,timeout=10)
 if present.returncode!=0:command(['/bin/launchctl','bootstrap',domain,str(PLIST)])
 command(['/bin/launchctl','kickstart',target])

URL_SCRIPT="""python3 - <<'VM_URL'
import subprocess,re,os
s=subprocess.run(['journalctl','--user','-u','dsh-original','-b','-n','40','--no-pager'],capture_output=True,text=True,check=True,env={**os.environ,'XDG_RUNTIME_DIR':'/run/user/'+str(os.getuid())}).stdout
urls=re.findall(r'http://127\\.0\\.0\\.1:49224/\\?token=[A-Za-z0-9_-]+',s)
assert urls,'No current authenticated URL found'
print(urls[-1])
VM_URL"""

class LocalRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  if newurl!='http://127.0.0.1:49226/':raise urllib.error.HTTPError('local VM readiness',403,'Redirect outside fixed VM entry denied',headers,fp)
  return super().redirect_request(req,fp,code,msg,headers,newurl)

def authenticated_ready(url):
 if not re.fullmatch(r'http://127\.0\.0\.1:49226/\?token=[A-Za-z0-9_-]+',url):return False
 client=urllib.request.build_opener(urllib.request.ProxyHandler({}),LocalRedirect(),urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
 try:
  with client.open(url,timeout=3) as response:
   if response.status!=200:return False
   document=response.read(2*1024*1024+1)
  if len(document)>2*1024*1024:return False
  assets=list(dict.fromkeys(re.findall(r'(?:src|href)=[\"\']\.?(/assets/[A-Za-z0-9._-]+\.(?:js|css))[\"\']',document.decode('utf-8'))))
  if not assets or len(assets)>16:return False
  base='http://127.0.0.1:49226'
  for asset in assets:
   with client.open(base+asset,timeout=3) as response:
    if response.status!=200 or len(response.read(8*1024*1024+1))>8*1024*1024:return False
  request=urllib.request.Request(base+'/redteam/api',json.dumps({'op':'bootstrap'}).encode(),{'Origin':base,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'})
  with client.open(request,timeout=3) as response:return response.status==200 and json.loads(response.read(2*1024*1024)).get('ok') is True
 except (OSError,ValueError):return False

def measure_guest_clock():
 before=time.time()
 raw=ssh("python3 -c 'import time; print(time.time())'",timeout=5).stdout.strip()
 after=time.time()
 guest=float(raw)
 if not math.isfinite(guest) or not 0<=after-before<=2:raise ValueError('Guest clock measurement invalid or too slow; no time change attempted')
 return (before+after)/2-guest

def synchronize_clock():
 offset=measure_guest_clock()
 adjusted=abs(offset)>2
 if adjusted:
  epoch=time.time()
  if not math.isfinite(epoch) or epoch<=0:raise ValueError('Host clock unavailable')
  # The trusted SSH endpoint is the dedicated guest. Never set macOS time or
  # relax the VM network fence to obtain an external NTP connection.
  ssh(f'sudo -n /usr/bin/date -u --set=@{epoch:.6f} >/dev/null',timeout=8)
  offset=measure_guest_clock()
  if abs(offset)>2:raise RuntimeError('Guest clock adjustment was not verified; startup readiness stopped')
 return {'adjusted':adjusted,'offsetSeconds':round(offset,6)}

@vm_mutation('start')
def start(quiet=False):
 validate();proxy_start()
 if vm_status()!='started':command([UTM,'start',UUID],timeout=30)
 deadline=time.monotonic()+75;last=None;clock_checked=False;entry_checked=False
 while time.monotonic()<deadline:
  try:
   active=ssh('XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user is-active dsh-original',timeout=6)
   if active.stdout.strip()=='active':
    if not clock_checked:
     clock=synchronize_clock();clock_checked=True
     print('VM clock verified: '+json.dumps(clock))
    if not entry_checked:
     web_entry_start();entry_checked=True
    url=ssh(URL_SCRIPT).stdout.strip()
    if not re.fullmatch(r'http://127\.0\.0\.1:49224/\?token=[A-Za-z0-9_-]+',url):raise ValueError('Invalid guest access URL')
    url=url.replace(':49224/',':49226/',1)
    if authenticated_ready(url):break
  except (subprocess.SubprocessError,OSError) as error:last=type(error).__name__
  time.sleep(1)
 else:raise RuntimeError('VM started but guest service did not become ready; no permission change or fallback attempted: '+str(last))
 if not re.fullmatch(r'http://127\.0\.0\.1:49226/\?token=[A-Za-z0-9_-]+',url):raise ValueError('Invalid stable access URL')
 fd=os.open(ROOT/'access-url.txt',os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as f:f.write(url+'\n')
 os.chmod(ROOT/'access-url.txt',0o600)
 shortcut=ROOT/'打开虚拟机Harness.webloc'
 fd=os.open(shortcut,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:plistlib.dump({'URL':url},f)
 os.chmod(shortcut,0o600)
 print('专用虚拟机已启动。当前版本和权限以 Harness 会话为准；宿主共享关闭。')
 if not quiet:print('也可在 Finder 双击本次更新的登录快捷方式：\n'+str(shortcut)+'\n在浏览器中打开以下完整本机地址（含本地访问令牌，请勿分享）：\n'+url)
 else:print('Authenticated URL saved privately; token omitted from diagnostics.')

@vm_mutation('switch')
def switch(mode,quiet=False):
 if mode not in ('original','improved'):raise ValueError('Only original or improved mode is supported')
 start(True)
 script="""python3 - <<'VM_MODE'
import os,subprocess
from pathlib import Path
mode = MODE_VALUE
root=Path('/home/purge')
entry=root/('.local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js' if mode=='original' else 'tools/harness-improved-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js')
profile=root/('.dsh' if mode=='original' else '.dsh-improved')/'profiles/web/package.json'
if not entry.is_file() or not profile.is_file():raise RuntimeError('Selected runtime is not installed')
target=root/'.config/harness-vm-mode'
if target.is_symlink():raise RuntimeError('Refusing symbolic mode file')
temporary=target.with_name(target.name+'.next-'+str(os.getpid()))
fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
with os.fdopen(fd,'w') as output:output.write(mode+'\\n')
os.replace(temporary,target)
subprocess.run(['systemctl','--user','restart','dsh-original'],check=True,timeout=30,env={**os.environ,'XDG_RUNTIME_DIR':'/run/user/'+str(os.getuid())})
print('Selected VM mode: '+mode)
VM_MODE""".replace('MODE_VALUE',repr(mode))
 ssh(script,timeout=40)
 start(quiet)
 print('已切换到'+('改进版：采用 VM 独立权限配置；具体档位见会话菜单。' if mode=='improved' else '完整原版：完全访问仅限专用虚拟机。'))

def proxy_stop():
 target='gui/'+str(os.getuid())+'/'+LABEL
 result=subprocess.run(['/bin/launchctl','kill','SIGTERM',target],capture_output=True,timeout=10)
 if result.returncode:
  state=subprocess.run(['/bin/launchctl','print',target],capture_output=True,text=True,timeout=10)
  if state.returncode==0 and re.search(r'^\s*pid = \d+',state.stdout,re.M):raise RuntimeError('Proxy termination failed; inspect the dedicated launch job')
 deadline=time.monotonic()+8
 while time.monotonic()<deadline:
  try:
   with socket.create_connection(('127.0.0.1',49222),timeout=0.5):pass
  except ConnectionRefusedError:return
  time.sleep(0.2)
 raise RuntimeError('Port 49222 remains open; proxy stop not confirmed')

@vm_mutation('stop')
def stop():
 validate()
 state=vm_status()
 if state not in ('started','stopped'):raise RuntimeError('VM state is '+state+'; resume it in UTM before normal shutdown')
 if state=='started':
  try:ssh('sudo /usr/sbin/shutdown -h now',timeout=10)
  except subprocess.CalledProcessError as e:
   if e.returncode!=255:raise
  deadline=time.monotonic()+45
  while time.monotonic()<deadline:
   if vm_status()=='stopped':break
   time.sleep(1)
  else:raise RuntimeError('Guest did not shut down; refusing forced stop')
 web_entry_stop();proxy_stop()
 print('专用虚拟机已正常关闭，出网代理已停止。')

def image_command(args,timeout=30,helper=None):
 return command([PYTHON,str(helper or TOOLS/'qemu-image.py'),*args],timeout=timeout,env={**os.environ,'DYLD_FRAMEWORK_PATH':'/Applications/UTM.app/Contents/Frameworks'})

def recovery_path(snapshot):
 if snapshot not in REVIEWED_RECOVERIES:raise ValueError('Unreviewed current recovery name')
 folder=ROOT/'recoveries'/snapshot
 for path in [folder.parent,folder]:
  if path.is_symlink():raise ValueError('Recovery path cannot be a symlink')
 return folder

def file_sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def recovery_catalog():
 """Bounded public metadata only. No SSH, recovery, removal, or VM state changes."""
 validate()
 protected={'ready-original','ready-toolchain-20261025',*REVIEWED_RECOVERIES[-3:]}
 safe=lambda name:isinstance(name,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 ._/-]{0,240}',name) and not any(part in ('','.','..') or part.startswith('.') or re.search(r'credential|secret|token|provider',part,re.I) for part in name.split('/'))
 snapshot_state='observed';snapshots=[];truncated=False
 try:
  metadata=json.loads(image_command(['info','--force-share','--output=json',str(VM/'Data/ubuntu.qcow2')],timeout=5).stdout)
  actual={row.get('name') for row in metadata.get('snapshots',[]) if isinstance(row,dict) and safe(row.get('name')) and '/' not in row['name']}
 except (OSError,ValueError,TypeError,AttributeError,subprocess.SubprocessError):snapshot_state='unavailable';actual=set()
 names=sorted(actual|set(REVIEWED_RECOVERIES))
 if len(names)>80:truncated=True
 for name in names[:80]:
  bundle_state='not-reviewed';created=None
  if name in REVIEWED_RECOVERIES:
   bundle_state='missing'
   if recovery_path(name).exists():
    try:
     _,bundle=verify_recovery_bundle(name);bundle_state='verified';created=bundle.get('createdAt')
    except (OSError,ValueError,KeyError,TypeError,AttributeError,subprocess.SubprocessError):bundle_state='invalid'
  present=name in actual if snapshot_state=='observed' else None
  snapshots.append({'name':name,'present':present,'current':name==CURRENT_RECOVERY,'protected':name in protected,'reviewCandidate':present is True and name not in protected,'bundleState':bundle_state,'createdAt':created})
 images=[];base=ROOT/'archived-validation';visited=0
 def scan_error(_error):
  nonlocal truncated
  truncated=True
 if base.is_dir() and not base.is_symlink() and base.resolve()==base:
  for directory,dirs,files in os.walk(base,followlinks=False,onerror=scan_error):
   visited+=1;parent=Path(directory)
   dirs[:]=sorted(name for name in dirs if not (parent/name).is_symlink())
   if visited>512:truncated=True;break
   if len(parent.relative_to(base).parts)>=5:
    if dirs:truncated=True
    dirs[:]=[]
   for name in sorted(files):
    if not name.endswith('.qcow2'):continue
    path=parent/name;key=str(path.relative_to(base))
    if path.is_symlink() or path.resolve()!=path or not safe(key):continue
    if len(images)>=80:truncated=True;break
    try:info=path.stat()
    except OSError:truncated=True;continue
    if not stat.S_ISREG(info.st_mode):continue
    images.append({'id':key,'logicalBytes':info.st_size,'allocatedBytes':info.st_blocks*512,'reviewCandidate':True})
 space=shutil.disk_usage(ROOT);disk=(VM/'Data/ubuntu.qcow2').stat()
 return {'readOnly':True,'observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'currentRecovery':CURRENT_RECOVERY,'snapshotState':snapshot_state,'snapshots':snapshots,'images':images,'truncated':truncated,'storage':{'freeBytes':space.free,'totalBytes':space.total,'primaryLogicalBytes':disk.st_size,'primaryAllocatedBytes':disk.st_blocks*512}}

def verify_recovery_bundle(snapshot):
 folder=recovery_path(snapshot)
 manifest=folder/'manifest.json'
 if manifest.is_symlink():raise ValueError('Recovery manifest cannot be a symlink')
 data=json.loads(manifest.read_text())
 if data.get('vmUUID')!=UUID or data.get('snapshot')!=snapshot:raise ValueError('Recovery identity mismatch')
 if set(data.get('helpers',{}))!=RECOVERY_HELPERS:raise ValueError('Recovery helper inventory mismatch')
 expected_jobs={f'{LABEL}.plist',f'{WEB_LABEL}.plist'}
 if set(data.get('launchAgents',{}))!=expected_jobs:raise ValueError('Recovery launch inventory mismatch')
 for section,subdir in [('helpers','host-tools'),('launchAgents','launch-agents')]:
  if (folder/subdir).is_symlink():raise ValueError('Recovery directory cannot be a symlink')
  for name,digest in data[section].items():
   path=folder/subdir/name
   if path.is_symlink() or file_sha(path)!=digest:raise ValueError('Recovery bundle checksum mismatch')
 if (folder/'guest-proof.json').is_symlink() or file_sha(folder/'guest-proof.json')!=data['guestProofSha256']:raise ValueError('Recovery guest proof checksum mismatch')
 return folder,data

def recovery_inventory(proof):
 """Limit coverage to program files and an explicit non-secret tool/config list."""
 prefix='tools/dsh-purge-personal-1.1.77-personal.1/'
 manifests={RECOVERY_PLUGIN_ROOT+name+'/package.json' for name in RECOVERY_PLUGINS}
 fixed=RECOVERY_TOOL_FILES|RECOVERY_CONFIG_FILES|RECOVERY_RUNTIME_FILES|manifests
 def plugin_path(key):
  if not key.startswith(RECOVERY_PLUGIN_ROOT):return False
  parts=key[len(RECOVERY_PLUGIN_ROOT):].split('/')
  return len(parts)>1 and parts[0] in RECOVERY_PLUGINS and not any(part.startswith('.') and not (part=='.gitkeep' and index==len(parts)-1) for index,part in enumerate(parts))
 expected={key:value for key,value in proof.get('files',{}).items() if isinstance(key,str) and isinstance(value,str) and not any(part in ('','..','.') for part in key.split('/')) and (key.startswith(prefix) or key in fixed or plugin_path(key))}
 groups={'program':sorted(key for key in expected if key.startswith(prefix)),'runtime':sorted(RECOVERY_RUNTIME_FILES),'tools':sorted(RECOVERY_TOOL_FILES),'config':sorted(RECOVERY_CONFIG_FILES),'plugins':sorted({key for key in expected if plugin_path(key)}|manifests)}
 return {'expected':expected,'groups':groups,'uncovered':sorted(fixed-expected.keys())}

def plugin_differences(home,expected,roots):
 """Observe only the fixed imported sources; never traverse package symlinks."""
 home=home.resolve();different=set()
 for name,relative in roots.items():
  source=home/relative;link=home/'.dsh-improved/profiles/web/node_modules'/name
  if not link.is_symlink() or link.resolve()!=source:different.add(str(link.relative_to(home)))
  wanted={key for key in expected if key.startswith(relative+'/')};actual=set()
  if source.is_symlink() or source.resolve()!=source or not source.is_dir():
   different.add(relative+'/package.json');continue
  for directory,dirs,files in os.walk(source,followlinks=False):
   for entry in [*dirs,*files]:
    path=Path(directory)/entry;key=str(path.relative_to(home))
    if path.is_symlink():different.add(key)
    elif path.is_file():actual.add(key)
  different.update(wanted^actual)
 return sorted(different)

def deployment_status():
 """Read runtime identity and scoped program/tool/config coverage; never mutate."""
 validate()
 recovery={'state':'missing','name':CURRENT_RECOVERY,'scope':'improved-program-tools-config'};expected={};inventory=None
 for name in reversed(REVIEWED_RECOVERIES):
  if not recovery_path(name).exists():continue
  try:
   folder,bundle=verify_recovery_bundle(name)
   proof=json.loads((folder/'guest-proof.json').read_text())
   inventory=recovery_inventory(proof);expected=inventory['expected']
   if not inventory['groups']['program']:raise ValueError('Missing program coverage')
   launches=current_launch_inventory();archived=bundle.get('launchAgents',{});helpers=current_host_inventory(verify=False)
   helper_changes=['host-tools/'+name for name in sorted(RECOVERY_HELPERS) if not helpers.get(name) or helpers[name]!=bundle['helpers'].get(name)]
   launch_changes=['host-launch-agents/'+key for key in launches if not launches[key] or launches[key]!=archived.get(key)]
   recovery={'state':'pending','name':name,'createdAt':bundle['createdAt'],'scope':'improved-program-tools-config','helpersMatch':not helper_changes,'launchAgentsMatch':not launch_changes,'uncoveredFiles':inventory['uncovered']}
   snapshots=json.loads(image_command(['info','--force-share','--output=json',str(VM/'Data/ubuntu.qcow2')],timeout=5,helper=folder/'host-tools/qemu-image.py').stdout).get('snapshots',[])
   if not any(row.get('name')==name for row in snapshots):recovery['state']='missing'
  except (OSError,ValueError,KeyError,subprocess.SubprocessError):recovery={'state':'invalid','name':name,'scope':'improved-program-tools-config'};expected={};inventory=None
  break
 script="""from pathlib import Path
import os,subprocess,json,hashlib
home=Path('/home/purge');env={**os.environ,'XDG_RUNTIME_DIR':'/run/user/1000'}
pid=int(subprocess.check_output(['systemctl','--user','show','dsh-original','-p','MainPID','--value'],env=env,text=True).strip())
args=Path('/proc/'+str(pid)+'/cmdline').read_bytes().split(b'\\0')
variables=dict(x.split(b'=',1) for x in Path('/proc/'+str(pid)+'/environ').read_bytes().split(b'\\0') if b'=' in x)
config=variables.get(b'DSH_HOME',b'').decode();mode='unknown';package=None
for label,entry,directory in [('original',home/'.local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',home/'.dsh'),('improved',home/'tools/harness-improved-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js',home/'.dsh-improved')]:
 if str(entry).encode() in args and config==str(directory):mode=label;package=entry.parent.parent/'package.json'
version=None
try:
 if package and not package.is_symlink() and package.resolve().is_relative_to(home):
  with package.open('rb') as source:raw=source.read(65537)
  if len(raw)<=65536:
   metadata=json.loads(raw)
   if isinstance(metadata,dict):version=metadata.get('version')
except (OSError,ValueError):pass
expected=EXPECTED;different=[]
for name,digest in expected.items():
 p=home/name
 try:
  matches=not p.is_symlink() and p.resolve()==p and p.resolve().is_relative_to(home) and p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest()==digest
 except OSError:matches=False
 if not matches:different.append(name)
PLUGIN_OBSERVATION
plugin_changes=plugin_differences(home,expected,PLUGIN_ROOTS)
different=sorted(set(different)|set(plugin_changes))
print(json.dumps({'mode':mode,'configDir':config if mode!='unknown' else 'unverified','modeFile':(home/'.config/harness-vm-mode').read_text().strip(),'filesChecked':len(expected),'differentFiles':different,'runtimePackageVersion':version}))
""".replace('EXPECTED',repr(expected)).replace('PLUGIN_OBSERVATION',inspect.getsource(plugin_differences)).replace('PLUGIN_ROOTS',repr({name:RECOVERY_PLUGIN_ROOT+name for name in RECOVERY_PLUGINS}))
 # Plugin manifests exceed Linux's per-argument shell limit; stream the fixed
 # read-only observer instead of making the inventory a remote command argument.
 actual=json.loads(ssh('python3 -',input=script,timeout=10).stdout)
 if actual.get('mode') not in ('original','improved','unknown'):raise ValueError('Invalid runtime identity')
 if inventory:
  different=set(actual.get('differentFiles',[]));recovery['groups']={}
  for group,names in inventory['groups'].items():
   uncovered=[name for name in names if name not in expected];changed=[name for name in names if name in different]
   recovery['groups'][group]={'state':'uncovered' if group in ('runtime','plugins') and uncovered else 'older' if uncovered or changed else 'matches','filesChecked':len(names)-len(uncovered),'uncoveredFiles':uncovered,'differentFiles':changed}
   if group=='plugins':
    extra=sorted(name for name in different if name.startswith(RECOVERY_PLUGIN_ROOT) or name.startswith('.dsh-improved/profiles/web/node_modules/'))
    differences=sorted(set(changed)|set(extra))
    recovery['groups'][group].update({'differentFiles':differences[:80],'differentFileCount':len(differences),'differenceDetailsTruncated':len(differences)>80})
    if extra:recovery['groups'][group]['state']='older' if not uncovered else 'uncovered'
   if group=='config':
    recovery['groups'][group]['filesChecked']+=len(launches)
    recovery['groups'][group]['differentFiles']+=launch_changes
    if launch_changes:recovery['groups'][group]['state']='older'
   if recovery['state'] in ('missing','invalid'):recovery['groups'][group]['state']=recovery['state']
  recovery['groups']['tools']['filesChecked']+=len(RECOVERY_HELPERS)
  recovery['groups']['tools']['differentFiles']+=helper_changes
  if helper_changes and recovery['groups']['tools']['state']=='matches':recovery['groups']['tools']['state']='older'
 if recovery['state']=='pending':recovery['state']='matches' if actual.get('filesChecked')==len(expected) and not actual.get('differentFiles') and not recovery['uncoveredFiles'] and recovery['helpersMatch'] and recovery['launchAgentsMatch'] else 'older'
 version=actual.get('runtimePackageVersion');version=version if isinstance(version,str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}',version) else None
 return {'mode':actual['mode'],'configDir':actual['configDir'],'runtimePackageVersion':version,'modeFileMatches':actual['mode']==actual.get('modeFile'),'observedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'recovery':recovery}

def current_launch_inventory():
 result={}
 for label in [LABEL,WEB_LABEL]:
  name=label+'.plist';path=Path.home()/'Library/LaunchAgents'/name
  try:result[name]=file_sha(path) if path.is_file() and not path.is_symlink() else None
  except OSError:result[name]=None
 return result

def current_host_inventory(verify=True):
 if not verify:
  actual={}
  for name in sorted(RECOVERY_HELPERS):
   path=TOOLS/name
   try:actual[name]=file_sha(path) if path.is_file() and not path.is_symlink() else None
   except OSError:actual[name]=None
  return actual
 hashes=json.loads((ROOT/'host-tools.sha256.json').read_text())
 if set(hashes)!=RECOVERY_HELPERS:raise ValueError('Current helper inventory mismatch')
 if any((TOOLS/name).is_symlink() or file_sha(TOOLS/name)!=digest for name,digest in hashes.items()):raise ValueError('Current host helper checksum mismatch')
 return hashes

def copy_host_bundle(folder,verify_current=True):
 if verify_current:hashes=current_host_inventory()
 else:
  hashes={name:file_sha(TOOLS/name) for name in RECOVERY_HELPERS if (TOOLS/name).is_file() and not (TOOLS/name).is_symlink()}
 (folder/'host-tools').mkdir(mode=0o700)
 (folder/'launch-agents').mkdir(mode=0o700)
 for name in hashes:shutil.copy2(TOOLS/name,folder/'host-tools'/name)
 jobs={};missing_jobs=[]
 for label in [LABEL,WEB_LABEL]:
  name=f'{label}.plist';source=Path.home()/'Library/LaunchAgents'/name
  if source.is_symlink():raise ValueError('Launch definition cannot be a symlink')
  if not source.is_file():
   if verify_current:raise ValueError('Current launch definition is missing')
   missing_jobs.append(name);continue
  shutil.copy2(source,folder/'launch-agents'/name);jobs[name]=file_sha(source)
 return {'vmUUID':UUID,'helpers':hashes,'launchAgents':jobs,'missingHelpers':sorted(RECOVERY_HELPERS-set(hashes)),'missingLaunchAgents':missing_jobs}

def atomic_recovery_write(path,data,mode=0o600):
 if path.is_symlink():raise ValueError('Recovery target cannot be a symlink')
 fd,name=tempfile.mkstemp(dir=path.parent,prefix='.'+path.name+'.recovery-')
 temporary=Path(name)
 try:
  with os.fdopen(fd,'wb') as output:
   os.fchmod(output.fileno(),mode);output.write(data);output.flush();os.fsync(output.fileno())
  os.replace(temporary,path)
 finally:temporary.unlink(missing_ok=True)

def apply_host_bundle(folder,data):
 for name in data['helpers']:
  source=folder/'host-tools'/name
  atomic_recovery_write(TOOLS/name,source.read_bytes(),source.stat().st_mode&0o777)
 for name in data['launchAgents']:
  atomic_recovery_write(Path.home()/'Library/LaunchAgents'/name,(folder/'launch-agents'/name).read_bytes())
 for name in data.get('missingHelpers',[]):
  if name not in RECOVERY_HELPERS:raise ValueError('Unexpected missing helper')
  (TOOLS/name).unlink(missing_ok=True)
 for name in data.get('missingLaunchAgents',[]):
  if name not in {f'{LABEL}.plist',f'{WEB_LABEL}.plist'}:raise ValueError('Unexpected missing launch agent')
  (Path.home()/'Library/LaunchAgents'/name).unlink(missing_ok=True)
 atomic_recovery_write(ROOT/'host-tools.sha256.json',(json.dumps(data['helpers'],indent=2)+'\n').encode())
 helpers=current_host_inventory(verify=False)
 if any(helpers.get(name)!=data['helpers'].get(name) for name in RECOVERY_HELPERS):raise RuntimeError('Applied recovery helper verification failed')
 launches=current_launch_inventory()
 if any(launches.get(name)!=data['launchAgents'].get(name) for name in launches):raise RuntimeError('Applied recovery launch verification failed')

@vm_mutation('snapshot')
def create_current_recovery():
 validate()
 if vm_status()!='stopped':raise RuntimeError('Current recovery requires normal offline shutdown')
 folder=recovery_path(CURRENT_RECOVERY)
 if folder.exists():raise ValueError('Current recovery exists; refusing overwrite')
 image=str(VM/'Data/ubuntu.qcow2')
 info=json.loads(image_command(['info','--output=json',image]).stdout)
 if any(row.get('name')==CURRENT_RECOVERY for row in info.get('snapshots',[])):raise ValueError('Snapshot already exists; reconcile before retrying')
 proof=ROOT/('recovery-input-'+CURRENT_RECOVERY+'.json')
 if proof.is_symlink() or not proof.is_file():raise ValueError('Prepared guest recovery proof is required')
 parsed=json.loads(proof.read_text())
 if parsed.get('vmUUID')!=UUID or parsed.get('mode')!='improved' or parsed.get('recoveryName')!=CURRENT_RECOVERY or not parsed.get('files'):raise ValueError('Invalid guest recovery proof')
 folder.parent.mkdir(mode=0o700,exist_ok=True)
 staging=Path(tempfile.mkdtemp(prefix='.creating-',dir=folder.parent))
 data=copy_host_bundle(staging)
 shutil.copy2(proof,staging/'guest-proof.json')
 data.update({'snapshot':CURRENT_RECOVERY,'guestProofSha256':file_sha(staging/'guest-proof.json'),'createdAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
 image_command(['check',image],timeout=90)
 image_command(['snapshot','-c',CURRENT_RECOVERY,image],timeout=90)
 image_command(['check',image],timeout=90)
 atomic_recovery_write(staging/'manifest.json',(json.dumps(data,indent=2)+'\n').encode())
 os.rename(staging,folder)
 verify_recovery_bundle(CURRENT_RECOVERY)
 print(json.dumps({'createdRecovery':CURRENT_RECOVERY,'hostHelpers':len(data['helpers']),'guestProofRecorded':True,'offline':True,'folder':str(folder)},indent=2))

@vm_mutation('restore')
def restore_current_recovery(snapshot):
 folder,data=verify_recovery_bundle(snapshot)
 helper=folder/'host-tools/qemu-image.py'
 image=str(VM/'Data/ubuntu.qcow2')
 info=json.loads(image_command(['info','--output=json',image],helper=helper).stdout)
 if not any(row.get('name')==snapshot for row in info.get('snapshots',[])):raise ValueError('Current recovery disk snapshot is missing')
 safety='pre-restore-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+str(os.getpid())
 backup=ROOT/'recoveries'/safety;backup.mkdir(mode=0o700)
 previous=copy_host_bundle(backup,verify_current=False)
 atomic_recovery_write(backup/'host-manifest.json',(json.dumps(previous,indent=2)+'\n').encode())
 image_command(['snapshot','-c',safety,image],timeout=90,helper=helper)
 try:
  image_command(['snapshot','-a',snapshot,image],timeout=90,helper=helper)
  apply_host_bundle(folder,data)
  image_command(['check',image],timeout=90,helper=helper)
 except BaseException as original:
  errors=[]
  try:
   image_command(['snapshot','-a',safety,image],timeout=90,helper=helper)
   image_command(['check',image],timeout=90,helper=helper)
  except BaseException as error:errors.append('disk: '+type(error).__name__)
  try:apply_host_bundle(backup,previous)
  except BaseException as error:errors.append('host helpers: '+type(error).__name__)
  if errors:raise RuntimeError('Rollback needs attention ('+', '.join(errors)+'); safety snapshot: '+safety) from original
  raise
 (ROOT/'access-url.txt').unlink(missing_ok=True)
 print('已恢复当前改进版磁盘及对应宿主入口；恢复前内容保存在 '+safety+'。请重新运行启动入口。')

@vm_mutation('restore')
def restore(confirmed=False,snapshot='ready-original'):
 if not confirmed:raise ValueError('Restore requires --confirm-restore; it reverts guest files and sessions')
 if snapshot not in ('ready-original','ready-toolchain-20261025',*REVIEWED_RECOVERIES):raise ValueError('Only a reviewed dedicated VM recovery point is permitted')
 validate()
 if vm_status()!='stopped':raise RuntimeError('Close the dedicated VM normally before restoring; no forced stop attempted')
 if snapshot in REVIEWED_RECOVERIES:return restore_current_recovery(snapshot)
 image=str(VM/'Data/ubuntu.qcow2')
 info=json.loads(image_command(['info','--output=json',image]).stdout)
 if not any(s.get('name')==snapshot for s in info.get('snapshots',[])):raise ValueError('Selected verified snapshot is missing')
 backup='pre-restore-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+str(os.getpid())
 image_command(['snapshot','-c',backup,image],timeout=90)
 image_command(['snapshot','-a',snapshot,image],timeout=90)
 (ROOT/'access-url.txt').unlink(missing_ok=True)
 print('已恢复 '+snapshot+'；恢复前的数据保存在快照 '+backup+'。请重新运行启动入口。')

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['start','stop','status','restore','switch','snapshot-current','environment','recoveries']);parser.add_argument('--mode',choices=['original','improved']);parser.add_argument('--quiet',action='store_true');parser.add_argument('--confirm-restore',action='store_true');parser.add_argument('--snapshot',choices=['ready-original','ready-toolchain-20261025',*REVIEWED_RECOVERIES],default='ready-original');args=parser.parse_args()
 if args.action=='start':start(args.quiet)
 elif args.action=='switch':switch(args.mode,args.quiet)
 elif args.action=='stop':stop()
 elif args.action=='restore':restore(args.confirm_restore,args.snapshot)
 elif args.action=='snapshot-current':create_current_recovery()
 elif args.action=='environment':print(json.dumps(deployment_status()))
 elif args.action=='recoveries':print(json.dumps(recovery_catalog()))
 else:validate();print(json.dumps({'vm':UUID,'status':vm_status(),'hostShares':False,'clipboard':False,'usb':False,'network':'Restricted IPv4; only allowlisted public origins through external proxy','originalGuestFullAccessAvailable':True,'hostFullAccess':False},indent=2))
if __name__=='__main__':
 try:main()
 except Exception as e:print('操作停止：'+str(e),file=sys.stderr);raise SystemExit(1)
