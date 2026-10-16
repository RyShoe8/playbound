import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

if os.name == 'nt': raise unittest.SkipTest('Linux sealed asset descriptors')
spec = importlib.util.spec_from_file_location('assets', Path(__file__).with_name('customer-game-assets.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(os.getuid() == 0, 'Root-owned asset manifest fixtures')
class AssetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.source = self.root/'data'; self.source.mkdir()
        self.data = b'name: reviewed fixture\n'
        self.asset = self.source/'index.yaml'; self.asset.write_bytes(self.data)
        self.profile = self.root/'profile.json'
        self.rows = [{'path':'index.yaml','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]
        self.save()

    def save(self):
        self.profile.write_text(json.dumps({'files':self.rows})); self.profile.chmod(0o644)

    def test_only_pinned_bytes_are_visible_and_cannot_change_after_selection(self):
        (self.source/'unlisted.yaml').write_bytes(b'not mounted')
        rows = module.seal_assets(self.source,self.profile)
        self.assertEqual(len(rows),1)
        descriptor,target = rows[0]
        try:
            self.assertEqual(target,'/game-data/index.yaml')
            self.asset.write_bytes(b'changed after selection')
            self.assertEqual(os.read(descriptor,1000),self.data)
            self.assertEqual(fcntl.fcntl(descriptor,fcntl.F_GET_SEALS),15)
            with self.assertRaises(OSError): os.write(descriptor,b'changed')
        finally: os.close(descriptor)

    def test_changed_linked_and_writable_assets_fail_closed(self):
        self.asset.write_bytes(b'changed')
        with self.assertRaises(ValueError): module.seal_assets(self.source,self.profile)
        self.asset.write_bytes(self.data); self.asset.chmod(0o666)
        with self.assertRaises(ValueError): module.seal_assets(self.source,self.profile)
        self.asset.unlink(); self.asset.symlink_to(self.profile)
        with self.assertRaises(OSError): module.seal_assets(self.source,self.profile)

    def test_traversal_duplicates_oversized_and_non_root_authority_are_rejected(self):
        for path in ['../index.yaml','/etc/passwd','maps/../../index.yaml','a.sh','a\\b.yaml']:
            self.rows[0]['path']=path; self.save()
            with self.assertRaises(ValueError): module.seal_assets(self.source,self.profile)
        self.rows[0]['path']='index.yaml'; self.rows*=2; self.save()
        with self.assertRaises(ValueError): module.seal_assets(self.source,self.profile)
        self.rows=self.rows[:1]; self.rows[0]['bytes']=1024**2+1; self.save()
        with self.assertRaises(ValueError): module.seal_assets(self.source,self.profile)
        self.rows[0]['bytes']=len(self.data); self.save(); os.chown(self.profile,65534,65534)
        with self.assertRaises(ValueError): module.seal_assets(self.source,self.profile)


if __name__ == '__main__': unittest.main()
