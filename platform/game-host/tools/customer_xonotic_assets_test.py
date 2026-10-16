import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

if os.name=='nt': raise unittest.SkipTest('Linux root-owned asset publication')
spec=importlib.util.spec_from_file_location('publication',Path(__file__).with_name('install-xonotic-customer-assets.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


@unittest.skipUnless(os.getuid()==0,'Root asset publication')
class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.source=self.root/'source';self.source.mkdir()
        self.destination=self.root/'published';self.data=b'reviewed pk3 fixture'
        (self.source/'data.pk3').write_bytes(self.data)
        self.manifest={'files':[{'path':'data.pk3','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]}

    def test_exact_atomic_copy_leaves_sources_and_published_root_unchanged(self):
        (self.source/'unlisted.pk3').write_bytes(b'not published')
        result=module.promote(self.source,self.destination,self.manifest)
        self.assertEqual(result['files'],1)
        self.assertEqual((self.destination/'data.pk3').read_bytes(),self.data)
        self.assertEqual(self.destination.stat().st_mode&0o777,0o555)
        self.assertEqual((self.destination/'data.pk3').stat().st_mode&0o777,0o444)
        self.assertFalse((self.destination/'unlisted.pk3').exists())
        with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)

    def test_changed_linked_oversized_or_traversing_inputs_never_publish(self):
        for changed in [{'path':'../escape.pk3'},{'bytes':3*1024**3},{'sha256':'0'*64}]:
            row=dict(self.manifest['files'][0],**changed)
            with self.assertRaises(ValueError):module.promote(self.source,self.destination,{'files':[row]})
            self.assertFalse(self.destination.exists())
        file=self.source/'data.pk3';file.unlink();file.symlink_to(self.source/'other')
        with self.assertRaises(OSError):module.promote(self.source,self.destination,self.manifest)
        self.assertFalse(self.destination.exists())
        self.assertEqual(list(self.root.glob('.pb-xonotic-assets-*')),[])

    def test_disk_pressure_and_linked_destination_fail_before_copy(self):
        with patch.object(module.shutil,'disk_usage',return_value=type('Disk',(),{'free':0})()):
            with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)
        self.destination.symlink_to(self.source)
        with self.assertRaises(ValueError):module.promote(self.source,self.destination,self.manifest)


@unittest.skipUnless(os.getuid()==0,'Root immutable descriptor fixtures')
class AssetDescriptorTests(unittest.TestCase):
    def setUp(self):
        loader=importlib.util.spec_from_file_location('asset_reader',Path(__file__).with_name('customer-xonotic-assets.py'))
        self.reader=importlib.util.module_from_spec(loader);loader.loader.exec_module(self.reader)
        # The reader deliberately rejects writable ancestors, including /tmp.
        self.temp=tempfile.TemporaryDirectory(prefix='.pb-asset-test-',dir='/usr/local/libexec')
        self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.data=b'reviewed pk3 fixture';self.asset=self.root/'data.pk3'
        self.asset.write_bytes(self.data);self.asset.chmod(0o444)
        self.profile=self.root/'profile.json'
        self.profile.write_text(json.dumps({'files':[{'path':'data.pk3','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]}))
        self.profile.chmod(0o444)

    def test_retained_descriptor_references_only_the_reviewed_root_tree(self):
        descriptor=self.reader.open_assets(self.root)
        try:
            self.assertEqual(set(os.listdir(descriptor)),{'profile.json','data.pk3'})
            with os.fdopen(os.open('data.pk3',os.O_RDONLY,dir_fd=descriptor),'rb') as file:
                self.assertEqual(file.read(),self.data)
        finally:os.close(descriptor)

    def test_changed_linked_writable_and_unlisted_files_fail_closed(self):
        self.asset.chmod(0o644)
        with self.assertRaises(ValueError):self.reader.open_assets(self.root)
        self.asset.chmod(0o444);self.asset.write_bytes(b'changed')
        with self.assertRaises(ValueError):self.reader.open_assets(self.root)
        self.asset.write_bytes(self.data);extra=self.root/'unlisted.pk3';extra.write_bytes(b'extra')
        with self.assertRaises(ValueError):self.reader.open_assets(self.root)
        extra.unlink();self.asset.unlink();self.asset.symlink_to(self.profile)
        with self.assertRaises(OSError):self.reader.open_assets(self.root)

    def test_nested_engine_assets_reject_intermediate_links_and_extra_files(self):
        self.asset.unlink()
        folder=self.root/'legacy';folder.mkdir(mode=0o555)
        file=folder/'qagame.mp.x86_64.so';file.write_bytes(self.data);file.chmod(0o444)
        self.profile.write_text(json.dumps({'files':[{'path':'legacy/qagame.mp.x86_64.so','bytes':len(self.data),'sha256':hashlib.sha256(self.data).hexdigest()}]}))
        descriptor=self.reader.open_assets(self.root,game='wolfenstein-enemy-territory');os.close(descriptor)
        extra=folder/'extra.so';extra.write_bytes(b'extra')
        with self.assertRaises(ValueError):self.reader.open_assets(self.root,game='wolfenstein-enemy-territory')
        extra.unlink();folder.rename(self.root/'elsewhere');folder.symlink_to(self.root/'elsewhere')
        with self.assertRaises(OSError):self.reader.open_assets(self.root,game='wolfenstein-enemy-territory')


if __name__=='__main__':unittest.main()
