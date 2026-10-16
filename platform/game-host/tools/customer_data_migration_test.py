import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

if os.name == 'nt':
    raise unittest.SkipTest('Migration checkpoint uses Linux directory FDs')
spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('customer-data-migration.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = '0123456789abcdef01234567'


class DataCheckpoint(unittest.TestCase):
    def test_native_migration_selects_only_fixed_data_roots(self):
        for game, folder in [('bzflag','bzflag-servers'),('hedgewars','hedgewars-servers'),('openttd','openttd-servers'),('luanti','luanti-servers')]:
            module.select_game(game)
            self.assertEqual(module.SOURCE,Path('/var/lib/playbound-host')/folder)
            self.assertEqual(module.PROFILE,game+'-unix-v1')
        for game in ['../other','custom','minecraft']:
            with self.assertRaises(ValueError):module.select_game(game)

    def setUp(self):
        module.select_game('teeworlds')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.source = self.base / 'source'
        self.source.mkdir(mode=0o700)
        self.uid = os.getuid()

    def scan(self, destination=None):
        fd = module.open_directory(self.source)
        try:
            return module.walk(fd, self.uid, destination)
        finally:
            os.close(fd)

    def test_only_fixed_actions_and_server_ids(self):
        self.assertEqual(module.arguments(['prepare', ID]), ['prepare', ID])
        for action in ['activate', 'rollback', 'recover', 'enroll', 'complete-rollback', 'enable-network', 'disable-network']:
            self.assertEqual(module.arguments([action, ID]), [action, ID])
        for args in [[], ['delete', ID], ['prepare', '../etc'], ['verify', ID.upper()], ['verify', ID, '/other']]:
            with self.assertRaises(ValueError):
                module.arguments(args)

    def test_maps_empty_directories_and_binary_data_preserved(self):
        (self.source / 'maps').mkdir(mode=0o700)
        (self.source / 'empty').mkdir(mode=0o700)
        payload = bytes(range(256)) * 100
        (self.source / 'maps' / 'custom.map').write_bytes(payload)
        destination = self.base / 'copy'
        destination.mkdir(mode=0o700)
        manifest = self.scan(destination)
        self.assertEqual((destination / 'maps' / 'custom.map').read_bytes(), payload)
        self.assertTrue((destination / 'empty').is_dir())
        self.assertEqual(manifest, self.scan())
        self.assertEqual((self.source / 'maps' / 'custom.map').read_bytes(), payload)
        self.assertEqual((destination / 'maps' / 'custom.map').stat().st_mode & 0o777, 0o600)

    def test_symlinks_hardlinks_fifos_and_writable_files_rejected(self):
        outside = self.base / 'outside'
        outside.write_text('must not copy')
        candidate = self.source / 'unsafe'
        for create in [lambda: candidate.symlink_to(outside), lambda: os.link(outside, candidate), lambda: os.mkfifo(candidate)]:
            create()
            with self.assertRaises(ValueError):
                self.scan()
            candidate.unlink()
        candidate.write_text('writable')
        candidate.chmod(0o666)
        with self.assertRaises(ValueError):
            self.scan()
        self.assertEqual(outside.read_text(), 'must not copy')

    def test_intermediate_directory_symlinks_rejected(self):
        (self.base / 'link').symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(OSError):
            module.open_directory(self.base / 'link')

    def test_count_size_and_depth_bounds(self):
        (self.source / 'one').write_bytes(b'12345')
        for limit, value in [('MAX_ENTRIES', 0), ('MAX_FILE_BYTES', 4), ('MAX_BYTES', 4)]:
            with patch.object(module, limit, value), self.assertRaises(ValueError):
                self.scan()
        (self.source / 'nested').mkdir(mode=0o700)
        with patch.object(module, 'MAX_DEPTH', 0), self.assertRaises(ValueError):
            self.scan()

    def test_changed_file_during_read_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_read = os.read
        inode = file.stat().st_ino
        changed = False

        def mutate(fd, count):
            nonlocal changed
            data = original_read(fd, count)
            if not changed and os.fstat(fd).st_ino == inode:
                changed = True
                file.write_bytes(b'new data with a different length')
            return data

        with patch.object(module.os, 'read', side_effect=mutate), self.assertRaises(ValueError):
            self.scan()

    def test_replaced_file_before_open_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_open = os.open

        def swap(path, *args, **kwargs):
            if path == 'data':
                file.unlink()
                file.symlink_to(self.base / 'outside')
            return original_open(path, *args, **kwargs)

        with patch.object(module.os, 'open', side_effect=swap), self.assertRaises(OSError):
            self.scan()

    def test_file_changed_to_hardlink_after_stat_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_open = os.open

        def link(path, *args, **kwargs):
            if path == 'data':
                os.link(file, self.base / 'new-link')
            return original_open(path, *args, **kwargs)

        with patch.object(module.os, 'open', side_effect=link), self.assertRaises(ValueError):
            self.scan()

    def test_added_directory_entry_during_copy_rejected(self):
        file = self.source / 'data'
        file.write_bytes(b'original')
        original_read = os.read
        inode = file.stat().st_ino

        def add(fd, count):
            chunk = original_read(fd, count)
            if os.fstat(fd).st_ino == inode:
                (self.source / 'late').write_text('new save')
            return chunk

        with patch.object(module.os, 'read', side_effect=add), self.assertRaises(ValueError):
            self.scan()

    @unittest.skipUnless(os.getuid() == 0, 'Root-owned checkpoint integration fixture')
    def test_prepare_idempotency_drift_and_no_activation(self):
        source_root = self.base / 'legacy'
        source_root.mkdir(mode=0o700)
        self.source.rename(source_root / ('pb-' + ID))
        self.source = source_root / ('pb-' + ID)
        (self.source / 'saved.map').write_bytes(b'original saved game')
        root = self.base / 'runtime'

        def directory(path, uid=0, mode=0o711):
            path.mkdir(mode=mode, exist_ok=True)

        runtime = SimpleNamespace(directory=directory, select_game=Mock())
        trusted = SimpleNamespace(st_mode=0o100755, st_uid=0, st_nlink=1)
        actual_lstat = Path.lstat

        def lstat(path, *args, **kwargs):
            if str(path) == '/usr/local/libexec/playbound-customer-runtime':
                return trusted
            return actual_lstat(path, *args, **kwargs)

        with patch.object(module, 'SOURCE', source_root), patch.object(module, 'ROOT', root), patch.object(module, 'quiescent'), patch.object(Path, 'lstat', lstat), patch.object(module.importlib.util, 'module_from_spec', return_value=runtime), patch.object(module.importlib.machinery.SourceFileLoader, 'exec_module'):
            first = module.prepare(ID, self.uid)
            self.assertEqual(module.prepare(ID, self.uid), first)
            self.assertFalse((root / ID / 'data').exists())
            self.assertEqual((self.source / 'saved.map').read_bytes(), b'original saved game')
            snapshot = root / ID / 'control' / 'legacy-checkpoint-v1'
            self.assertEqual((snapshot / 'data' / 'saved.map').read_bytes(), b'original saved game')
            (self.source / 'saved.map').write_bytes(b'new progress')
            with self.assertRaisesRegex(ValueError, 'Source changed'):
                module.prepare(ID, self.uid)
            self.assertEqual((self.source / 'saved.map').read_bytes(), b'new progress')
            (snapshot / 'data' / 'saved.map').write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'verification failed'):
                module.verify(ID)

    def test_quiescence_failure_precedes_checkpoint_writes(self):
        source_root = self.base / 'legacy'
        source_root.mkdir(mode=0o700)
        self.source.rename(source_root / ('pb-' + ID))
        root = self.base / 'runtime'
        with patch.object(module, 'SOURCE', source_root), patch.object(module, 'ROOT', root), patch.object(module, 'quiescent', side_effect=ValueError('active process')):
            with self.assertRaisesRegex(ValueError, 'active process'):
                module.prepare(ID, self.uid)
        self.assertFalse(root.exists())


@unittest.skipUnless(os.getuid() == 0, 'Root-owned transaction integration fixtures')
class MigrationTransactions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.source_root = base / 'legacy'
        self.source_root.mkdir(mode=0o700)
        self.source = self.source_root / ('pb-' + ID)
        self.source.mkdir(mode=0o700)
        (self.source / 'maps').mkdir(mode=0o700)
        (self.source / 'maps' / 'saved.map').write_bytes(b'original save')
        self.root = base / 'runtime'
        self.root.mkdir(mode=0o711)
        self.server = self.root / ID
        self.server.mkdir(mode=0o711)
        self.control = self.server / 'control'
        self.control.mkdir(mode=0o700)
        self.uid = 40000
        self.addCleanup(patch.stopall)
        patch.object(module, 'ROOT', self.root).start()
        patch.object(module, 'SOURCE', self.source_root).start()
        patch.object(module, 'quiescent').start()
        checkpoint = self.control / 'legacy-checkpoint-v1'
        checkpoint.mkdir(mode=0o700)
        (checkpoint / 'data').mkdir(mode=0o700)
        entries = module.tree(self.source, 0, checkpoint / 'data')
        manifest = checkpoint / 'manifest.json'
        manifest.write_text(json.dumps({'version': 1, 'serverId': ID, 'profile': 'teeworlds-unix-v1', 'entries': entries}))
        manifest.chmod(0o600)

        def directory(path, mode=0o711):
            self.assertEqual(path.stat().st_uid, 0)
            self.assertEqual(path.stat().st_mode & 0o777, mode)

        self.runtime = SimpleNamespace(directory=directory, select_game=Mock(), trusted_module=Mock(return_value=SimpleNamespace(remove_if_present=Mock())))
        self.identities = SimpleNamespace(ensure_identity=lambda server_id: {'uid': self.uid}, secure_stat=lambda info: self.assertEqual(info.st_uid, 0))

    def execute(self, action):
        return module.transaction(action, ID, 0, self.runtime, self.identities)

    def test_activation_and_rollback_keep_post_activation_progress(self):
        value = self.execute('activate')
        self.assertEqual(value['phase'], 'active')
        data = self.server / 'data'
        self.assertEqual(data.stat().st_uid, self.uid)
        self.assertEqual((data / 'maps' / 'saved.map').stat().st_uid, self.uid)
        self.assertEqual((self.control / 'legacy-source-retained-v1' / 'maps' / 'saved.map').read_bytes(), b'original save')
        self.assertEqual(list(self.source.iterdir()), [])
        (data / 'maps' / 'saved.map').write_bytes(b'new progress after migration')
        self.assertEqual(self.execute('activate')['phase'], 'active')
        self.assertEqual(self.execute('rollback')['phase'], 'rolled-back')
        self.assertEqual((self.source / 'maps' / 'saved.map').read_bytes(), b'new progress after migration')
        self.assertEqual((data / 'maps' / 'saved.map').read_bytes(), b'new progress after migration')
        self.assertEqual((self.control / 'legacy-source-retained-v1' / 'maps' / 'saved.map').read_bytes(), b'original save')
        self.assertEqual(self.execute('rollback')['phase'], 'rolled-back')
        with self.assertRaisesRegex(ValueError, 'implicitly reactivated'):
            self.execute('activate')

    def test_empty_uid_home_is_retained_during_atomic_exchange(self):
        data = self.server / 'data'
        data.mkdir(mode=0o700)
        (data / 'server.cfg').touch(mode=0o600)
        os.chown(data / 'server.cfg', self.uid, self.uid)
        os.chown(data, self.uid, self.uid)
        previous = module.inode(data)
        self.execute('activate')
        self.assertEqual(module.inode(self.control / 'activation-copy-v1' / 'data'), previous)
        self.assertEqual((data / 'maps' / 'saved.map').read_bytes(), b'original save')

    def test_nonempty_uid_home_is_never_overwritten(self):
        data = self.server / 'data'
        data.mkdir(mode=0o700)
        (data / 'already-saved').write_bytes(b'existing progress')
        os.chown(data / 'already-saved', self.uid, self.uid)
        os.chown(data, self.uid, self.uid)
        with self.assertRaisesRegex(ValueError, 'must not be replaced'):
            self.execute('activate')
        self.assertEqual((data / 'already-saved').read_bytes(), b'existing progress')

    def test_changed_legacy_progress_blocks_activation_and_rollback(self):
        (self.source / 'maps' / 'saved.map').write_bytes(b'changed original')
        with self.assertRaisesRegex(ValueError, 'Legacy source changed'):
            self.execute('activate')
        (self.source / 'maps' / 'saved.map').write_bytes(b'original save')
        self.execute('activate')
        (self.source / 'maps').mkdir(mode=0o700)
        (self.source / 'maps' / 'saved.map').write_bytes(b'independent legacy progress')
        with self.assertRaisesRegex(ValueError, 'Legacy source changed'):
            self.execute('rollback')
        self.assertEqual((self.source / 'maps' / 'saved.map').read_bytes(), b'independent legacy progress')

    def test_recovery_before_and_after_activation_rename(self):
        original = module.finish_transaction
        with patch.object(module, 'finish_transaction', side_effect=RuntimeError('power loss')):
            with self.assertRaises(RuntimeError):
                self.execute('activate')
        self.assertFalse((self.server / 'data').exists())
        with patch.object(module, 'journal_write', side_effect=RuntimeError('power loss after rename')):
            with self.assertRaises(RuntimeError):
                self.execute('recover')
        self.assertTrue((self.server / 'data' / 'maps' / 'saved.map').exists())
        self.assertEqual(self.execute('recover')['phase'], 'active')
        self.assertEqual(module.inode(self.server / 'data'), module.journal_read(self.control, ID)['activationInode'])

    def test_recovery_before_and_after_rollback_exchange(self):
        self.execute('activate')
        (self.server / 'data' / 'maps' / 'saved.map').write_bytes(b'new progress')
        with patch.object(module, 'finish_transaction', side_effect=RuntimeError('power loss')):
            with self.assertRaises(RuntimeError):
                self.execute('rollback')
        self.assertEqual(list(self.source.iterdir()), [])
        with patch.object(module, 'journal_write', side_effect=RuntimeError('power loss after exchange')):
            with self.assertRaises(RuntimeError):
                self.execute('recover')
        self.assertEqual((self.source / 'maps' / 'saved.map').read_bytes(), b'new progress')
        self.assertEqual(self.execute('recover')['phase'], 'rolled-back')

    def test_runtime_lock_blocks_concurrent_migration(self):
        import fcntl
        fd = os.open(self.control / 'runtime.lock', os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.execute('activate')
        finally:
            os.close(fd)
        self.assertFalse((self.server / 'data').exists())

    def test_ambiguous_recovery_never_overwrites_unrelated_directory(self):
        with patch.object(module, 'finish_transaction', side_effect=RuntimeError('power loss')):
            with self.assertRaises(RuntimeError):
                self.execute('activate')
        (self.server / 'data').mkdir(mode=0o700)
        (self.server / 'data' / 'unrelated').write_bytes(b'keep me')
        with self.assertRaisesRegex(ValueError, 'Ambiguous migration'):
            self.execute('recover')
        self.assertEqual((self.server / 'data' / 'unrelated').read_bytes(), b'keep me')

    def test_legacy_progress_after_interruption_blocks_recovery(self):
        with patch.object(module, 'finish_transaction', side_effect=RuntimeError('power loss')):
            with self.assertRaises(RuntimeError):
                self.execute('activate')
        (self.source / 'maps' / 'saved.map').write_bytes(b'played again after interruption')
        with self.assertRaisesRegex(ValueError, 'Legacy progress changed'):
            self.execute('recover')
        self.assertFalse((self.server / 'data').exists())

    def test_completed_directory_replacement_is_not_treated_as_migrated(self):
        self.execute('activate')
        (self.server / 'data').rename(self.server / 'retained-progress')
        (self.server / 'data').mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError, 'identity changed'):
            self.execute('activate')
        self.assertTrue((self.server / 'retained-progress' / 'maps' / 'saved.map').exists())


@unittest.skipUnless(os.getuid() == 0, 'Root-owned enrollment transition fixtures')
class ProfileTransitions(unittest.TestCase):
    def setUp(self):
        MigrationTransactions.setUp(self)
        self.state = self.root.parent / 'state'
        self.state.mkdir(mode=0o700)
        patch.object(module, 'STATE', self.state).start()
        self.runtime.migration_ready = lambda *args, **kwargs: True
        self.other = {'communityServerId': 'fedcba987654321001234567', 'status': 'running', 'gameSlug': 'other', 'at': 12345, 'custom': {'preserve': True}}
        self.write_registry('managed-rooms.json', [self.other])
        self.write_registry('managed-jobs.json', [self.other, {'communityServerId': ID, 'gameSlug': 'teeworlds', 'status': 'stopped', 'at': 54321}])
        self.execute('activate')

    def execute(self, action):
        return MigrationTransactions.execute(self, action)

    def write_registry(self, name, value):
        file = self.state / name
        file.write_text(json.dumps(value))
        file.chmod(0o600)

    def transition(self, action):
        return module.transition_profile(action, ID, 0, self.runtime, self.identities)

    def test_profile_changes_are_explicit_scoped_and_retry_safe(self):
        self.assertEqual(self.transition('enroll')['profileTransition']['state'], 'complete')
        rows = module.registry_read('managed-jobs.json', 0)
        self.assertEqual(rows[0], self.other)
        self.assertEqual(rows[1]['identityProfile'], 'teeworlds-unix-v1')
        self.assertEqual(rows[1]['at'], 54321)
        self.transition('enroll')
        with self.assertRaisesRegex(ValueError, 'Data rollback must complete'):
            self.transition('complete-rollback')
        self.execute('rollback')
        self.assertEqual(self.transition('complete-rollback')['profileTransition']['target'], 'legacy')
        rows = module.registry_read('managed-jobs.json', 0)
        self.assertEqual(rows[0], self.other)
        self.assertNotIn('identityProfile', rows[1])
        self.transition('complete-rollback')

    def test_live_job_duplicate_identity_or_wrong_game_never_changes_registry(self):
        for entries in [[], [{'communityServerId': ID, 'gameSlug': 'teeworlds', 'status': 'running'}], [{'communityServerId': ID, 'gameSlug': 'other', 'status': 'stopped'}], [{'communityServerId': ID, 'gameSlug': 'teeworlds', 'status': 'stopped', 'identityProfile': 'other'}], [{'communityServerId': ID, 'gameSlug': 'teeworlds', 'status': 'stopped'}] * 2]:
            self.write_registry('managed-jobs.json', entries)
            before = (self.state / 'managed-jobs.json').read_bytes()
            with self.assertRaises(ValueError):
                self.transition('enroll')
            self.assertEqual((self.state / 'managed-jobs.json').read_bytes(), before)

    def test_retained_runtime_row_blocks_profile_transition(self):
        self.write_registry('managed-rooms.json', [{'communityServerId': ID}])
        with self.assertRaisesRegex(ValueError, 'Stop the managed runtime'):
            self.transition('enroll')

    def test_linked_registry_is_refused(self):
        os.link(self.state / 'managed-jobs.json', self.state / 'linked-jobs')
        with self.assertRaisesRegex(ValueError, 'Unsafe managed registry'):
            self.transition('enroll')

    def test_profile_transition_recovers_after_registry_swap_before_journal_completion(self):
        original_write = module.journal_write

        def fail_completion(control, value):
            if value.get('profileTransition', {}).get('state') == 'complete':
                raise RuntimeError('power loss')
            original_write(control, value)

        with patch.object(module, 'journal_write', side_effect=fail_completion):
            with self.assertRaises(RuntimeError):
                self.transition('enroll')
        self.assertEqual(module.registry_read('managed-jobs.json', 0)[1]['identityProfile'], 'teeworlds-unix-v1')
        self.assertEqual(module.journal_read(self.control, ID)['profileTransition']['state'], 'pending')
        self.assertEqual(self.transition('enroll')['profileTransition']['state'], 'complete')

    def test_network_policy_requires_explicit_uid_enrollment_and_successful_preflight(self):
        network = SimpleNamespace(probe=Mock(return_value={'preflightPassed': True}))
        self.runtime.trusted_module = Mock(return_value=network)
        with self.assertRaisesRegex(ValueError, 'Complete UID enrollment'):
            self.transition('enable-network')
        self.transition('enroll')
        original_jobs = (self.state / 'managed-jobs.json').read_bytes()
        self.assertEqual(self.transition('enable-network')['networkProfile'], 'public-game-v1')
        self.assertEqual((self.state / 'managed-jobs.json').read_bytes(), original_jobs)
        network.probe.assert_called_once()
        self.assertNotIn('networkProfile', self.transition('disable-network'))
        network.probe.return_value = {'preflightPassed': False}
        with self.assertRaisesRegex(ValueError, 'preflight failed'):
            self.transition('enable-network')
        self.assertNotIn('networkProfile', module.journal_read(self.control, ID))


if __name__ == '__main__':
    unittest.main()
