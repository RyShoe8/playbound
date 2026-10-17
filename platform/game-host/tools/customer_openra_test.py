import importlib.util
import json
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('openra_contract',Path(__file__).with_name('customer-openra.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class FamilyTests(unittest.TestCase):
    def test_all_seven_families_use_paired_engine_and_private_support_directory(self):
        for family,(binary,mods,image) in m.FAMILIES.items():
            for mod in mods:
                value={'family':family,'mod':mod,'name':'Fixture','enableSingleplayer':True,'lockBots':False}
                self.assertEqual(m.settings(json.dumps(value),'openra'),value)
                target,args=m.arguments(value,1234)
                self.assertEqual(target,'/game-data/'+binary)
                self.assertIn('Engine.SupportDir=/server',args)
                self.assertIn('Server.AdvertiseOnline=False',args)
                self.assertEqual('--appimage-extract-and-run' in args,image)
                self.assertEqual('--server' in args,image)

    def test_cross_family_mods_paths_flags_and_boolean_strings_are_rejected(self):
        valid={'family':'openra','mod':'ra','name':'Fixture','enableSingleplayer':True,'lockBots':False}
        for update in ({'mod':'rv'},{'family':'../openra'},{'engine':'shell'},{'lockBots':'True'},{'name':'bad\nname'}):
            with self.assertRaises(ValueError):m.settings(json.dumps(dict(valid,**update)),'openra')
        for game in ('openhv','earth-2140-trilogy','other'):
            with self.assertRaises(ValueError):m.settings(json.dumps(valid),game)
        for port in (True,1233,1251,1271,1291,'1234'):
            with self.assertRaises(ValueError):m.arguments(valid,port)

if __name__=='__main__':unittest.main()
