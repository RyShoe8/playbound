import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('rim_console', Path(__file__).with_name('customer-rimworld-console.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RimworldConsole(unittest.TestCase):
    def test_one_bounded_line_only(self):
        self.assertEqual(module.validate_command({'command': '  list '}), 'list')
        for value in ({'command': ''}, {'command': 'a\nb'}, {'command': 'x' * 201}, {'command': 'say\x00'},
                      {'command': 1}, {'cmd': 'list'}, {'command': 'list', 'extra': 1}, ['list']):
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.validate_command(value)

    def test_status_must_be_fresh_and_well_formed(self):
        now = 1_000_000
        doc = {'players': [{'name': 'Ana', 'id': None}], 'maxPlayers': 4, 'updatedAt': now - 500, 'pid': 7}
        self.assertEqual(module.validate_status(doc, now), {'players': [{'name': 'Ana', 'id': None}], 'maxPlayers': 4, 'updatedAt': now - 500})
        for bad in ({**doc, 'updatedAt': now - 20_000}, {**doc, 'updatedAt': now + 5_000}, {**doc, 'maxPlayers': 0},
                    {**doc, 'players': [{'name': 3}]}, {**doc, 'players': 'x'}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                module.validate_status(bad, now)

    def test_identity_is_validated_before_any_helper_loads(self):
        for args in (('status', 'not-an-id', '5', 'a' * 36 + ':1'), ('command', 'a' * 24, '1', 'a' * 36 + ':1'),
                     ('shell', 'a' * 24, '5', 'a' * 36 + ':1'), ('status', 'a' * 24, '5', '../x')):
            with self.subTest(args=args), self.assertRaises(ValueError):
                module.identity(*args)


if __name__ == '__main__':
    unittest.main()
