import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest


def load(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
m=load('rimworld_contract','customer-rimworld.py')
b=load('rimworld_bootstrap','customer-rimworld-bootstrap.py')

class ContractTests(unittest.TestCase):
    def test_declared_difficulty_schema_stays_in_sync(self):
        fields=json.loads((Path(__file__).parent.parent/'rimworldDifficulty.json').read_text())
        self.assertEqual(m.DIFFICULTY,{row['key']:{key:row[key] for key in ('default','min','max') if key in row} for row in fields})
        values={'difficulty.'+row['key']:row['default'] for row in fields}
        value={'name':'Fixture','maxPlayers':16,'settings':values}
        self.assertEqual(m.settings(json.dumps(value),25590),value)
        self.assertEqual(m.configurations(value,25590)['DifficultyConfig.json'],{row['key']:row['default'] for row in fields})

    def test_unknown_commands_paths_and_wrong_types_are_rejected(self):
        valid={'name':'Fixture','maxPlayers':16,'settings':{}}
        for change in ({'maxPlayers':True},{'name':'bad\nname'},{'settings':{'exec':'shell'}},{'settings':{'automaticBackups':'true'}},{'settings':{'difficulty.ThreatScale':float('nan')}},{'settings':{'maxPlayers':8}}):
            with self.assertRaises(ValueError):m.settings(json.dumps(dict(valid,**change)),25590)
        with self.assertRaises(ValueError):m.settings(json.dumps(valid),25589)

    def test_configs_keep_browser_telemetry_and_upnp_disabled(self):
        value={'name':'Fixture','maxPlayers':16,'settings':{'backupCount':4,'storyteller':'Cassandra','messageOfTheDay':'Hello'}}
        result=m.configurations(m.settings(json.dumps(value),25590),25590)
        for key in ('EnableServerBrowser','EnableServerTelemetry','UseUPnP'):self.assertFalse(result['ServerConfig.json'][key])
        self.assertEqual(result['BackupConfig.json']['Amount'],4)
        self.assertEqual(result['StorytellerConfig.json']['DefName'],'Cassandra')
        self.assertEqual(result['ChatConfig.json']['MessageOfTheDay'],'Hello')

    def test_private_merge_preserves_existing_custom_difficulty(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)/'Configs';root.mkdir(mode=0o700)
            (root/'DifficultyConfig.json').write_text(json.dumps({'ThreatScale':3,'Custom':True}))
            b.write_configs(root,{'DifficultyConfig.json':{'ThreatScale':2}})
            self.assertEqual(json.loads((root/'DifficultyConfig.json').read_text()),{'ThreatScale':2,'Custom':True})

    def test_linked_or_hardlinked_config_never_changes_target(self):
        if os.name=='nt':self.skipTest('Linux filesystem identity')
        for link in ('symlink','hardlink'):
            with tempfile.TemporaryDirectory() as folder:
                root=Path(folder)/'Configs';root.mkdir(mode=0o700);outside=Path(folder)/'outside';outside.write_text('{}')
                target=root/'ServerConfig.json'
                if link=='symlink':target.symlink_to(outside)
                else:os.link(outside,target)
                with self.assertRaises((OSError,ValueError)):b.write_configs(root,{'ServerConfig.json':{'Name':'Changed'}})
                self.assertEqual(outside.read_text(),'{}')

if __name__=='__main__':unittest.main()
