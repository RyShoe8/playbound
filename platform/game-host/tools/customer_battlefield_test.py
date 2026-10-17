import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('battlefield', Path(__file__).with_name('customer-battlefield.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BattlefieldOverlay(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.value = {'name': 'Private battlefield', 'maxPlayers': 32,
                      'map': 'berlin', 'gameMode': 'GPM_COOP', 'botSkill': 75}

    def test_retains_other_rules_and_replaces_unsafe_listener_settings(self):
        module.prepare(self.root, self.value, 14567)
        config = self.root/'settings/serversettings.con'
        config.write_text('game.serverName "old"\nGAME.SERVERPORT 1234\ngame.serverNumberOfRounds 3\n')
        module.prepare(self.root, self.value, 14568)
        text = config.read_text()
        self.assertIn('game.serverNumberOfRounds 3', text)
        self.assertNotIn('GAME.SERVERPORT 1234', text)
        self.assertIn('game.serverPort 14568', text)
        for value in ('game.serverInternet 0', 'game.gameSpyPort 0', 'game.ASEPort 0', 'game.serverPunkBuster 0'):
            self.assertIn(value, text)
        self.assertIn('game.addLevel berlin GPM_COOP bf1942', (self.root/'settings/maplist.con').read_text())
        self.assertEqual(config.stat().st_mode & 0o777, 0o600)

    def test_no_config_or_map_command_injection(self):
        for changes in ({'name': 'bad"; exit'}, {'map': '../map'}, {'gameMode': 'execute'},
                        {'botSkill': True}, {'maxPlayers': 65}, {'binary': '/payload'}):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, **changes)), 14567)
        for port in (True, 14566, 14587):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(self.value), port)

    def test_linked_overlay_does_not_modify_another_file(self):
        module.prepare(self.root, self.value, 14567)
        config = self.root/'settings/serversettings.con'
        config.unlink()
        outside = self.root/'outside'
        outside.write_text('retained')
        config.symlink_to(outside)
        with self.assertRaises(OSError):
            module.prepare(self.root, self.value, 14567)
        self.assertEqual(outside.read_text(), 'retained')


if __name__ == '__main__':
    unittest.main()
