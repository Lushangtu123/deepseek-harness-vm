import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,MagicMock
spec=importlib.util.spec_from_file_location('catalog_manager',Path(__file__).with_name('manage.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RecoveryCatalog(unittest.TestCase):
 def catalog(self,root,snapshots=None,fail=False,real_verify=False,after=None):
  (root/'recoveries').mkdir(exist_ok=True)
  image=root/'Harness Purge Original.utm/Data/ubuntu.qcow2';image.parent.mkdir(parents=True,exist_ok=True);image.write_bytes(b'synthetic')
  verify=patch.object(m,'verify_recovery_bundle',wraps=m.verify_recovery_bundle) if real_verify else patch.object(m,'verify_recovery_bundle',return_value=(root,{'createdAt':'2026-10-27T00:00:00Z'}))
  with patch.object(m,'ROOT',root),patch.object(m,'VM',image.parent.parent),patch.object(m,'validate'),patch.object(m,'image_command',side_effect=OSError('private failure') if fail else None,return_value=MagicMock(stdout=json.dumps({'snapshots':snapshots or []}))),verify:
   return m.recovery_catalog() if after is None else m.recovery_catalog(after=after)
 def test_catalog_protects_baselines_and_latest_three_without_deleting(self):
  self.assertTrue(callable(getattr(m,'recovery_catalog',None)),'Missing read-only recovery catalog')
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();(root/'recoveries').mkdir()
   for name in m.REVIEWED_RECOVERIES:(root/'recoveries'/name).mkdir()
   snapshots=[{'name':name} for name in ['ready-original','ready-toolchain-20261025',*m.REVIEWED_RECOVERIES]]
   result=self.catalog(root,snapshots)
   self.assertTrue(result['readOnly']);self.assertEqual(result['snapshotState'],'observed')
   by_name={row['name']:row for row in result['snapshots']}
   for name in ['ready-original','ready-toolchain-20261025',*m.REVIEWED_RECOVERIES[-3:]]:self.assertTrue(by_name[name]['protected'])
   self.assertTrue(by_name[m.REVIEWED_RECOVERIES[0]]['reviewCandidate'])
   self.assertTrue(all((root/'recoveries'/name).is_dir() for name in m.REVIEWED_RECOVERIES))
 def test_archives_never_follow_symlinks_or_claim_reclaimable_shared_blocks(self):
  self.assertTrue(callable(getattr(m,'recovery_catalog',None)))
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();archive=root/'archived-validation';archive.mkdir();good=archive/'restore-probe-workbench-v5-20261027/offline-image/Data/ubuntu.qcow2';good.parent.mkdir(parents=True);good.write_bytes(b'archive')
   outside=root/'outside';outside.mkdir();(outside/'private.qcow2').write_bytes(b'private')
   (archive/'linked-dir').symlink_to(outside,target_is_directory=True);(archive/'linked.qcow2').symlink_to(outside/'private.qcow2')
   result=self.catalog(root)
   self.assertEqual(len(result['images']),1);self.assertEqual(result['images'][0]['logicalBytes'],7)
   self.assertNotIn('private',json.dumps(result));self.assertNotIn('reclaimableBytes',json.dumps(result))
 def test_unavailable_disk_metadata_is_not_reported_as_no_snapshots(self):
  self.assertTrue(callable(getattr(m,'recovery_catalog',None)))
  with tempfile.TemporaryDirectory() as temp:
   result=self.catalog(Path(temp).resolve(),fail=True)
   self.assertEqual(result['snapshotState'],'unavailable');self.assertNotIn('private failure',json.dumps(result))
 def test_depth_and_read_error_limits_explicitly_mark_partial_results(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();deep=root/'archived-validation/a/b/c/d/e/f/image.qcow2';deep.parent.mkdir(parents=True);deep.write_bytes(b'deep')
   result=self.catalog(root);self.assertTrue(result['truncated']);self.assertEqual(result['images'],[])
   def unreadable(base,**kwargs):
    kwargs.get('onerror',lambda error:None)(PermissionError('synthetic unreadable directory'));return iter([])
   with patch.object(m.os,'walk',side_effect=unreadable):self.assertTrue(self.catalog(root)['truncated'])
 def test_one_malformed_old_archive_does_not_hide_the_remaining_catalog(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();old=root/'recoveries'/m.REVIEWED_RECOVERIES[0];old.mkdir(parents=True);(old/'manifest.json').write_text('[]')
   result=self.catalog(root,[{'name':old.name}],real_verify=True)
   by_name={row['name']:row for row in result['snapshots']}
   self.assertEqual(by_name[old.name]['bundleState'],'invalid')
   self.assertIn(m.CURRENT_RECOVERY,by_name)
 def test_metadata_trees_do_not_hide_known_offline_images(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();archive=root/'archived-validation'
   for i in range(3):
    entry=archive/f'restore-probe-{i:02d}'
    for n in range(180):(entry/'host-tools'/f'cache-{n}').mkdir(parents=True)
    image=entry/'offline-image/Data/ubuntu.qcow2';image.parent.mkdir(parents=True);image.write_bytes(b'image')
   result=self.catalog(root)
   self.assertFalse(result['truncated']);self.assertEqual(len(result['images']),3)
   self.assertEqual(result['archiveScan']['skippedMetadataDirectories'],3)
 def test_archive_pages_cover_all_entries_without_duplicates(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();archive=root/'archived-validation'
   expected=[]
   for i in range(35):
    image=archive/f'probe-{i:02d}/offline-image/Data/ubuntu.qcow2';image.parent.mkdir(parents=True);image.write_bytes(b'image');expected.append(str(image.relative_to(archive)))
   after=None;seen=[];cursors=set()
   for page in range(4):
    result=self.catalog(root,after=after);self.assertFalse(result['truncated']);self.assertLessEqual(result['archiveScan']['entriesScanned'],16)
    seen.extend(row['id'] for row in result['images']);after=result['nextCursor']
    if after is None:break
    self.assertNotIn(after,cursors);cursors.add(after)
   self.assertEqual(seen,expected);self.assertEqual(len(cursors),2)
 def test_invalid_archive_cursor_cannot_escape_the_fixed_root(self):
  with tempfile.TemporaryDirectory() as temp:
   for cursor in ['../outside','a/b','.hidden','provider-name','x'*241]:
    with self.subTest(cursor=cursor),self.assertRaises(ValueError):self.catalog(Path(temp).resolve(),after=cursor)
 def test_depth_limit_is_named_and_not_silently_complete(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp).resolve();image=root/'archived-validation/a/b/c/d/e/f/image.qcow2';image.parent.mkdir(parents=True);image.write_bytes(b'image')
   result=self.catalog(root);self.assertTrue(result['truncated']);self.assertIn('depth-limit',result['archiveScan']['reasons'])
 def test_exact_page_budgets_do_not_consume_the_next_unvisited_archive(self):
  for budget in ['directories','images']:
   with self.subTest(budget=budget),tempfile.TemporaryDirectory() as temp:
    root=Path(temp).resolve();archive=root/'archived-validation';large=archive/'a-large';large.mkdir(parents=True)
    if budget=='directories':
     for i in range(511):(large/f'dir-{i:03d}').mkdir()
    else:
     for i in range(80):(large/f'image-{i:02d}.qcow2').write_bytes(b'image')
    for name in ['b-image','c-image']:
     image=archive/name/'disk.qcow2';image.parent.mkdir();image.write_bytes(b'image')
    first=self.catalog(root);self.assertEqual(first['nextCursor'],'a-large');self.assertFalse(first['truncated'])
    second=self.catalog(root,after=first['nextCursor']);self.assertIsNone(second['nextCursor']);self.assertFalse(second['truncated'])
    self.assertEqual([row['id'] for row in second['images']],['b-image/disk.qcow2','c-image/disk.qcow2'])
if __name__=='__main__':unittest.main()
