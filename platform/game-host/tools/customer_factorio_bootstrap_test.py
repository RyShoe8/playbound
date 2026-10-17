import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('factorio',Path(__file__).with_name('customer-factorio-bootstrap.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class Child:
    def __init__(self, result=None):self.result=result;self.killed=False;self.reaped=False
    def poll(self):return self.result
    def kill(self):self.killed=True;self.result=-9
    def wait(self):self.reaped=True;return self.result

class LifecycleTests(unittest.TestCase):
    def test_typed_settings_reject_unrestricted_inputs(self):
        valid={'name':'PlayBound','maxPlayers':16,'port':34197}
        self.assertEqual(m.settings(json.dumps(valid)),valid)
        for changes in ({'port':34196},{'maxPlayers':True},{'maxPlayers':0},{'name':'bad\nname'},{'command':'shell'}):
            with self.assertRaises(ValueError):m.settings(json.dumps(dict(valid,**changes)))
        self.assertEqual(m.server_args(valid)[0],'/game-data/bin/x64/factorio')
        self.assertNotIn('shell',m.server_args(valid))

    def test_generated_settings_do_not_expose_shared_paths_or_public_listing(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m,'DATA',Path(folder)):
            m.write_configuration({'name':'My Server','maxPlayers':12,'port':34197})
            config=json.loads((Path(folder)/'server-settings.json').read_text())
            self.assertEqual(config['max_players'],12)
            self.assertEqual(config['visibility'],{'public':False,'lan':False})
            self.assertEqual(config['allow_commands'],'admins-only')
            self.assertEqual((Path(folder)/'config.ini').read_text(),'[path]\nread-data=/game-data/data\nwrite-data=/server\n')

    def test_timeout_and_cancellation_kill_and_reap_creation(self):
        for alive,clock in [(lambda:False,lambda:0),(lambda:True,iter([0,601]).__next__)]:
            child=Child()
            with self.assertRaises(ValueError):m.wait_for_world(child,alive,clock,lambda _:None)
            self.assertTrue(child.killed);self.assertTrue(child.reaped)
        with self.assertRaises(ValueError):m.wait_for_world(Child(1),lambda:True)

    def test_existing_world_skips_creation_and_partial_world_is_never_loaded(self):
        with tempfile.TemporaryDirectory() as folder:
            world=Path(folder)/'save.zip';world.write_bytes(b'existing')
            self.assertFalse(m.create_world(world,lambda _:self.fail('spawned'),lambda:True))
            world.unlink();(world.parent/'playbound-creating.zip').write_bytes(b'partial')
            with self.assertRaises(ValueError):m.create_world(world,lambda _:self.fail('spawned'),lambda:True)

    def test_success_commits_only_complete_world_after_owner_recheck(self):
        with tempfile.TemporaryDirectory() as folder:
            world=Path(folder)/'save.zip'
            def spawn(args):
                self.assertEqual(args[-1],'/server/saves/playbound-creating.zip')
                (world.parent/'playbound-creating.zip').write_bytes(b'complete')
                return Child(0)
            self.assertTrue(m.create_world(world,spawn,lambda:True))
            self.assertEqual(world.read_bytes(),b'complete')
            self.assertFalse((world.parent/'playbound-creating.zip').exists())

    def test_destination_race_preserves_existing_world(self):
        with tempfile.TemporaryDirectory() as folder:
            world=Path(folder)/'save.zip'
            def spawn(_):
                (world.parent/'playbound-creating.zip').write_bytes(b'new');return Child(0)
            original=m.os.link
            def racing_link(source,destination,**kwargs):
                world.write_bytes(b'existing');return original(source,destination,**kwargs)
            with patch.object(m.os,'link',side_effect=racing_link):
                with self.assertRaises(ValueError):m.create_world(world,spawn,lambda:True)
            self.assertEqual(world.read_bytes(),b'existing')

    def test_missing_output_and_cancelled_owner_never_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            world=Path(folder)/'save.zip'
            with self.assertRaises(ValueError):m.create_world(world,lambda _:Child(0),lambda:True)
            self.assertFalse(world.exists())
            alive=iter([True,True,False])
            def spawn(_):
                (world.parent/'playbound-creating.zip').write_bytes(b'complete');return Child(0)
            with self.assertRaises(ValueError):m.create_world(world,spawn,lambda:next(alive))
            self.assertFalse(world.exists())

if __name__=='__main__':unittest.main()
