import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('veloren_contract',Path(__file__).with_name('customer-veloren.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ContractTests(unittest.TestCase):
    def test_top_level_updates_preserve_nested_fields_world_and_comments(self):
        original='(world_seed: 42, gameplay: (max_players: 99, note: "a,b)"), /* nested /* comment */ */ max_players: 100, server_name: "Old")'
        updated=m.patch_ron(original,{'max_players':'8','server_name':'"New"','query_address':'None'})
        self.assertIn('world_seed: 42',updated)
        self.assertIn('gameplay: (max_players: 99, note: "a,b)")',updated)
        self.assertIn('/* nested /* comment */ */',updated)
        self.assertIn('max_players: 8',updated)
        self.assertIn('server_name: "New"',updated)
        self.assertIn('query_address: None,',updated)

    def test_missing_fields_and_trailing_comma_have_stable_repeated_updates(self):
        changes={'max_players':'8','server_name':'"Fixture"'}
        for original in ('()','(world_seed:42)','(world_seed:42,)','// header\n(world_seed:42,)// footer'):
            first=m.patch_ron(original,changes)
            self.assertEqual(m.patch_ron(first,changes),first)
            self.assertIn('max_players: 8',first)

    def test_malformed_duplicate_and_unreviewed_raw_strings_fail_closed(self):
        for text in ('(x:1,x:2)','(x:[1,2))','(x:"unclosed)','(x: /*unclosed)','(x:r"raw")','(x:1) extra','(x:)'):
            with self.assertRaises(ValueError):m.patch_ron(text,{'max_players':'8'})

    def test_name_and_slots_cannot_add_ports_paths_or_config_fields(self):
        valid={'name':'Fixture','maxPlayers':8}
        self.assertEqual(m.settings(json.dumps(valid),14004),valid)
        for update in ({'name':'bad\nname'},{'maxPlayers':True},{'maxPlayers':65},{'queryPort':14006}):
            with self.assertRaises(ValueError):m.settings(json.dumps(dict(valid,**update)),14004)
        with self.assertRaises(ValueError):m.settings(json.dumps(valid),14005)

    def test_preparation_retains_world_seed_and_configures_only_private_metrics(self):
        if os.name=='nt':self.skipTest('Linux private filesystem')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);config=root/'userdata/server/server_config/settings.ron';config.parent.mkdir(parents=True)
            config.write_text('(world_seed: 12345, max_players: 100,)')
            m.prepare(root,{'name':'Fixture','maxPlayers':8})
            self.assertIn('world_seed: 12345',config.read_text())
            self.assertIn('query_address: None',config.read_text())
            self.assertIn('gameserver_protocols: [Tcp(address: "0.0.0.0:14004")]',config.read_text())
            cli=root/'userdata/server-cli/settings.ron'
            self.assertIn('web_address: "127.0.0.1:14005"',cli.read_text())
            self.assertIn('shutdown_signals: [SIGTERM]',cli.read_text())
            self.assertIn('web_chat_secret: None',cli.read_text())

    def test_symlink_and_invalid_existing_config_are_never_overwritten(self):
        if os.name=='nt':self.skipTest('Linux private filesystem')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);outside=root/'outside';outside.write_text('(world_seed: 42,)');file=root/'settings.ron';file.symlink_to(outside)
            with self.assertRaises(OSError):m.write_ron(file,{'max_players':'8'})
            self.assertEqual(outside.read_text(),'(world_seed: 42,)')
            file.unlink();file.write_text('(x:1,x:2)')
            with self.assertRaises(ValueError):m.write_ron(file,{'max_players':'8'})
            self.assertEqual(file.read_text(),'(x:1,x:2)')

if __name__=='__main__':unittest.main()
