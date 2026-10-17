import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

if os.name == 'nt':
    raise unittest.SkipTest('Linux HX private filesystem candidate')

spec = importlib.util.spec_from_file_location('hx', Path(__file__).with_name('customer-hx.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HxPrivateState(unittest.TestCase):
    def test_fixed_wine_command_keeps_configuration_out_of_argv(self):
        command = module.arguments({'maxPlayers': 8}, 7790)
        self.assertEqual(command[:2], ['/usr/bin/wine', '/server/System/HCC.exe'])
        self.assertIn('-ini=HX.ini', command)
        self.assertIn('-userini=HXUser.ini', command)
        self.assertEqual(module.environment()['WINEPREFIX'], '/server/wineprefix')
        self.assertNotIn('DISPLAY', module.environment())

    def test_typed_slots_and_three_port_allocation(self):
        for port in range(7790, 7851, 3):
            self.assertEqual(module.settings('{"maxPlayers":8}', port), {'maxPlayers': 8})
        for port in (True, '7790', 7789, 7791, 7851):
            with self.assertRaises(ValueError):
                module.settings('{"maxPlayers":8}', port)
        for value in ({'maxPlayers': True}, {'maxPlayers': 9}, {'maxPlayers': 1}, {'maxPlayers': 8, 'command': 'exec'}):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(value), 7790)

    def test_private_rules_and_comments_survive_without_managed_duplicates(self):
        original = ('; custom rules\r\n[URL]\r\nPort=1\r\nMap=Mine\r\n'
                    '[url]\r\nPORT=2\r\n[Engine.GameInfo]\r\n'
                    'MaxPlayers=100\r\nDifficulty=3\r\n'
                    '[IpDrv.TcpNetDriver]\r\nAllowDownloads=True\r\n'
                    '[HX.HXUdpServerUplink]\r\nDoUplink=True\r\n')
        result = module.build_config(original, 7793, 4)
        lower = result.lower()
        for key, value in (('port', '7793'), ('maxplayers', '4'), ('allowdownloads', 'false'), ('douplink', 'false')):
            rows = [line for line in lower.splitlines() if line.strip().startswith(key+'=')]
            self.assertEqual(rows, [key+'='+value])
        self.assertIn('Map=Mine', result)
        self.assertIn('Difficulty=3', result)
        self.assertIn('; custom rules', result)
        self.assertEqual(module.build_config(result, 7793, 4), result)

    def test_invalid_text_is_not_silently_rewritten(self):
        for text in ('bad\x00text', 'a'*(1024**2+1), None):
            with self.assertRaises(ValueError):
                module.build_config(text, 7790, 8)

    @unittest.skipUnless(os.getuid() == 0, 'Root-owned immutable default fixture')
    def test_restart_preserves_private_world_and_ignores_changed_defaults(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base/'private'
            root.mkdir(mode=0o700)
            default = base/'HXDefault.ini'
            default.write_text('[Engine.GameInfo]\nDifficulty=2\n')
            default.chmod(0o444)
            module.prepare(root, default, {'maxPlayers': 8}, 7790)
            save = root/'Save/session.dxs'
            save.write_bytes(b'existing world')
            config = root/'System/HX.ini'
            config.write_text(config.read_text()+'\n[Custom]\nRule=keep\n')
            default.unlink()
            module.prepare(root, default, {'maxPlayers': 4}, 7793)
            self.assertIn('Rule=keep', config.read_text())
            self.assertIn('maxplayers=4', config.read_text())
            self.assertEqual(save.read_bytes(), b'existing world')
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            for name in ('Save', 'System', 'wineprefix', '.runtime', '.cache'):
                self.assertEqual((root/name).stat().st_mode & 0o777, 0o700)

    def test_links_and_exposed_private_files_are_rejected_without_replacement(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.private_directory(root, 'System')
            outside = root/'outside.ini'
            outside.write_text('[Custom]\nRule=keep\n')
            config = root/'System/HX.ini'
            config.symlink_to(outside)
            with self.assertRaises(OSError):
                module.prepare(root, root/'missing-default', {'maxPlayers': 8}, 7790)
            self.assertTrue(config.is_symlink())
            config.unlink()
            config.write_text('[Custom]\nRule=keep\n')
            config.chmod(0o644)
            with self.assertRaises(ValueError):
                module.prepare(root, root/'missing-default', {'maxPlayers': 8}, 7790)
            self.assertIn('Rule=keep', config.read_text())
            (root/'Save').rmdir()
            (root/'Save').symlink_to(root/'System')
            with self.assertRaises(ValueError):
                module.prepare(root, root/'missing-default', {'maxPlayers': 8}, 7790)


if __name__ == '__main__':
    unittest.main()
