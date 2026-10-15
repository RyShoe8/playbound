import copy
from contextlib import contextmanager
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

if os.name == 'nt':
    raise unittest.SkipTest('Unix identity helper is Linux-only')

spec = importlib.util.spec_from_file_location('customer_identities', Path(__file__).with_name('customer-identities.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = '0123456789abcdef01234567'
OTHER = '1123456789abcdef01234567'


def reserve_fixture(root, index):
    with patch.object(module, 'ROOT_UID', os.getuid()), patch.object(module, 'secure_directory', lambda folder: None):
        store = module.IdentityStore(Path(root))
        with store.locked():
            value = store.read()
            time.sleep(0.01)  # Exercise real cross-process exclusion.
            value['identities'][f'{index:024x}'] = {'uid': module.UID_FIRST + len(value['identities']), 'gid': module.UID_FIRST + len(value['identities']), 'state': 'reserved', 'createdAt': '2026-10-15T00:00:00+00:00'}
            store.write(value)


class MemoryStore:
    def __init__(self):
        self.value = {'version': 1, 'identities': {}}
        self.writes = []

    @contextmanager
    def locked(self):
        yield self

    def read(self):
        return copy.deepcopy(self.value)

    def write(self, value):
        module.validate_state(value)
        self.value = copy.deepcopy(value)
        self.writes.append(copy.deepcopy(value))


class Identities(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()
        self.users, self.groups, self.commands = {}, {}, []
        def get(mapping, key, field):
            for value in mapping.values():
                if getattr(value, field) == key:
                    return value
            raise KeyError(key)
        self.patches = [
            patch.object(module.pwd, 'getpwnam', lambda key: get(self.users, key, 'pw_name')),
            patch.object(module.pwd, 'getpwuid', lambda key: get(self.users, key, 'pw_uid')),
            patch.object(module.grp, 'getgrnam', lambda key: get(self.groups, key, 'gr_name')),
            patch.object(module.grp, 'getgrgid', lambda key: get(self.groups, key, 'gr_gid')),
            patch.object(module.grp, 'getgrall', lambda: list(self.groups.values())),
            patch.object(module, 'run_account_tool', self.tool),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def tool(self, tool, args):
        self.commands.append((tool, args))
        name = args[-1]
        uid = int(args[args.index('--gid') + 1])
        # The mapping must be durable before either host account operation.
        self.assertTrue(any(row['uid'] == uid and row['state'] == 'reserved' for row in self.store.value['identities'].values()))
        if tool == 'groupadd':
            self.groups[name] = SimpleNamespace(gr_name=name, gr_gid=uid, gr_mem=[])
        else:
            self.assertEqual(tool, 'useradd')
            self.assertIn('--no-create-home', args)
            self.assertIn('--no-log-init', args)
            self.assertEqual(args[args.index('--password') + 1], '!')
            self.assertIn('SUB_UID_COUNT=0', args)
            self.assertIn('SUB_GID_COUNT=0', args)
            self.users[name] = SimpleNamespace(pw_name=name, pw_uid=uid, pw_gid=uid, pw_dir='/nonexistent', pw_shell='/usr/sbin/nologin')

    def ensure(self, server_id=ID):
        return module.ensure_identity(server_id, self.store)

    def test_only_fixed_ensure_operation_and_server_ids(self):
        self.assertEqual(module.request(['ensure', ID.upper()]), ID)
        for args in ([], ['exec', ID], ['delete', ID], ['ensure', '../other'], ['ensure', ID, '/tmp'], ['ensure', ID + ';id']):
            with self.assertRaises(ValueError):
                module.request(args)
        self.assertEqual(self.commands, [])

    def test_stable_distinct_private_accounts_and_bounded_numeric_ids(self):
        first = self.ensure()
        self.assertEqual(first, self.ensure())
        self.assertEqual(len(self.commands), 2)
        second = self.ensure(OTHER)
        self.assertNotEqual(first['uid'], second['uid'])
        self.assertEqual(first['uid'], first['gid'])
        self.assertEqual(first['profile'], 'customer-unix-v1')
        self.assertTrue(first['identityReady'])
        self.assertNotIn('runtimeReady', first)

    def test_occupied_host_ids_are_skipped_without_adopting_them(self):
        self.users['host'] = SimpleNamespace(pw_name='host', pw_uid=module.UID_FIRST)
        self.groups['host-group'] = SimpleNamespace(gr_name='host-group', gr_gid=module.UID_FIRST + 1, gr_mem=[])
        self.assertEqual(self.ensure()['uid'], module.UID_FIRST + 2)

    def test_unregistered_account_name_is_not_adopted(self):
        name = module.account_name(ID)
        self.users[name] = SimpleNamespace(pw_name=name, pw_uid=123)
        with self.assertRaises(ValueError): self.ensure()
        self.assertEqual(self.commands, [])
        self.assertEqual(self.store.writes, [])

    def test_failed_creation_reserves_uid_and_retries_after_partial_group_creation(self):
        original = self.tool
        def fail_user(tool, args):
            if tool == 'useradd': raise RuntimeError('simulated interruption')
            original(tool, args)
        with patch.object(module, 'run_account_tool', fail_user):
            with self.assertRaises(RuntimeError): self.ensure()
        reserved = self.store.value['identities'][ID]['uid']
        self.assertEqual(self.store.value['identities'][ID]['state'], 'reserved')
        self.assertNotEqual(self.ensure(OTHER)['uid'], reserved)
        self.assertEqual(self.ensure()['uid'], reserved)
        self.assertEqual(sum(tool == 'groupadd' and args[-1] == module.account_name(ID) for tool, args in self.commands), 1)

    def test_ready_account_removal_or_extra_groups_fail_closed(self):
        self.ensure()
        name = module.account_name(ID)
        self.groups['extra'] = SimpleNamespace(gr_name='extra', gr_gid=99, gr_mem=[name])
        with self.assertRaises(ValueError): self.ensure()
        del self.groups['extra']
        self.users.pop(name)
        count = len(self.commands)
        with self.assertRaises(ValueError): self.ensure()
        self.assertEqual(len(self.commands), count)

    def test_ready_identity_uid_shell_home_and_group_drift_are_not_repaired(self):
        self.ensure()
        user = self.users[module.account_name(ID)]
        for field, value in [('pw_uid', 0), ('pw_gid', 0), ('pw_shell', '/bin/sh'), ('pw_dir', '/var/lib/playbound-host')]:
            old = getattr(user, field)
            setattr(user, field, value)
            with self.assertRaises(ValueError): self.ensure()
            setattr(user, field, old)
        self.groups[module.account_name(ID)].gr_mem = ['playbound']
        with self.assertRaises(ValueError): self.ensure()
        self.assertEqual(len(self.commands), 2)

    def test_pool_exhaustion_does_not_reuse_an_orphaned_reservation(self):
        with patch.object(module, 'UID_LAST', module.UID_FIRST):
            self.ensure()
            with self.assertRaises(ValueError): self.ensure(OTHER)
        self.assertEqual(len(self.commands), 2)

    def test_duplicate_or_unbounded_state_is_not_empty_state(self):
        self.ensure()
        for change in ('uid', 'gid', 'state'):
            value = copy.deepcopy(self.store.value)
            value['identities'][ID][change] = {'uid': 0, 'gid': True, 'state': 'deleted'}[change]
            with self.assertRaises(ValueError): module.validate_state(value)
        value = copy.deepcopy(self.store.value)
        value['identities'][OTHER] = copy.deepcopy(value['identities'][ID])
        with self.assertRaises(ValueError): module.validate_state(value)
        with self.assertRaises(ValueError): json.loads('{"version":1,"version":1}', object_pairs_hook=module.unique_object)


class DiskState(unittest.TestCase):
    def test_linked_or_writable_ancestors_and_linked_state_roots_are_refused(self):
        root = module.STATE
        for unsafe, mode, uid in [(root.parent, 0o40777, 0), (root.parent, 0o40755, 1001), (root.parent, 0o120755, 0), (root, 0o120700, 0)]:
            def info(file):
                return SimpleNamespace(st_mode=mode if file == unsafe else 0o40755, st_uid=uid if file == unsafe else 0, st_nlink=1)
            with patch.object(Path, 'lstat', info), patch.object(Path, 'mkdir') as mkdir:
                with self.assertRaises(ValueError): module.secure_directory(root)
                if unsafe != root: mkdir.assert_not_called()

    def test_linked_or_nonprivate_lock_files_are_refused(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'ROOT_UID', os.getuid()), patch.object(module, 'secure_directory', lambda folder: None):
            root = Path(directory)
            target = root / 'target'
            target.write_text('fixture')
            target.chmod(0o600)
            lock = root / 'registry.lock'
            store = module.IdentityStore(root)
            lock.symlink_to(target)
            with self.assertRaises(OSError):
                with store.locked(): self.fail('Linked lock was accepted')
            lock.unlink()
            os.link(target, lock)
            with self.assertRaises(ValueError):
                with store.locked(): self.fail('Hardlinked lock was accepted')
            lock.unlink()
            lock.write_text('fixture')
            lock.chmod(0o644)
            with self.assertRaises(ValueError):
                with store.locked(): self.fail('Public lock was accepted')

    def test_concurrent_workers_reserve_distinct_slots_without_lost_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'state'
            root.mkdir(mode=0o700)
            context = multiprocessing.get_context('fork')
            workers = [context.Process(target=reserve_fixture, args=(str(root), index)) for index in range(8)]
            try:
                for worker in workers: worker.start()
                for worker in workers:
                    worker.join(timeout=5)
                    self.assertEqual(worker.exitcode, 0)
                with patch.object(module, 'ROOT_UID', os.getuid()):
                    value = module.IdentityStore(root).read()
                self.assertEqual(len(value['identities']), 8)
                self.assertEqual(len({row['uid'] for row in value['identities'].values()}), 8)
            finally:
                for worker in workers:
                    if worker.is_alive(): worker.terminate()
                    if worker.pid is not None: worker.join(timeout=2)

    def test_private_atomic_state_and_fail_closed_links_corruption_and_replace_failure(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'ROOT_UID', os.getuid()):
            root = Path(directory) / 'state'
            def private_root(folder):
                folder.mkdir(mode=0o700, exist_ok=True)
                module.secure_stat(folder.lstat(), directory=True)
            with patch.object(module, 'secure_directory', private_root):
                store = module.IdentityStore(root)
                with store.locked():
                    empty = store.read()
                    store.write(empty)
                    self.assertEqual(store.read(), empty)
                    with patch.object(module.os, 'replace', side_effect=OSError('disk error')):
                        with self.assertRaises(OSError): store.write(empty)
                    self.assertEqual(store.read(), empty)
                    self.assertEqual(list(root.glob('*.tmp')), [])
                    file = root / 'identities.json'
                    file.write_text('{broken')
                    with self.assertRaises(ValueError): store.read()
                    file.unlink()
                    target = root / 'outside'
                    target.write_text(json.dumps(empty))
                    target.chmod(0o600)
                    os.link(target, file)
                    with self.assertRaises(ValueError): store.read()
                    file.unlink()
                    file.symlink_to(target)
                    with self.assertRaises(OSError): store.read()

    def test_unsafe_root_and_state_modes_are_rejected(self):
        for mode, uid, links in [(0o100644, 0, 1), (0o100600, 1001, 1), (0o100600, 0, 2), (0o120600, 0, 1)]:
            with self.assertRaises(ValueError): module.secure_stat(SimpleNamespace(st_mode=mode, st_uid=uid, st_nlink=links))

    def test_caller_is_root_operator_or_scoped_hosting_sudo(self):
        with patch.object(module.os, 'geteuid', return_value=1001):
            with self.assertRaises(ValueError): module.verify_caller()
        with patch.object(module.os, 'geteuid', return_value=0), patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)):
            with patch.dict(os.environ, {'SUDO_UID': '1001'}): module.verify_caller()
            with patch.dict(os.environ, {'SUDO_UID': '0'}):
                with self.assertRaises(ValueError): module.verify_caller()


if __name__ == '__main__': unittest.main()
