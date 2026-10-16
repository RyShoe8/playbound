import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

if os.name=='nt': raise unittest.SkipTest('Root-owned Linux promotion fixtures')
spec=importlib.util.spec_from_file_location('promotion',Path(__file__).with_name('install-flightgear-customer-engine.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


@unittest.skipUnless(os.getuid()==0,'Root-owned engine promotion')
class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name);self.source=self.root/'fgms';self.destination=self.root/'published'
        self.data=b'reviewed relay fixture';self.source.write_bytes(self.data);self.source.chmod(0o755)
        digest=hashlib.sha256(self.data).hexdigest()
        self.manifest={'version':'fixture','binary':{'bytes':len(self.data),'sha256':digest},'legacyBinary':{'bytes':1,'sha256':'0'*64}}

    def test_promotion_retains_other_data_and_publishes_exact_root_manifest(self):
        result=module.promote(self.source,self.destination,self.manifest)
        self.assertEqual(result['changedProcesses'],0)
        self.assertEqual((self.destination/'fgms').read_bytes(),self.data)
        self.assertEqual((self.destination/'fgms').stat().st_mode&0o777,0o555)
        profile=json.loads((self.destination/'profile.json').read_text())['flightgear']
        self.assertEqual(profile['binarySha256'],hashlib.sha256(self.data).hexdigest())
        self.assertEqual(self.source.read_bytes(),self.data)

    def test_changed_or_linked_source_never_replaces_current_engine(self):
        module.promote(self.source,self.destination,self.manifest)
        self.source.write_bytes(b'changed')
        with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)
        self.assertEqual((self.destination/'fgms').read_bytes(),self.data)
        self.source.unlink();self.source.symlink_to(self.destination/'fgms')
        with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)

    def test_linked_destination_never_writes_elsewhere(self):
        elsewhere=self.root/'other';elsewhere.mkdir();self.destination.symlink_to(elsewhere)
        with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)
        self.assertEqual(list(elsewhere.iterdir()),[])


if __name__=='__main__':unittest.main()
