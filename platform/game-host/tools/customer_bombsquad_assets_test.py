import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

if os.name=='nt':raise unittest.SkipTest('Linux immutable dependency publication')
spec=importlib.util.spec_from_file_location('bomb_assets',Path(__file__).with_name('install-bombsquad-customer-assets.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


class NormalizationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.source=self.root/'source';self.source.mkdir();self.target=self.root/'target';self.target.mkdir()
        self.file=self.source/'dist'/'module.py';self.file.parent.mkdir();self.file.write_bytes(b'reviewed');self.file.chmod(0o775)
        self.row={'path':'dist/module.py','bytes':8,'sha256':hashlib.sha256(b'reviewed').hexdigest()}

    def test_group_writable_inputs_become_verified_readonly_copies(self):
        module.normalized_source(self.source,self.target,{'files':[self.row]})
        self.assertEqual((self.target/'dist/module.py').read_bytes(),b'reviewed')
        self.assertEqual((self.target/'dist/module.py').stat().st_mode&0o777,0o444)
        self.assertEqual(self.file.stat().st_mode&0o777,0o775)

    def test_changed_linked_and_traversing_dependencies_fail_closed(self):
        for row in (dict(self.row,path='../escape'),dict(self.row,bytes=2**30),dict(self.row,sha256='0'*64)):
            with self.assertRaises(ValueError):module.normalized_source(self.source,self.target,{'files':[row]})
        (self.target/'dist/module.py').unlink()
        self.file.unlink();self.file.symlink_to(self.root/'elsewhere')
        with self.assertRaises(OSError):module.normalized_source(self.source,self.target,{'files':[self.row]})

    def test_empty_package_initializers_are_pinned_without_broadening_paths(self):
        self.file.write_bytes(b'')
        row=dict(self.row,bytes=0,sha256=hashlib.sha256(b'').hexdigest())
        module.normalized_source(self.source,self.target,{'files':[row]})
        self.assertEqual((self.target/'dist/module.py').stat().st_size,0)

if __name__=='__main__':unittest.main()
