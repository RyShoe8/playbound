import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('ss14_contract',Path(__file__).with_name('customer-ss14.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ContractTests(unittest.TestCase):
    def test_native_status_and_data_paths_stay_with_allocated_server(self):
        value={'name':'Fixture','softMaxPlayers':16,'lobbyEnabled':True}
        args=m.arguments(m.settings(json.dumps(value),1222),1222)
        self.assertEqual(args[0],'/game-data/Robust.Server')
        self.assertIn('status.bind=*:1222',args)
        self.assertIn('/server/data',args)
        self.assertIn('/server/server_config.toml',args)
        self.assertIn('hub.advertise=false',args)
        self.assertIn('game.soft_max_players=16',args)

    def test_unknown_settings_commands_and_bad_types_are_rejected(self):
        valid={'name':'Fixture','softMaxPlayers':16,'lobbyEnabled':True}
        for update in ({'command':'shell'},{'softMaxPlayers':True},{'softMaxPlayers':65},{'lobbyEnabled':'True'},{'name':'bad\nname'}):
            with self.assertRaises(ValueError):m.settings(json.dumps(dict(valid,**update)),1212)
        for port in (True,1211,1223,'1212'):
            with self.assertRaises(ValueError):m.arguments(valid,port)

    def test_private_configuration_is_preserved_and_links_rejected(self):
        if os.name=='nt':self.skipTest('Linux private permissions')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);m.prepare(root)
            config=root/'server_config.toml';config.write_text('[hub]\nadvertise=false\n# custom\n')
            m.prepare(root);self.assertIn('# custom',config.read_text())
            outside=root/'outside';outside.write_text('untouched');config.unlink();config.symlink_to(outside)
            with self.assertRaises(ValueError):m.prepare(root)
            self.assertEqual(outside.read_text(),'untouched')

if __name__=='__main__':unittest.main()
