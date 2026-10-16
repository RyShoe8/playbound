import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

if os.name == 'nt':
    raise unittest.SkipTest('Isolated snapshots require Linux directory descriptors')


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


backup = load('backup', 'customer-world-backups.py')
runtime = load('runtime', 'customer-runtime.py')
migration = load('migration', 'customer-data-migration.py')
ID = '0123456789abcdef01234567'


@unittest.skipUnless(os.getuid() == 0, 'Root-owned snapshot boundary fixtures')
class WorldSnapshots(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        Path(self.temp.name).chmod(0o711)
        self.root = Path(self.temp.name) / 'runtime'
        self.server = self.root / ID
        self.control = self.server / 'control'
        self.data = self.server / 'data'
        self.legacy = Path(self.temp.name) / 'legacy'
        self.legacy.mkdir()
        self.seal = self.legacy / ('pb-' + ID)
        for path, mode in [(self.root, 0o711), (self.server, 0o711), (self.control, 0o700), (self.data, 0o700), (self.seal, 0o700)]:
            path.mkdir(mode=mode)
        os.chown(self.data, 65534, 65534)
        self.file = self.data / 'saved.dat'
        self.write('original')
        self.journal = {'version': 1, 'serverId': ID, 'gameSlug': 'luanti', 'phase': 'active', 'uid': 65534,
                        'activationInode': migration.inode(self.data), 'sealedSourceInode': migration.inode(self.seal)}
        (self.control / 'migration.json').write_text(json.dumps(self.journal))
        (self.control / 'migration.json').chmod(0o600)
        select_runtime = runtime.select_game
        select_migration = migration.select_game

        def choose_runtime(game):
            select_runtime(game)
            runtime.LEGACY_ROOT = self.legacy

        def choose_migration(game):
            select_migration(game)
            migration.SOURCE = self.legacy

        for module in [backup, runtime, migration]:
            patcher = patch.object(module, 'ROOT', self.root)
            patcher.start()
            self.addCleanup(patcher.stop)
        for module, name, replacement in [(runtime, 'select_game', choose_runtime), (migration, 'select_game', choose_migration), (migration, 'quiescent', Mock())]:
            patcher = patch.object(module, name, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.identities = SimpleNamespace(ensure_identity=lambda _: {'uid': 65534, 'gid': 65534}, secure_stat=Mock())

    def write(self, text):
        self.file.write_text(text)
        self.file.chmod(0o600)
        os.chown(self.file, 65534, 65534)

    def run_operation(self, action, token=None):
        return backup.operation(action, ID, token, runtime, self.identities, migration)

    def test_snapshot_restore_preserves_uid_and_updates_runtime_data_identity(self):
        value = self.run_operation('create')
        self.assertEqual(value['files'], 1)
        self.assertEqual(self.run_operation('list')[0]['id'], value['id'])
        self.write('newer progress')
        self.run_operation('restore', value['id'])
        self.assertEqual(self.file.read_text(), 'original')
        self.assertEqual(self.file.stat().st_uid, 65534)
        self.assertTrue(runtime.migration_ready(ID, 65534))
        retained = list(self.control.glob('world-restore-*'))
        self.assertEqual(len(retained), 1)
        self.assertEqual((retained[0] / 'saved.dat').read_text(), 'newer progress')

    def check_native_snapshot(self, game):
        self.journal['gameSlug'] = game
        (self.control / 'migration.json').write_text(json.dumps(self.journal))
        value = self.run_operation('create')
        self.assertEqual(value['gameSlug'],game)
        self.write('newer progress')
        self.run_operation('restore',value['id'])
        self.assertEqual(self.file.read_text(),'original')
        self.assertEqual(self.file.stat().st_uid,65534)
        self.assertTrue(runtime.migration_ready(ID,65534))

    def test_teeworlds_snapshot_restore(self): self.check_native_snapshot('teeworlds')
    def test_bzflag_snapshot_restore(self): self.check_native_snapshot('bzflag')
    def test_hedgewars_snapshot_restore(self): self.check_native_snapshot('hedgewars')
    def test_openarena_snapshot_restore(self): self.check_native_snapshot('openarena')
    def test_wesnoth_snapshot_restore(self): self.check_native_snapshot('battle-for-wesnoth')
    def test_openttd_snapshot_restore(self): self.check_native_snapshot('openttd')
    def test_supertuxkart_snapshot_restore(self): self.check_native_snapshot('supertuxkart')
    def test_0_ad_snapshot_restore(self): self.check_native_snapshot('0-ad')
    def test_ysoccer_snapshot_restore(self): self.check_native_snapshot('ysoccer')
    def test_flightgear_snapshot_restore(self): self.check_native_snapshot('flightgear')
    def test_mindustry_snapshot_restore(self): self.check_native_snapshot('mindustry')
    def test_hurry_curry_snapshot_restore(self): self.check_native_snapshot('hurry-curry')
    def test_assaultcube_snapshot_restore(self): self.check_native_snapshot('assaultcube')
    def test_xonotic_snapshot_restore(self): self.check_native_snapshot('xonotic')
    def test_openmohaa_snapshot_restore_preserves_legacy_short_id(self):
        self.seal.rename(self.legacy/('pb-'+ID[-8:]))
        self.seal=self.legacy/('pb-'+ID[-8:])
        self.check_native_snapshot('medal-of-honor-allied-assault')

    def test_etlegacy_snapshot_restore_preserves_legacy_short_id(self):
        self.seal.rename(self.legacy/ID[-16:])
        self.seal=self.legacy/ID[-16:]
        self.check_native_snapshot('wolfenstein-enemy-territory')

    def test_interrupted_swap_recovers_without_replacing_progress_twice(self):
        value = self.run_operation('create')
        self.write('newer progress')
        with patch.object(migration, 'journal_write', side_effect=OSError('interrupted')):
            with self.assertRaises(OSError):
                self.run_operation('restore', value['id'])
        self.assertEqual(self.file.read_text(), 'original')
        with self.assertRaises(ValueError):
            runtime.migration_ready(ID, 65534)
        self.run_operation('recover')
        self.assertTrue(runtime.migration_ready(ID, 65534))
        self.write('after recovery')
        self.run_operation('recover')
        self.assertEqual(self.file.read_text(), 'after recovery')

    def test_retention_and_disk_reserve_are_enforced(self):
        for index in range(4):
            self.write(str(index))
            self.run_operation('create', '2')
        self.assertEqual(len(self.run_operation('list')), 2)
        with patch.object(backup.os, 'statvfs', return_value=SimpleNamespace(f_bavail=1,f_frsize=4096,f_blocks=1024**3)):
            with self.assertRaises(ValueError):self.run_operation('create')
        self.assertEqual(len(self.run_operation('list')), 2)

    @unittest.skipUnless(Path('/usr/bin/node').exists(), 'Node worker runtime')
    def test_file_worker_runs_without_root_uid_gid_or_supplementary_groups(self):
        folder=Path(self.temp.name)/'worker';folder.mkdir(mode=0o755)
        (folder/'worker.mjs').write_text('import fs from "node:fs"; const request=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify({ok:true,result:{uid:process.getuid(),gid:process.getgid(),groups:process.getgroups().filter(gid=>gid!==process.getgid()),action:request.action}}));')
        for name in ['dedicatedFiles.js','dedicatedDataBackups.js','package.json']:(folder/name).write_text('{}')
        with patch.object(backup,'FILE_WORKER_ROOT',folder):
            result=backup.operation('files',ID,None,runtime,self.identities,migration,{'action':'list'})
        self.assertEqual(result['gameSlug'],'luanti')
        self.assertEqual(result['result'],{'uid':65534,'gid':65534,'groups':[],'action':'list'})

    def test_running_uid_blocks_writes_before_copying_data(self):
        with patch.object(migration, 'quiescent', side_effect=ValueError('occupied')):
            with self.assertRaises(ValueError):
                self.run_operation('create')
        self.assertFalse((self.control / 'world-backups').exists())
        self.assertEqual(self.file.read_text(), 'original')

    def test_symlinks_and_hardlinks_never_enter_snapshots(self):
        other = self.data / 'linked.dat'
        other.symlink_to('/etc/passwd')
        with self.assertRaises((ValueError, OSError)):
            self.run_operation('create')
        other.unlink()
        os.link(self.file, other)
        with self.assertRaises(ValueError):
            self.run_operation('create')

    def test_cross_server_snapshot_metadata_is_rejected_before_restore(self):
        value = self.run_operation('create')
        file = self.control / 'world-backups' / value['id'] / 'metadata.json'
        metadata = json.loads(file.read_text())
        metadata['serverId'] = '0' * 24
        file.write_text(json.dumps(metadata))
        with self.assertRaises(ValueError):
            self.run_operation('restore', value['id'])
        self.assertEqual(self.file.read_text(), 'original')

    def test_cli_never_accepts_paths_commands_or_another_backup_namespace(self):
        self.assertEqual(backup.arguments(['list', ID]), ('list', ID, None))
        for args in [[], ['exec', ID], ['list', '../other'], ['restore', ID, '../other'], ['create', ID, 'extra']]:
            with self.assertRaises(ValueError):
                backup.arguments(args)


if __name__ == '__main__':
    unittest.main()
