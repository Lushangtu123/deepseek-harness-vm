import importlib.util,shlex,tempfile,unittest
from pathlib import Path

class KaliClient(unittest.TestCase):
 def module(self):
  path=Path(__file__).with_name('kali-vm.py')
  self.assertTrue(path.is_file(),'Dedicated Kali client missing')
  spec=importlib.util.spec_from_file_location('kali_client',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
 def test_exec_preserves_remote_argument_boundaries(self):
  mod=self.module();arguments=['printf','%s\n','a b','$(touch /tmp/unwanted)','; exit 42','']
  argv=mod.ssh_argv(['exec','--',*arguments],Path('/home/purge'))
  self.assertEqual(argv[:6],['/usr/bin/ssh','-F','/home/purge/.config/harness-kali/ssh_config','--','kali-lab',shlex.join(arguments)])
  self.assertEqual(len(argv),6)
 def test_shell_uses_fixed_target_and_no_implicit_privilege(self):
  mod=self.module();self.assertEqual(mod.ssh_argv(['shell'],Path('/home/purge')),['/usr/bin/ssh','-F','/home/purge/.config/harness-kali/ssh_config','--','kali-lab'])
  for arguments in [[],['exec'],['exec','--'],['shell','root'],['-o','User=root'],['anything']]:
   with self.subTest(arguments=arguments),self.assertRaises(ValueError):mod.ssh_argv(arguments,Path('/home/purge'))
 def test_status_is_fixed_readonly_guest_probe(self):
  mod=self.module();argv=mod.ssh_argv(['status'],Path('/home/purge'))
  self.assertEqual(argv[:5],['/usr/bin/ssh','-F','/home/purge/.config/harness-kali/ssh_config','--','kali-lab'])
  remote=shlex.split(argv[-1]);self.assertEqual(remote[:2],['python3','-c'])
  with tempfile.TemporaryDirectory() as directory:
   # The fixed status program only reads OS identity; compile catches malformed quoting.
   compile(remote[2],'<kali-status>','exec')
  self.assertNotIn('sudo',remote[2]);self.assertNotIn('subprocess',remote[2])

 def test_inventory_is_readonly_catalog_discovery_and_tool_arguments_stay_literal(self):
  mod=self.module();argv=mod.ssh_argv(['inventory'],Path('/home/purge'));remote=shlex.split(argv[-1]);self.assertEqual(remote[:2],['python3','-c']);compile(remote[2],'<inventory>','exec');self.assertIn('shutil',remote[2]);self.assertNotIn('sudo',remote[2])
  argv=mod.ssh_argv(['tool','nmap','--version','x; false','$(touch bad)'],Path('/home/purge'));remote=shlex.split(argv[-1]);self.assertEqual(remote[:2],['python3','-c']);self.assertEqual(remote[3:],['nmap','--version','x; false','$(touch bad)'])
  for value in [['tool','unknown'],['tool','../nmap'],['tool']]:
   with self.assertRaises(ValueError):mod.ssh_argv(value,Path('/home/purge'))

if __name__=='__main__':unittest.main()
