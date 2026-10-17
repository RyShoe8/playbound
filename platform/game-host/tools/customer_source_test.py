import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('source', Path(__file__).with_name('customer-source.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeSourceContract(unittest.TestCase):
    def setUp(self):
        self.value = {'name': 'Private server', 'maxPlayers': 16, 'map': 'de_dust2', 'botFill': 4, 'rconPassword': 'fixture-password'}

    def test_secret_stays_in_private_cfg_and_bots_survive_map_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 27030, 'counter-strike-2')
            cfg = root/'private-cfg/playbound.cfg'
            self.assertEqual(cfg.stat().st_mode & 0o777, 0o600)
            self.assertIn('bot_quota_mode fill', cfg.read_text())
            self.assertIn('bot_quota 4', (root/'private-cfg/gamemode_competitive_server.cfg').read_text())
            command = module.arguments(self.value, 27030, 'counter-strike-2')
            self.assertNotIn(self.value['rconPassword'], command)
            self.assertEqual(command[0], '/game-data/game/bin/linuxsteamrt64/cs2')
            self.assertIn('/runtime/game', command)

    def test_css_uses_fixed_i386_engine_private_rules_and_fenced_client_port(self):
        value=dict(self.value,timeLimit=25)
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            module.prepare(root,value,27060,'counter-strike-source')
            self.assertIn('mp_timelimit 25', (root/'private-cfg/playbound.cfg').read_text())
        command=module.arguments(value,27060,'counter-strike-source')
        self.assertEqual(command[0],'/game-data/srcds_linux')
        self.assertIn('28060',command)
        self.assertNotIn(value['rconPassword'],command)
        for invalid in (True,-1,601):
            with self.assertRaises(ValueError):module.settings(json.dumps(dict(value,timeLimit=invalid)),27060,'counter-strike-source')

    def test_tf2_uses_only_64bit_engine_and_allocated_client_port(self):
        command = module.arguments(self.value, 27015, 'team-fortress-2')
        self.assertEqual(command[0], '/game-data/srcds_linux64')
        self.assertIn('28015', command)
        self.assertNotIn('srcds_run', ' '.join(command))
        with self.assertRaises(ValueError):
            module.arguments(self.value, 27030, 'team-fortress-2')

    def test_config_links_and_injected_fields_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module.prepare(root, self.value, 27030, 'counter-strike-2')
            cfg = root/'private-cfg/playbound.cfg'
            cfg.unlink()
            cfg.symlink_to(root/'outside')
            with self.assertRaises(ValueError):
                module.prepare(root, self.value, 27030, 'counter-strike-2')
        for changes in ({'name': 'name; quit'}, {'maxPlayers': True}, {'botFill': 16}, {'map': '../payload'}, {'binary': '/payload'}):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, **changes)), 27030, 'counter-strike-2')
        with self.assertRaises(ValueError):
            module.settings(json.dumps(self.value), 27030, 'goldeneye-source')


if __name__ == '__main__':
    unittest.main()
