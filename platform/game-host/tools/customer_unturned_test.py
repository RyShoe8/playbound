import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('unturned', Path(__file__).with_name('customer-unturned.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UnturnedPrivateSettings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.token = self.root/'gslt.txt'
        self.token.write_text('a'*32)
        self.token.chmod(0o600)
        self.value = {'name': 'Private server', 'maxPlayers': 12, 'map': 'PEI',
                      'perspective': 'Both', 'pve': False, 'cheats': False}

    def test_namespace_private_commands_preserve_saves_and_hide_token_from_argv(self):
        world = self.root/'world.save'
        world.write_bytes(b'retained world')
        module.prepare(self.root, self.value, 27075)
        file = self.root/'Server/Commands.dat'
        content = file.read_text()
        self.assertIn('Port 27075\n', content)
        self.assertIn('PvP\n', content)
        self.assertIn('GSLT '+'a'*32, content)
        self.assertNotIn('a'*32, ' '.join(module.arguments()))
        self.assertEqual(world.read_bytes(), b'retained world')
        self.assertEqual(file.stat().st_mode & 0o777, 0o600)
        self.value['pve'] = True
        module.prepare(self.root, self.value, 27078)
        self.assertIn('PvE\n', file.read_text())
        self.assertNotIn('PvP\n', file.read_text())

    def test_bad_or_linked_tokens_do_not_change_config(self):
        module.prepare(self.root, self.value, 27075)
        file = self.root/'Server/Commands.dat'
        original = file.read_bytes()
        for value in ('', 'bad', 'a'*129, 'a'*32+'\nName injected'):
            self.token.write_text(value)
            with self.assertRaises(ValueError):
                module.prepare(self.root, self.value, 27075)
            self.assertEqual(file.read_bytes(), original)
        self.token.unlink()
        self.token.symlink_to(file)
        with self.assertRaises(OSError):
            module.prepare(self.root, self.value, 27075)

    def test_setting_injection_and_wrong_strides_are_refused(self):
        for port in (True, 27074, 27076, 27077, 27100):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(self.value), port)
        for changes in ({'name': 'bad\nGSLT injected'}, {'map': '../world'},
                        {'perspective': 'bad'}, {'pve': 'true'}, {'maxPlayers': True},
                        {'cheats': 1}, {'token': 'caller-controlled'}):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, **changes)), 27075)


if __name__ == '__main__':
    unittest.main()
