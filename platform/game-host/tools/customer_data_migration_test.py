import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

if os.name == 'nt':
    raise unittest.SkipTest('Migration checkpoint uses Linux directory FDs')
spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('customer-data-migration.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = '0123456789abcdef01234567'


class DataCheckpoint(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / 'source'
        self.source.mkdir(mode=0o700)
        self.uid = os.getuid()

    def scan(self, destination=None):
        fd = module.open_directory(self.source)
        try:
            return module.walk(fd, self.uid, destination)
        finally:
            os.close(fd)

    def test_only_fixed_actions_and_server_ids(self):
        self.assertEqual(module.arguments(['prepare', ID]), ['prepare', ID])
        for args in [[], ['activate', ID], ['prepare', '../etc'], ['verify', ID.upper()], ['verify', ID, '/other']]:
            with self.assertRaises(ValueError):
                module.arguments(args)

    def test_maps_empty_directories_and_binary_data_preserved(self):
        (self.source / 'maps').mkdir(mode=0o700)
        (self.source / 'empty').mkdir(mode=0o700)
        payload = bytes(range(256)) * 100
        (self.source / 'maps' / 'custom.map').write_bytes(payload)
        destination = self.base / 'copy'
        destination.mkdir(mode=0o700)
        manifest = self.scan(destination)
        self.assertEqual((destination / 'maps' / 'custom.map').read_bytes(), payload)
        self.assertTrue((destination / 'empty').is_dir())
        self.assertEqual(manifest, self.scan())
        self.assertEqual((self.source / 'maps' / 'custom.map').read_bytes(), payload)
        self.assertEqual((destination / 'maps' / 'custom.map').stat().st_mode & 0o777, 0o600)

    def test_symlinks_hardlinks_fifos_and_writable_files_rejected(self):
        outside = self.base / 'outside'
        outside.write_text('must not copy')
        candidate = self.source / 'unsafe'
        for create in [lambda: candidate.symlink_to(outside), lambda: os.link(outside, candidate), lambda: os.mkfifo(candidate)]:
            create()
            with self.assertRaises(ValueError):
                self.scan()
            candidate.unlink()
        candidate.write_text('writable')
        candidate.chmod(0o666)
        with self.assertRaises(ValueError):
            self.scan()
        self.assertEqual(outside.read_text(), 'must not copy')

    def test_intermediate_directory_symlinks_rejected(self):
        (self.base / 'link').symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(OSError):
            module.open_directory(self.base / 'link')

    def test_count_size_and_depth_bounds(self):
        (self.source / 'one').write_bytes(b'12345')
        for limit, value in [('MAX_ENTRIES', 0), ('MAX_FILE_BYTES', 4), ('MAX_BYTES', 4)]:
            with patch.object(module, limit, value), self.assertRaises(ValueError):
                self.scan()
        (self.source / 'nested').mkdir(mode=0o700)
        with patch.object(module, 'MAX_DEPTH', 0), self.assertRaises(ValueError):
            self.scan()

    def test_changed_file_during_read_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_read = os.read
        inode = file.stat().st_ino
        changed = False

        def mutate(fd, count):
            nonlocal changed
            data = original_read(fd, count)
            if not changed and os.fstat(fd).st_ino == inode:
                changed = True
                file.write_bytes(b'new data with a different length')
            return data

        with patch.object(module.os, 'read', side_effect=mutate), self.assertRaises(ValueError):
            self.scan()

    def test_replaced_file_before_open_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_open = os.open

        def swap(path, *args, **kwargs):
            if path == 'data':
                file.unlink()
                file.symlink_to(self.base / 'outside')
            return original_open(path, *args, **kwargs)

        with patch.object(module.os, 'open', side_effect=swap), self.assertRaises(OSError):
            self.scan()

    def test_file_changed_to_hardlink_after_stat_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_open = os.open

        def link(path, *args, **kwargs):
            if path == 'data':
                os.link(file, self.base / 'new-link')
            return original_open(path, *args, **kwargs)

        with patch.object(module.os, 'open', side_effect=link), self.assertRaises(ValueError):
            self.scan()

    def test_added_directory_entry_during_copy_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_read = os.read
        inode = file.stat().st_ino

        def add(fd, count):
            chunk = original_read(fd, count)
            if os.fstat(fd).st_ino == inode:
                (self.source / 'late').write_text('new save')
            return chunk

        with patch.object(module.os, 'read', side_effect=add), self.assertRaises(ValueError):
            self.scan()

    @unittest.skipUnless(os.getuid() == 0, 'Root-owned checkpoint integration fixture')
    def test_prepare_idempotency_drift_and_no_activation(self):
        source_root = self.base / 'legacy'
        source_root.mkdir(mode=0o700)
        self.source.rename(source_root / ('pb-' + ID))
        self.source = source_root / ('pb-' + ID)
        (self.source / 'saved.map').write_bytes(b'original saved game')
        root = self.base / 'runtime'

        def directory(path, uid=0, mode=0o711):
            path.mkdir(mode=mode, exist_ok=True)

        runtime = SimpleNamespace(directory=directory)
        trusted = SimpleNamespace(st_mode=0o100755, st_uid=0, st_nlink=1)
        actual_lstat = Path.lstat

        def lstat(path, *args, **kwargs):
            if str(path) == '/usr/local/libexec/playbound-customer-runtime':
                return trusted
            return actual_lstat(path, *args, **kwargs)

        with patch.object(module, 'SOURCE', source_root), patch.object(module, 'ROOT', root), patch.object(module, 'quiescent'), patch.object(Path, 'lstat', lstat), patch.object(module.importlib.util, 'module_from_spec', return_value=runtime), patch.object(module.importlib.machinery.SourceFileLoader, 'exec_module'):
            first = module.prepare(ID, self.uid)
            self.assertEqual(module.prepare(ID, self.uid), first)
            self.assertFalse((root / ID / 'data').exists())
            self.assertEqual((self.source / 'saved.map').read_bytes(), b'original saved game')
            snapshot = root / ID / 'control' / 'legacy-checkpoint-v1'
            self.assertEqual((snapshot / 'data' / 'saved.map').read_bytes(), b'original saved game')
            (self.source / 'saved.map').write_bytes(b'new progress')
            with self.assertRaisesRegex(ValueError, 'Source changed'):
                module.prepare(ID, self.uid)
            self.assertEqual((self.source / 'saved.map').read_bytes(), b'new progress')
            (snapshot / 'data' / 'saved.map').write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'verification failed'):
                module.verify(ID)

    def test_quiescence_failure_precedes_checkpoint_writes(self):
        source_root = self.base / 'legacy'
        source_root.mkdir(mode=0o700)
        self.source.rename(source_root / ('pb-' + ID))
        root = self.base / 'runtime'
        with patch.object(module, 'SOURCE', source_root), patch.object(module, 'ROOT', root), patch.object(module, 'quiescent', side_effect=ValueError('active process')):
            with self.assertRaisesRegex(ValueError, 'active process'):
                module.prepare(ID, self.uid)
        self.assertFalse(root.exists())


if __name__ == '__main__':
    unittest.main()
