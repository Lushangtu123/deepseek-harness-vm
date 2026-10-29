import contextlib
import importlib.util
import io
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock,patch


class LauncherTests(unittest.TestCase):
 def load(self):
  path=Path(__file__).with_name('harness_launcher.py')
  self.assertTrue(path.is_file(),'Unified Harness menu is missing')
  spec=importlib.util.spec_from_file_location('launcher_fixture',path)
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  return module

 def manager(self,mode='improved',enabled=False,vm='started'):
  state={'mode':mode,'modeFileMatches':True,'originalCapabilities':enabled,'recovery':{'name':'ready-merged-switch-20261029','state':'matches'}}
  return SimpleNamespace(ROOT=Path('/synthetic/Harness VM'),CURRENT_RECOVERY='ready-merged-switch-20261029',
   validate=Mock(),vm_status=Mock(return_value=vm),deployment_status=Mock(return_value=state),
   start=Mock(),switch=Mock(),stop=Mock(),restore=Mock(),
   original_capabilities=Mock(return_value={'enabled':True,'configured':True}),
   vm_operation=Mock(side_effect=lambda action:contextlib.nullcontext()))

 def run_menu(self,inputs,manager=None):
  module=self.load();manager=manager or self.manager();output=io.StringIO()
  with patch.object(module,'load_manager',return_value=manager) as load,patch.object(module,'open_harness') as opened,patch('builtins.input',side_effect=inputs),contextlib.redirect_stdout(output):
   result=module.main()
  return manager,load,opened,output.getvalue(),result

 def test_exit_does_not_load_or_start_vm(self):
  _,load,opened,_,result=self.run_menu(['0'])
  load.assert_not_called();opened.assert_not_called();self.assertEqual(result,0)

 def test_eof_exits_without_default_start(self):
  _,load,opened,_,result=self.run_menu([EOFError()])
  load.assert_not_called();opened.assert_not_called();self.assertEqual(result,0)

 def test_enter_opens_improved_without_restart_or_changing_enabled_flag(self):
  manager=self.manager(enabled=True)
  _,_,opened,_,_=self.run_menu(['','0'],manager)
  manager.start.assert_called_once_with(quiet=True);manager.switch.assert_not_called()
  manager.original_capabilities.assert_not_called();opened.assert_called_once_with(manager)
  manager.vm_operation.assert_called_once_with('switch')

 def test_failed_start_never_opens_or_exposes_captured_error(self):
  manager=self.manager();manager.start.side_effect=RuntimeError('private-log-should-not-appear')
  _,_,opened,output,_=self.run_menu(['1','0'],manager)
  opened.assert_not_called();manager.switch.assert_not_called()
  self.assertNotIn('private-log-should-not-appear',output);self.assertIn('未完成',output)

 def test_cancelled_enable_has_no_mode_side_effect(self):
  manager,_,opened,_,_=self.run_menu(['2','取消','0'])
  manager.start.assert_not_called();manager.original_capabilities.assert_not_called();opened.assert_not_called()

 def test_enable_uses_existing_controller_after_confirmation(self):
  manager,_,opened,_,_=self.run_menu(['2','启用','0'])
  manager.original_capabilities.assert_called_once_with('enable');opened.assert_called_once_with(manager)

 def test_disable_rejects_contradictory_receipt_without_open_or_retry(self):
  manager=self.manager(enabled=True);manager.original_capabilities.return_value={'enabled':False,'configured':True}
  _,_,opened,output,_=self.run_menu(['3','停用','0'],manager)
  manager.original_capabilities.assert_called_once_with('disable');opened.assert_not_called();self.assertIn('未确认',output)

 def test_disable_qualifies_configured_state_even_when_runtime_is_already_off(self):
  manager=self.manager();manager.original_capabilities.return_value={'enabled':False,'configured':False,'changed':False}
  self.run_menu(['3','停用','0'],manager)
  manager.switch.assert_not_called();manager.original_capabilities.assert_called_once_with('disable')

 def test_original_mode_remains_a_separate_choice(self):
  manager=self.manager();manager.deployment_status.side_effect=[{'mode':'improved','modeFileMatches':True},{'mode':'original','modeFileMatches':True}]
  _,_,opened,_,_=self.run_menu(['4','原版','0'],manager)
  manager.switch.assert_called_once_with('original',quiet=True);manager.original_capabilities.assert_not_called();opened.assert_called_once_with(manager)

 def test_stopped_status_does_not_use_guest_ssh_or_start(self):
  manager=self.manager(vm='stopped')
  _,_,opened,output,_=self.run_menu(['5','0'],manager)
  manager.deployment_status.assert_not_called();manager.start.assert_not_called();opened.assert_not_called();self.assertIn('已关闭',output)

 def test_cancelled_restore_is_non_destructive(self):
  manager,_,_,_,_=self.run_menu(['7','yes','0'])
  manager.restore.assert_not_called();manager.start.assert_not_called();manager.stop.assert_not_called()

 def test_restore_requires_exact_confirmation_and_uses_installed_recovery(self):
  manager=self.manager(vm='stopped')
  self.run_menu(['7','恢复','0'],manager)
  manager.restore.assert_called_once_with(confirmed=True,snapshot=manager.CURRENT_RECOVERY)
  manager.start.assert_not_called();manager.stop.assert_not_called()

 def test_running_vm_restore_does_not_force_shutdown(self):
  manager,_,_,output,_=self.run_menu(['7','恢复','0'])
  manager.restore.assert_not_called();manager.stop.assert_not_called();self.assertIn('先正常关闭',output)

 def test_shutdown_is_explicit_and_does_not_open_browser(self):
  manager,_,opened,_,_=self.run_menu(['6','关闭','0'])
  manager.stop.assert_called_once_with();opened.assert_not_called()

 def test_unconfirmed_runtime_does_not_open_or_change_flag(self):
  manager=self.manager();manager.deployment_status.return_value['modeFileMatches']=False
  _,_,opened,_,_=self.run_menu(['1','0'],manager)
  opened.assert_not_called();manager.original_capabilities.assert_not_called()

 def test_invalid_choice_does_not_invoke_manager(self):
  _,load,opened,_,_=self.run_menu(['not-a-choice','0'])
  load.assert_not_called();opened.assert_not_called()

 def test_command_resolves_support_script_from_folder_with_spaces(self):
  source=Path(__file__).resolve().parents[1]/'Harness.command'
  self.assertTrue(source.is_file(),'Single double-click entry is missing')
  with tempfile.TemporaryDirectory(prefix='Harness launch ') as directory:
   root=Path(directory);shutil.copyfile(source,root/source.name);(root/'scripts').mkdir()
   (root/'scripts/harness_launcher.py').write_text("print('RELATIVE_LAUNCH_OK')\n")
   result=subprocess.run(['/bin/sh',str(root/source.name)],cwd='/private/tmp',capture_output=True,text=True,timeout=5)
   self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip(),'RELATIVE_LAUNCH_OK')


if __name__=='__main__':unittest.main()
