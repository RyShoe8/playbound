import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

if os.name == 'nt': raise unittest.SkipTest('Linux sealed engine descriptors')
spec = importlib.util.spec_from_file_location('engine', Path(__file__).with_name('customer-native-engine.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@unittest.skipUnless(os.getuid() == 0, 'Root-owned executable fixtures')
class EngineBoundary(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.engine = self.root / 'managed' / 'teeworlds-server'
        self.engine.parent.mkdir()
        self.bytes = b'reviewed fixture engine'
        self.engine.write_bytes(self.bytes)
        self.engine.chmod(0o755)
        self.profile = self.root / 'profile.json'
        self.profile.write_text(json.dumps({'teeworlds': {'binaryBytes': len(self.bytes), 'binarySha256': hashlib.sha256(self.bytes).hexdigest()}}))

    def select(self):
        return module.sealed_engine(self.engine, self.profile)

    def test_sealed_copy_survives_path_replacement_and_cannot_be_written(self):
        fd = self.select()
        self.addCleanup(os.close, fd)
        self.engine.unlink()
        self.engine.write_bytes(b'changed after verification')
        self.assertEqual(os.read(fd, 1000), self.bytes)
        self.assertEqual(os.fstat(fd).st_mode & 0o777, 0o555)
        self.assertEqual(fcntl.fcntl(fd, fcntl.F_GET_SEALS), fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
        with self.assertRaises(OSError): os.write(fd, b'changed')
        with self.assertRaises(OSError): os.ftruncate(fd, 0)

    def test_missing_installation_only_falls_back_when_directory_is_absent(self):
        self.engine.unlink()
        with self.assertRaises(FileNotFoundError): self.select()
        self.engine.parent.rmdir()
        self.assertIsNone(self.select())

    def test_tampering_permissions_hardlinks_and_service_ownership_are_rejected(self):
        self.engine.write_bytes(b'x' * len(self.bytes))
        with self.assertRaises(ValueError): self.select()
        self.engine.write_bytes(self.bytes)
        for mode in (0o777, 0o4755, 0o644):
            self.engine.chmod(mode)
            with self.assertRaises(ValueError): self.select()
        self.engine.chmod(0o755)
        other = self.root / 'hardlink'
        os.link(self.engine, other)
        with self.assertRaises(ValueError): self.select()
        other.unlink()
        os.chown(self.engine, 65534, 65534)
        with self.assertRaises(ValueError): self.select()

    def test_symlinks_in_engine_profile_and_ancestors_are_rejected(self):
        original = self.root / 'original'
        self.engine.rename(original)
        self.engine.symlink_to(original)
        with self.assertRaises(OSError): self.select()
        self.engine.unlink()
        original.rename(self.engine)
        directory = self.root / 'renamed'
        self.engine.parent.rename(directory)
        self.engine.parent.symlink_to(directory, target_is_directory=True)
        with self.assertRaises(OSError): self.select()

    def test_profile_link_is_rejected(self):
        original = self.root / 'profile-original.json'
        self.profile.rename(original)
        self.profile.symlink_to(original)
        with self.assertRaises(OSError): self.select()

    def test_profile_must_be_root_owned_regular_and_not_writable(self):
        self.profile.chmod(0o666)
        with self.assertRaises(ValueError): self.select()
        self.profile.chmod(0o644)
        os.chown(self.profile, 65534, 65534)
        with self.assertRaises(ValueError): self.select()


if __name__ == '__main__': unittest.main()
