import configparser
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('dst', Path(__file__).with_name('customer-dst.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DstPrivateSettings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.cluster = self.root/'PlayBound/Cluster_1'
        self.cluster.mkdir(parents=True, mode=0o700)
        (self.root/'PlayBound').chmod(0o700)
        self.token = self.cluster/'cluster_token.txt'
        self.token.write_text('fixture-token-not-a-real-secret')
        self.token.chmod(0o600)
        self.value = {'name': 'Private % World', 'maxPlayers': 12}

    def test_preserves_world_options_and_never_puts_token_in_argv(self):
        config = self.cluster/'cluster.ini'
        config.write_text('[GAMEPLAY]\ngame_mode = endless\npvp = false\n[NETWORK]\ncluster_password = retained\n')
        config.chmod(0o600)
        module.prepare(self.root, self.value, 11020)
        module.prepare(self.root, self.value, 11020)
        parser = configparser.ConfigParser(interpolation=None)
        parser.read(config)
        self.assertEqual(parser['GAMEPLAY']['game_mode'], 'endless')
        self.assertEqual(parser['NETWORK']['cluster_password'], 'retained')
        self.assertEqual(parser['NETWORK']['cluster_name'], self.value['name'])
        self.assertEqual(parser['GAMEPLAY']['max_players'], '12')
        command = module.arguments(11020, 12)
        self.assertIn('11021', command)
        self.assertIn('11022', command)
        self.assertNotIn(self.token.read_text(), ' '.join(command))
        self.assertEqual(config.stat().st_mode & 0o777, 0o600)

    def test_token_failure_does_not_rewrite_configuration(self):
        config = self.cluster/'cluster.ini'
        config.write_text('[GAMEPLAY]\ngame_mode = endless\n')
        config.chmod(0o600)
        original = config.read_bytes()
        for text in ('', 'bad\nsecond-token', 'x'*4097):
            self.token.write_text(text)
            with self.subTest(text=text[:20]), self.assertRaises(ValueError):
                module.prepare(self.root, self.value, 11020)
            self.assertEqual(config.read_bytes(), original)

    def test_linked_token_and_directory_are_refused(self):
        self.token.unlink()
        outside = self.root/'outside'
        outside.write_text('fixture-token')
        outside.chmod(0o600)
        self.token.symlink_to(outside)
        with self.assertRaises(OSError):
            module.prepare(self.root, self.value, 11020)
        self.token.unlink()
        self.token.write_text('fixture-token')
        self.token.chmod(0o600)
        master = self.cluster/'Master'
        master.rmdir()
        master.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            module.prepare(self.root, self.value, 11020)

    def test_no_port_or_ini_injection(self):
        for port in (True, 11019, 11021, 11022, 11042):
            with self.subTest(port=port), self.assertRaises(ValueError):
                module.settings(json.dumps(self.value), port)
        for value in (dict(self.value, name='name\n[SHARD]'), dict(self.value, maxPlayers=True), dict(self.value, maxPlayers=65), dict(self.value, executable='payload')):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(value), 11020)


if __name__ == '__main__':
    unittest.main()
