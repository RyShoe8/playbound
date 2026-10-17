import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


module = load('fortress', 'customer-openfortress.py')
source = load('source', 'customer-source.py')


class OpenFortressPrivateLayout(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.public = base/'public'
        self.private = base/'private'
        self.private.mkdir(mode=0o700)
        for directory in ('bin', 'hl2', 'platform', 'open_fortress/bin',
                          'open_fortress/maps/graphs', 'defaults/cfg'):
            (self.public/directory).mkdir(parents=True, exist_ok=True)
        for name in ('bin/engine.so', 'bin/engine_srv.so', 'bin/steamclient.so',
                     'open_fortress/bin/server.so', 'open_fortress/bin/server_srv.so',
                     'open_fortress/maps/dm_2fort.bsp'):
            (self.public/name).write_bytes(b'fixture')
        (self.public/'defaults/cfg/server.cfg').write_text('owner default\n')
        (self.public/'open_fortress/gameinfo.txt').write_text('game "/opt/playbound-host/games/team-fortress-2/tf"\n')
        self.value = {'name': 'Private fortress', 'maxPlayers': 16, 'map': 'dm_2fort',
                      'botFill': 4, 'rconPassword': 'fixture-password', 'timeLimit': 20}

    def test_private_defaults_remain_and_gameinfo_uses_only_namespace_dependency(self):
        module.prepare(self.private, self.public, source, self.value, 27150)
        cfg = self.private/'runtime/open_fortress/cfg/server.cfg'
        cfg.write_text('owner retained\n')
        module.prepare(self.private, self.public, source, self.value, 27150)
        self.assertEqual(cfg.read_text(), 'owner retained\n')
        generated = (self.private/'runtime/open_fortress/cfg/playbound-managed.cfg').read_text()
        self.assertIn('tf_bot_quota_mode fill', generated)
        self.assertIn('mp_timelimit 20', generated)
        self.assertIn('"/tf2/tf"', (self.private/'runtime/open_fortress/gameinfo.txt').read_text())
        self.assertNotIn(self.value['rconPassword'], source.arguments(self.value, 27150, 'open-fortress'))
        self.assertFalse(any(p.is_symlink() for p in self.private.rglob('*')))

    def test_mounts_use_reviewed_sdk_aliases_and_leave_graphs_private(self):
        descriptor = os.open(self.public, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, descriptor)
        mounts = module.mounts(descriptor)
        bindings = dict((mounts[i+2], mounts[i+1]) for i in range(0, len(mounts), 3))
        self.assertTrue(bindings['/server/runtime/bin/engine.so'].endswith('/bin/engine_srv.so'))
        self.assertTrue(bindings['/server/runtime/open_fortress/bin/server_srv.so'].endswith('/bin/server.so'))
        self.assertNotIn('/server/runtime/open_fortress/maps/graphs', bindings)
        self.assertNotIn('/server/runtime/open_fortress/cfg', bindings)
        self.assertNotIn('/opt/playbound-host', ' '.join(mounts))

    def test_linked_defaults_and_sdk_libraries_fail_closed(self):
        module.prepare(self.private, self.public, source, self.value, 27150)
        cfg = self.private/'runtime/open_fortress/cfg/server.cfg'
        cfg.unlink()
        cfg.symlink_to(self.private/'outside')
        with self.assertRaises(ValueError):
            module.prepare(self.private, self.public, source, self.value, 27150)
        library = self.public/'bin/engine_srv.so'
        library.unlink()
        library.symlink_to(self.public/'bin/engine.so')
        descriptor = os.open(self.public, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, descriptor)
        with self.assertRaises(ValueError):
            module.mounts(descriptor)


if __name__ == '__main__':
    unittest.main()
