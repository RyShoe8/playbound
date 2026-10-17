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
display_spec = importlib.util.spec_from_file_location('display_lifetime', Path(__file__).with_name('customer-display.py'))
display_module = importlib.util.module_from_spec(display_spec)
display_spec.loader.exec_module(display_module)



class CoreKeeperWorldContract(unittest.TestCase):
    def setUp(self):
        self.value = {'name': 'New world', 'maxPlayers': 12}

    @unittest.skipUnless(os.geteuid() == 0, 'Root-owned descriptor staging contract')
    def test_private_identity_mounts_pin_files_across_path_replacement(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            os.chown(root, 40254, 40254)
            mounts = module.identity_mounts(root, 40254)
            try:
                self.assertEqual([name for _, name in mounts], ['GameInfo.txt', 'GameID.txt'])
                for descriptor, name in mounts:
                    original = os.fstat(descriptor).st_ino
                    (root/name).unlink()
                    (root/name).write_text('replacement')
                    self.assertEqual(os.fstat(descriptor).st_ino, original)
                    self.assertNotEqual((root/name).stat().st_ino, original)
                    self.assertEqual(os.pread(descriptor, 100, 0), b'')
            finally:
                for descriptor, _ in mounts:
                    os.close(descriptor)

    @unittest.skipUnless(os.geteuid() == 0, 'Root-owned descriptor staging contract')
    def test_identity_mount_rejects_links_and_closes_earlier_descriptors(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            os.chown(root, 40254, 40254)
            (root/'GameID.txt').symlink_to('/etc/passwd')
            before = set(os.listdir('/proc/self/fd'))
            with self.assertRaises(OSError):
                module.identity_mounts(root, 40254)
            self.assertEqual(set(os.listdir('/proc/self/fd')), before)
            self.assertEqual((root/'GameInfo.txt').stat().st_uid, 40254)

    @unittest.skipUnless(os.geteuid() == 0, 'Root-owned descriptor staging contract')
    def test_identity_remount_preserves_saved_contents_and_rejects_exposed_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            os.chown(root, 40254, 40254)
            for name in ('GameInfo.txt', 'GameID.txt'):
                file = root/name
                file.write_bytes(b'persisted staging identity')
                file.chmod(0o600)
                os.chown(file, 40254, 40254)
            mounts = module.identity_mounts(root, 40254)
            try:
                for descriptor, _ in mounts:
                    self.assertEqual(os.pread(descriptor, 100, 0), b'persisted staging identity')
            finally:
                for descriptor, _ in mounts:
                    os.close(descriptor)
            (root/'GameID.txt').chmod(0o644)
            with self.assertRaises(ValueError):
                module.identity_mounts(root, 40254)

    def test_identity_mount_requires_root_and_reserved_uid(self):
        with patch.object(module.os, 'geteuid', return_value=1000), self.assertRaises(ValueError):
            module.identity_mounts(Path('/not-opened'), 40254)
        for uid in (True, 0, 39999, 40256, '40254'):
            with self.subTest(uid=uid), self.assertRaises(ValueError):
                module.identity_mounts(Path('/not-opened'), uid)

    def test_steam_binding_is_private_fixed_and_rejects_foreign_targets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 1300)
            link = root/'.steam/sdk64/steamclient.so'
            self.assertEqual(os.readlink(link), '/game-data/linux64/steamclient.so')
            module.prepare(root, self.value, 1300)
            link.unlink()
            link.symlink_to('/host/other-library.so')
            with self.assertRaises(ValueError):
                module.prepare(root, self.value, 1300)

    def test_identity_outputs_are_private_preserved_and_cannot_be_links(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 1300)
            identity = root/'GameID.txt'
            identity.write_bytes(b'private saved game identity')
            module.prepare(root, self.value, 1300)
            self.assertEqual(identity.read_bytes(), b'private saved game identity')
            self.assertEqual(identity.stat().st_mode & 0o777, 0o600)
            identity.unlink()
            identity.symlink_to(root/'GameInfo.txt')
            with self.assertRaises(ValueError):
                module.prepare(root, self.value, 1300)

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
        helper.supervise_game = display_module.supervise_game
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
        helper.supervise_game = display_module.supervise_game
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
        helper.supervise_game = display_module.supervise_game
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
