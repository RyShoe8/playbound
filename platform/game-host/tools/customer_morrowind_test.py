import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('morrowind', Path(__file__).with_name('customer-morrowind.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MorrowindPrivateWorld(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.root = base/'private'
        self.root.mkdir(mode=0o700)
        self.public = base/'public'
        (self.public/'server/scripts').mkdir(parents=True)
        (self.public/'server/data').mkdir()
        (self.public/'server/scripts/config.lua').write_text('config.gameMode = "Default"\nconfig.other = true\n')
        (self.public/'server/scripts/customScripts.lua').write_text('-- official scripts\n')
        (self.public/'server/data/requiredDataFiles.json').write_text('{}')
        self.hook = base/'reviewed.lua'
        self.hook.write_text('-- reviewed hook\n')
        self.value = {'name': 'Friends', 'maxPlayers': 8, 'password': '', 'gameMode': 'Default'}

    def test_keeps_character_world_and_admin_state(self):
        module.prepare(self.root, self.public, self.hook, self.value, 25565)
        files = ('server/data/player/Jacky Daytona.json', 'server/data/world/world.json',
                 'server/data/playbound-admins.json', 'server/data/requiredDataFiles.json')
        for name in files:
            file = self.root/name
            file.write_text('retained')
            file.chmod(0o600)
        self.value['gameMode'] = 'Cooperative'
        module.prepare(self.root, self.public, self.hook, self.value, 25566)
        for name in files:
            self.assertEqual((self.root/name).read_text(), 'retained')
        self.assertIn('config.gameMode = "Cooperative"', (self.root/'server/scripts/config.lua').read_text())
        self.assertIn('custom/playboundAdmin', (self.root/'server/scripts/customScripts.lua').read_text())
        self.assertIn('port = 25566', (self.root/'.config/openmw/tes3mp-server.cfg').read_text())
        self.assertEqual((self.root/'.config/openmw/tes3mp-server.cfg').stat().st_mode & 0o777, 0o600)

    def test_refuses_linked_private_scripts_without_touching_target(self):
        module.prepare(self.root, self.public, self.hook, self.value, 25565)
        config = self.root/'server/scripts/config.lua'
        config.unlink()
        outside = self.root/'untouched'
        outside.write_text('original')
        config.symlink_to(outside)
        with self.assertRaises(ValueError):
            module.prepare(self.root, self.public, self.hook, self.value, 25565)
        self.assertEqual(outside.read_text(), 'original')

    def test_rejects_script_and_ini_injection(self):
        for changes in ({'gameMode': 'Default"; os.execute("x")'}, {'name': 'Name\nport=1'},
                        {'password': 'x\n[Plugins]'}, {'maxPlayers': True}, {'maxPlayers': 65},
                        {'binary': '/payload'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, **changes)), 25565)
        with self.assertRaises(ValueError):
            module.settings(json.dumps(self.value), 25586)


if __name__ == '__main__':
    unittest.main()
