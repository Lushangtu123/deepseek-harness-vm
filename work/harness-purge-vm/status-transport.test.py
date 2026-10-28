"""Large migrated inventories must reach Python without a shell argument limit."""
import importlib.util, json, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

spec=importlib.util.spec_from_file_location('transport_manager',Path(__file__).with_name('manage.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class StatusTransport(unittest.TestCase):
 def test_real_plugin_scale_inventory_is_not_a_remote_shell_argument(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);folder=root/'recoveries'/m.CURRENT_RECOVERY;folder.mkdir(parents=True)
   files={m.RECOVERY_PLUGIN_ROOT+'dsh-context/node_modules/package/lib/subdirectory/module-'+str(i)+'.js':'a'*64 for i in range(1320)}
   files['tools/dsh-purge-personal-1.1.77-personal.1/client.js']='b'*64
   (folder/'guest-proof.json').write_text(json.dumps({'files':files}))
   actual={'mode':'improved','configDir':'/home/purge/.dsh-improved','modeFile':'improved','filesChecked':len(files),'differentFiles':[]}
   def transport(argv,**kwargs):
    self.assertEqual(argv[-1],'python3 -')
    self.assertLess(len(argv[-1].encode()),1024)
    script=kwargs.get('input','');self.assertGreater(len(script.encode()),131072)
    self.assertIn('module-1319.js',script)
    compile(script,'guest-status','exec')
    return subprocess.CompletedProcess(argv,0,json.dumps(actual),'')
   jobs={m.LABEL+'.plist':'same',m.WEB_LABEL+'.plist':'same'}
   with patch.object(m,'ROOT',root),patch.object(m,'validate'),patch.object(m,'verify_recovery_bundle',return_value=(folder,{'helpers':{name:'same' for name in m.RECOVERY_HELPERS},'launchAgents':jobs,'createdAt':'2026-10-27T00:00:00Z'})),patch.object(m,'current_host_inventory',return_value={name:'same' for name in m.RECOVERY_HELPERS}),patch.object(m,'current_launch_inventory',return_value=jobs),patch.object(m,'image_command',return_value=MagicMock(stdout=json.dumps({'snapshots':[{'name':m.CURRENT_RECOVERY}]}))),patch.object(m,'command',side_effect=transport):
    self.assertEqual(m.deployment_status()['mode'],'improved')
 def test_ssh_stdin_preserves_pinned_trust_and_content(self):
  script="print('合成 inventory')\n"
  with patch.object(m,'command') as command:
   m.ssh('python3 -',input=script,timeout=10)
   args=command.call_args.args[0]
   self.assertEqual(args[-2:],['purge@127.0.0.1','python3 -'])
   self.assertIn('StrictHostKeyChecking=yes',args)
   self.assertIn('GlobalKnownHostsFile=/dev/null',args)
   self.assertEqual(command.call_args.kwargs,{'timeout':10,'input':script})

if __name__=='__main__':unittest.main()
