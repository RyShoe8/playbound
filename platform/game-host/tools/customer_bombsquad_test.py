import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('bombsquad', Path(__file__).with_name('customer-bombsquad.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BombSquadControllerBoundary(unittest.TestCase):
    def test_fixed_controller_keeps_game_state_and_disables_public_listing(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root/'saved-state').write_bytes(b'keep')
            module.prepare(root, {'name': 'Private squad', 'maxPlayers': 6}, 43210)
            config = root/'controller-config.json'
            value = json.loads(config.read_text())
            self.assertEqual(value['session_max_players_override'], 6)
            self.assertEqual(value['max_party_size'], 7)
            self.assertFalse(value['party_is_public'])
            self.assertTrue(value['dont_write_bytecode'])
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            self.assertEqual((root/'saved-state').read_bytes(), b'keep')
            self.assertEqual(module.arguments()[0], '/python/bin/python3.14')
            self.assertNotIn('--exec', module.arguments())
            config.unlink()
            config.symlink_to(root/'saved-state')
            with self.assertRaises(ValueError):
                module.prepare(root, {'name': 'Private squad', 'maxPlayers': 6}, 43210)

    def test_no_arbitrary_controller_code_or_outside_ports(self):
        valid = {'name': 'Private squad', 'maxPlayers': 6}
        for changes in ({'exec': 'payload'}, {'name': 'bad\nname'}, {'maxPlayers': 9}, {'maxPlayers': True}):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(dict(valid, **changes)), 43210)
        for port in (True, 43209, 43231):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(valid), port)


if __name__ == '__main__':
    unittest.main()
