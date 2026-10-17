import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

if os.name == 'nt':
    raise unittest.SkipTest('Linux private RVGL filesystem candidate')

spec = importlib.util.spec_from_file_location('rvgl', Path(__file__).with_name('customer-rvgl.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RvglLayout(unittest.TestCase):
    def test_private_layout_preserves_profile_and_never_creates_shared_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root)
            profile = root/'runtime/profiles/PlayBound.prf'
            profile.write_bytes(b'existing customer profile')
            module.prepare(root)
            self.assertEqual(profile.read_bytes(), b'existing customer profile')
            for name in module.PRIVATE_DIRECTORIES:
                directory = root/'runtime'/name
                self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
                self.assertFalse(directory.is_symlink())

    def test_linked_and_group_readable_private_directories_are_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root)
            folder = root/'runtime/profiles'
            folder.chmod(0o750)
            with self.assertRaises(ValueError):
                module.prepare(root)
            folder.chmod(0o700)
            folder.rmdir()
            folder.symlink_to(root/'runtime/cache')
            with self.assertRaises(ValueError):
                module.prepare(root)

    def test_only_fixed_lobby_command_and_allocated_ports(self):
        for port in (2310, 2330):
            command = module.arguments(port)
            self.assertEqual(command[0], '/server/runtime/rvgl.64')
            self.assertEqual(command[command.index('-serverport')+1], str(port))
            self.assertNotIn('xvfb-run', command)
        for port in (True, '2310', 2309, 2331, None):
            with self.assertRaises(ValueError):
                module.arguments(port)

    @unittest.skipUnless(os.getuid() == 0, 'Root-owned retained bundle fixture')
    def test_readonly_public_bindings_and_exact_library_alias(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in module.PUBLIC_DIRECTORIES:
                (root/name).mkdir(mode=0o555)
            for name in ('rvgl.64', 'gamecontrollerdb.txt', 'lib/libunistring.so.2'):
                file = root/name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(b'pinned public fixture')
                file.chmod(0o444)
            descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                bindings = module.mounts(descriptor)
                self.assertIn('/server/runtime/lib', bindings)
                for name in module.PRIVATE_DIRECTORIES:
                    self.assertNotIn('/server/runtime/'+name, bindings)
                alias = root/'lib/libunistring.so.2'
                alias.unlink()
                alias.symlink_to(root/'gamecontrollerdb.txt')
                with self.assertRaises(ValueError):
                    module.mounts(descriptor)
            finally:
                os.close(descriptor)


if __name__ == '__main__':
    unittest.main()
