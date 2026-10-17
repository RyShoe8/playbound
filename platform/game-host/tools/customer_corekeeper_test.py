import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

if os.name == 'nt':
    raise unittest.SkipTest('Linux private Core Keeper candidate')

spec = importlib.util.spec_from_file_location('corekeeper', Path(__file__).with_name('customer-corekeeper.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CoreKeeperWorldContract(unittest.TestCase):
    def setUp(self):
        self.value = {'name': 'New world', 'maxPlayers': 12}

    def test_preserves_saved_world_identity_seed_and_custom_rules(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 1300)
            config = root/'data/ServerConfig.json'
            saved = {'gameId': 'retained', 'world': 4, 'worldName': 'Friends world',
                     'worldSeed': 1234, 'maxNumberPacketsSentPerFrame': 7,
                     'customRule': True, 'maxNumberPlayers': 4}
            config.write_text(json.dumps(saved))
            module.prepare(root, self.value, 1302)
            self.assertEqual(json.loads(config.read_text()), dict(saved, maxNumberPlayers=12))
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            args = module.arguments(self.value, 1302)
            self.assertNotIn('-nographics', args)
            self.assertIn('/server/data', args)
            self.assertNotIn('/opt/playbound-host', ' '.join(args))

    def test_links_and_malformed_existing_world_configuration_are_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 1300)
            config = root/'data/ServerConfig.json'
            config.write_text('{broken')
            with self.assertRaises(ValueError):
                module.prepare(root, self.value, 1300)
            self.assertEqual(config.read_text(), '{broken')
            config.unlink()
            outside = root/'outside'
            outside.write_text('{}')
            config.symlink_to(outside)
            with self.assertRaises(OSError):
                module.prepare(root, self.value, 1300)
            self.assertEqual(outside.read_text(), '{}')

    def test_typed_settings_and_port_pair(self):
        for port in (True, 1299, 1301, 1321):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(self.value), port)
        for changes in ({'maxPlayers': True}, {'maxPlayers': 65}, {'name': 'bad\nname'}, {'display': ':0'}):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, **changes)), 1300)

    def test_failed_display_guard_cannot_launch_game(self):
        helper = Mock()
        helper.start.side_effect = ValueError('missing enforced IPC label')
        with patch.object(module.subprocess, 'Popen') as launch:
            with self.assertRaises(ValueError):
                module.supervise(self.value, 1300, helper)
            launch.assert_not_called()

    def test_display_loss_stops_game_and_releases_private_display(self):
        display = Mock()
        display.environment = {'DISPLAY': ':1000', 'XAUTHORITY': '/server/.display/Xauthority'}
        display.process.poll.return_value = 1
        helper = Mock()
        helper.start.return_value = display
        game = Mock()
        game.poll.side_effect = [None, 0]
        game.wait.side_effect = [subprocess.TimeoutExpired('game', 10), 0]
        with patch.object(module.subprocess, 'Popen', return_value=game) as launch:
            self.assertEqual(module.supervise(self.value, 1300, helper), 1)
        game.terminate.assert_called_once()
        game.kill.assert_called_once()
        display.close.assert_called_once()
        self.assertEqual(launch.call_args.kwargs['env']['DISPLAY'], ':1000')
        self.assertNotIn('shell', launch.call_args.kwargs)

    def test_game_exit_preserves_status_and_closes_display(self):
        display = Mock()
        display.environment = {'DISPLAY': ':1000', 'XAUTHORITY': '/server/.display/Xauthority'}
        helper = Mock()
        helper.start.return_value = display
        game = Mock()
        game.poll.return_value = 7
        game.returncode = 7
        with patch.object(module.subprocess, 'Popen', return_value=game):
            self.assertEqual(module.supervise(self.value, 1300, helper), 7)
        display.close.assert_called_once()
        game.kill.assert_not_called()


if __name__ == '__main__':
    unittest.main()
