import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

if os.name == 'nt':
    raise unittest.SkipTest('Linux GoldenEye private filesystem candidate')


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


module = load('goldeneye', 'customer-goldeneye.py')
private_files = load('source_files', 'customer-source.py')


class GoldenEyePrivateConfiguration(unittest.TestCase):
    def setUp(self):
        self.value = {'name': 'PlayBound server', 'maxPlayers': 16, 'map': 'ge_archives',
                      'timeLimit': 20, 'rconPassword': 'private-test-secret'}

    def test_command_is_fixed_and_never_contains_rcon_credentials(self):
        command = module.arguments(self.value, 27120)
        self.assertEqual(command[:2], ['/usr/bin/wine', '/server/runtime/srcds.exe'])
        self.assertIn('-strictportbind', command)
        self.assertIn('-norestart', command)
        self.assertNotIn(self.value['rconPassword'], command)
        self.assertEqual(command[-2:], ['+exec', 'pb-managed.cfg'])
        environment = module.environment()
        self.assertEqual(environment['WINEPREFIX'], '/server/wineprefix')
        self.assertEqual(environment['XDG_RUNTIME_DIR'], '/server/.runtime')
        self.assertNotIn('DISPLAY', environment)
        self.assertNotIn('XAUTHORITY', environment)

    def test_typed_settings_reject_injection_bots_and_caller_launch_options(self):
        for change in ({'name': 'bad;exec'}, {'name': 'bad\nname'}, {'rconPassword': 'bad"secret'},
                       {'map': '../other'}, {'maxPlayers': True}, {'maxPlayers': 65},
                       {'timeLimit': -1}, {'timeLimit': True}, {'botFill': 3},
                       {'prefix': '/other'}, {'command': 'exec'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, **change)), 27120)
        for port in (True, '27120', 27119, 27140):
            with self.assertRaises(ValueError):
                module.arguments(self.value, port)

    def test_generated_credentials_stay_private_and_other_rules_survive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 27120, private_files)
            cfg = root/'runtime/gesource/cfg'
            custom = cfg/'custom-rules.cfg'
            custom.write_text('custom rule')
            record = root/'runtime/gesource/python/gphashes.txt'
            record.write_bytes(b'private runtime state')
            module.prepare(root, dict(self.value, timeLimit=30), 27121, private_files)
            generated = cfg/'pb-managed.cfg'
            self.assertIn(self.value['rconPassword'], generated.read_text())
            self.assertIn('mp_timelimit 30', generated.read_text())
            self.assertEqual(generated.stat().st_mode & 0o777, 0o600)
            self.assertEqual(custom.read_text(), 'custom rule')
            self.assertEqual(record.read_bytes(), b'private runtime state')

    def test_linked_credentials_and_shared_prefixes_are_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 27120, private_files)
            generated = root/'runtime/gesource/cfg/pb-managed.cfg'
            outside = root/'outside'
            outside.write_text('unchanged')
            generated.unlink()
            generated.symlink_to(outside)
            with self.assertRaises(ValueError):
                module.prepare(root, self.value, 27120, private_files)
            self.assertEqual(outside.read_text(), 'unchanged')
            generated.unlink()
            (root/'wineprefix').rmdir()
            (root/'wineprefix').symlink_to(root/'runtime')
            with self.assertRaises(ValueError):
                module.prepare(root, self.value, 27120, private_files)


if __name__ == '__main__':
    unittest.main()
