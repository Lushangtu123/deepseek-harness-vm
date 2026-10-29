#!/usr/bin/env python3
"""One interactive entry for the existing dedicated Harness VM controller."""
import importlib.util
from pathlib import Path
import subprocess


MENU = """
Harness 启动与管理

  1  打开合并版（默认，保留原版能力开关状态）
  2  启用原版能力并打开（重启服务）
  3  停用原版能力并打开（重启服务）
  4  打开保留的完整原版（独立配置）
  5  检查当前状态（只读）
  6  正常关闭虚拟机
  7  恢复当前已验收版本（需先关闭虚拟机）
  8  修复合并版 pnpm 配置（仅已有构建配置，需 VM 运行）
  0  退出
"""


class LauncherNotice(Exception):
 pass


def load_manager():
 path=Path.home()/'Library/Application Support/Harness Purge Original/host-tools/manage.py'
 if not path.is_file() or path.is_symlink():
  raise LauncherNotice('未找到本机已安装的 Harness 控制器，请先核对安装路径。')
 spec=importlib.util.spec_from_file_location('harness_unified_manager',path)
 manager=importlib.util.module_from_spec(spec);spec.loader.exec_module(manager)
 return manager


def open_harness(manager):
 shortcut=manager.ROOT/'打开虚拟机Harness.webloc'
 if not shortcut.is_file() or shortcut.is_symlink():
  raise LauncherNotice('认证入口尚未确认，请先检查状态。')
 subprocess.run(['/usr/bin/open',str(shortcut)],check=True,capture_output=True,timeout=15)


def ensure_mode(manager,mode):
 manager.start(quiet=True)
 state=manager.deployment_status()
 if state.get('modeFileMatches') is not True or state.get('mode') not in ('original','improved'):
  raise LauncherNotice('当前运行模式未确认，请先检查状态。')
 if state['mode']!=mode:
  manager.switch(mode,quiet=True)
  state=manager.deployment_status()
 if state.get('modeFileMatches') is not True or state.get('mode')!=mode:
  raise LauncherNotice('切换后模式未确认，不会自动重试。')


def show_status(manager):
 manager.validate()
 vm=manager.vm_status()
 if vm=='stopped':
  print('虚拟机：已关闭。再次打开时会沿用保存的模式；当前运行状态未读取。')
  return
 if vm!='started':raise LauncherNotice('虚拟机不在运行或正常关闭状态，请先在 UTM 中核对。')
 state=manager.deployment_status()
 if state.get('modeFileMatches') is not True:raise LauncherNotice('当前运行模式与配置不一致，结果未确认。')
 if state.get('mode')=='improved':
  enabled=state.get('originalCapabilities')
  if type(enabled) is not bool:raise LauncherNotice('原版能力状态未确认。')
  print('虚拟机：运行中；合并版；原版能力：'+('启用' if enabled else '停用'))
 elif state.get('mode')=='original':print('虚拟机：运行中；保留的完整原版（独立配置）。')
 else:raise LauncherNotice('当前运行模式未确认。')
 recovery=state.get('recovery',{})
 print('恢复点：'+str(recovery.get('name','未确认'))+'；'+('覆盖匹配' if recovery.get('state')=='matches' else '需核对覆盖状态'))


def execute(choice):
 confirmations={
  '2':('启用','原版提示词、权限与沙盒将生效，服务会重启；先等待任务结束。'),
  '3':('停用','将切回日常运行时，服务可能重启；先等待任务结束。'),
  '4':('原版','将进入保留的完整原版独立配置；切换会重启服务。'),
  '6':('关闭','将正常关闭专用虚拟机和本机代理，请先结束任务。'),
  '8':('修复','仅修复合并版 web profile 的 pnpm 键污染，保留明确的 false；不重启、不安装插件。'),
 }
 if choice in confirmations:
  word,notice=confirmations[choice];print(notice)
  if input('输入“'+word+'”继续，其他输入取消：').strip()!=word:
   print('已取消。');return
 manager=load_manager()
 if choice=='8':
  repair=getattr(manager,'repair_profile',None)
  if not callable(repair):raise LauncherNotice('当前控制器尚不支持此维护操作。')
  value=repair(apply=True)
  if not isinstance(value,dict) or value.get('ok') is not True or value.get('profile')!='web' or value.get('dryRun') is not False or type(value.get('wrote')) is not bool:
   raise LauncherNotice('配置修复结果未确认，请先核对；不会自动重试。')
  print('pnpm 配置已修复，原文件备份已保留。' if value['wrote'] else '无需修复，未写入任何配置。')
  return
 if choice=='5':show_status(manager);return
 if choice=='6':manager.stop();return
 if choice=='7':
  snapshot=getattr(manager,'CURRENT_RECOVERY',None)
  if not isinstance(snapshot,str) or not snapshot:raise LauncherNotice('已验收恢复点未确认。')
  print('恢复 '+snapshot+' 会回退该点之后的 VM 文件、会话和配置。')
  if input('输入“恢复”执行，其他输入取消：').strip()!='恢复':
   print('已取消。');return
  manager.validate()
  if manager.vm_status()!='stopped':raise LauncherNotice('请先正常关闭虚拟机，再选择恢复；不会强制关机。')
  manager.restore(confirmed=True,snapshot=snapshot)
  return
 with manager.vm_operation('switch'):
  ensure_mode(manager,'original' if choice=='4' else 'improved')
  if choice in ('2','3'):
   control=getattr(manager,'original_capabilities',None)
   if not callable(control):raise LauncherNotice('当前已安装版本不支持原版能力开关，请核对恢复版本。')
   enabled=choice=='2';result=control('enable' if enabled else 'disable')
   if not isinstance(result,dict) or result.get('enabled') is not enabled or result.get('configured') is not enabled:
    raise LauncherNotice('切换结果未确认，请检查当前状态；不会自动重试。')
  open_harness(manager)
  print('已打开 Harness。切换过运行时后，请新建会话使用。')


def main():
 result=0
 while True:
  print(MENU)
  try:choice=input('请选择 [1]：').strip() or '1'
  except (EOFError,KeyboardInterrupt):print('\n已退出。');return result
  if choice=='0':return result
  if choice not in {'1','2','3','4','5','6','7','8'}:
   print('请输入 0 至 8。');continue
  try:execute(choice);result=0
  except EOFError:print('\n已取消。');return result
  except KeyboardInterrupt:print('\n操作已中断，请核对状态；不会自动重试。');return 130
  except LauncherNotice as error:print('操作未完成：'+str(error));result=1
  except Exception:print('操作未完成；结果尚未确认。请检查当前状态，不会自动重试。');result=1


if __name__=='__main__':raise SystemExit(main())
