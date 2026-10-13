import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

if os.name == 'nt':
    raise unittest.SkipTest('Linux namespace helper runs and is tested on the VPS')

spec = importlib.util.spec_from_file_location('aniv_host', Path(__file__).with_name('aniv-host.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Boundaries(unittest.TestCase):
    def test_query_counts_humans_and_never_guesses_on_malformed_replies(self):
        header=b'\xff\xff\xff\xffI\x11Server\0aneurismiv\0aniv\0ANEURISM IV\0\x00\x00'
        self.assertEqual(module.parse_occupancy(header+bytes([5,16,2])), {'players':3,'maxPlayers':16,'bots':2})
        self.assertEqual(module.parse_occupancy(header+bytes([0,16,0])), {'players':0,'maxPlayers':16,'bots':0})
        for packet in (b'', header, header+bytes([1,16,2]), header+bytes([17,16,0]), header+bytes([0,0,0])):
            self.assertIsNone(module.parse_occupancy(packet))
    def test_only_scoped_namespace_slots_are_accepted(self):
        self.assertEqual(module.placement(27700)[0], 'pb-aniv-27700')
        self.assertNotEqual(module.placement(27700)[4], module.placement(27701)[4])
        for slot in (0, 27015, 27716, 65535):
            with self.assertRaises(ValueError): module.placement(slot)

    def test_server_settings_cannot_be_shell_commands_or_unbounded(self):
        self.assertEqual(module.settings({'name':'A & B', 'maxPlayers':4})['map'], 'aneurismiv')
        self.assertEqual(module.settings({'name':'PlayBound.Club Community Server'})['name'], 'PlayBound Club Community Server')
        with self.assertRaises(ValueError): module.settings({'name':'...///'})
        for value in ({'maxPlayers':True}, {'maxPlayers':100}, {'map':'../other'}, {'name':'hello\nquit'}):
            with self.assertRaises(ValueError): module.settings(value)
        with self.assertRaises(ValueError): module.identity('../arbitrary')

    @unittest.skipIf(os.name == 'nt', 'Unix permission and symlink boundary')
    def test_credentials_cannot_follow_symlinks_or_read_other_owners(self):
        with tempfile.TemporaryDirectory() as directory:
            value=Path(directory)/'value'; value.write_text('fixture'); value.chmod(0o600)
            self.assertEqual(module.private_value(value, os.getuid()), 'fixture')
            with self.assertRaises(ValueError): module.private_value(value, os.getuid()+1)
            value.chmod(0o644)
            with self.assertRaises(ValueError): module.private_value(value, os.getuid())
            link=Path(directory)/'link'; link.symlink_to(value)
            with self.assertRaises(OSError): module.private_value(link, os.getuid())


if __name__ == '__main__': unittest.main()
