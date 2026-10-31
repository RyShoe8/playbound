import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('goldeneye', Path(__file__).with_name('customer-goldeneye.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

VALUE = {'name': 'PlayBound GE', 'maxPlayers': 8, 'map': 'ge_archives', 'timeLimit': 0, 'rconPassword': 'abc_123'}


class GoldenEyeContract(unittest.TestCase):
    def test_settings_are_exact_and_bounded(self):
        self.assertEqual(module.settings(json.dumps(VALUE), 27125), VALUE)
        for change in ({'map': '../x'}, {'name': ''}, {'name': 'a"b'}, {'rconPassword': 'x;quit'}, {'maxPlayers': 33},
                       {'maxPlayers': 1}, {'timeLimit': 601}, {'extra': 1}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                module.settings(json.dumps({**VALUE, **change}), 27125)
        for port in (27119, 27140, '27125'):
            with self.subTest(port=port), self.assertRaises(ValueError):
                module.settings(json.dumps(VALUE), port)

    def test_display_is_the_one_the_apparmor_profile_admits(self):
        self.assertEqual(module.display_for(40000), 1000)
        self.assertEqual(module.display_for(40255), 1255)
        for uid in (0, 39999, 40256):
            with self.assertRaises(ValueError):
                module.display_for(uid)

    def test_arguments_pin_the_bind_policy_ports(self):
        args = module.arguments(VALUE, 27125)
        self.assertEqual(args[:2], ['/usr/bin/wine', 'srcds.exe'])
        self.assertIn('-nohltv', args)
        self.assertEqual(args[args.index('+clientport') + 1], '28125')
        self.assertEqual(args[args.index('-port') + 1], '27125')
        self.assertEqual(args[-2:], ['+exec', 'pb-managed.cfg'])

    @unittest.skipIf(os.name == 'nt', 'directory descriptors are Linux-only')
    def test_mounts_bind_only_shipped_content_read_only(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            for name in module.TOP_FILES: (base/name).write_bytes(b'x')
            for name in module.TOP_DIRS: (base/name).mkdir()
            for name in ('gesource/maps', 'gesource/python/ges', 'gesource/materials'): (base/name).mkdir(parents=True)
            for name in ('gesource/gameinfo.txt', 'gesource/maps/ge_archives.bsp', 'gesource/python/python.log', 'gesource/python/README.md', 'gesource/console.log'):
                (base/name).write_bytes(b'x')
            (base/'gesource/cfg').mkdir(); (base/'gesource/maps/graphs').mkdir()
            descriptor = os.open(root, os.O_RDONLY)
            fds = Path(tempfile.mkdtemp(dir=root)); (fds/str(descriptor)).symlink_to(base)
            try:
                with unittest.mock.patch.object(module, 'Path', side_effect=lambda value: fds if str(value) == '/proc/self/fd' else Path(value)):
                    result = module.mounts(descriptor)
            finally:
                os.close(descriptor)
            targets = result[2::3]
            self.assertEqual(set(result[0::3]), {'--ro-bind'})
            self.assertIn('/server/runtime/gesource/python/README.md', targets)
            for private in ('cfg', 'maps/graphs', 'python/python.log', 'console.log'):
                self.assertNotIn('/server/runtime/gesource/' + private, targets)
            (base/'gesource/materials').rmdir(); (base/'gesource/materials').symlink_to('/etc')
            descriptor = os.open(root, os.O_RDONLY)
            fds = Path(tempfile.mkdtemp(dir=root)); (fds/str(descriptor)).symlink_to(base)
            try:
                with unittest.mock.patch.object(module, 'Path', side_effect=lambda value: fds if str(value) == '/proc/self/fd' else Path(value)):
                    with self.assertRaises(ValueError):
                        module.mounts(descriptor)
            finally:
                os.close(descriptor)


import unittest.mock
if __name__ == '__main__':
    unittest.main()
