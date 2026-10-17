import fcntl
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('display_entry', Path(__file__).with_name('customer-display-entry.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateDisplayEntry(unittest.TestCase):
    def test_root_saved_identity_groups_and_wrong_labels_are_rejected(self):
        for uid, saved, groups, label in [
            (0, (0, 0, 0), [], 'unconfined'),
            (40254, (40254, 40254, 0), [], 'playbound-customer-ipc-40254 (enforce)'),
            (40254, (40254,)*3, [0], 'playbound-customer-ipc-40254 (enforce)'),
            (40254, (40254,)*3, [], 'playbound-customer-ipc-40255 (enforce)'),
            (40254, (40254,)*3, [], 'playbound-customer-ipc-40254 (complain)'),
        ]:
            with self.subTest(uid=uid, saved=saved, groups=groups, label=label):
                with patch.object(module.os, 'getuid', return_value=uid), \
                     patch.object(module.os, 'getresuid', return_value=saved), \
                     patch.object(module.os, 'getresgid', return_value=(uid, uid, uid)), \
                     patch.object(module.os, 'getgroups', return_value=groups), \
                     patch.object(module.Path, 'read_text', return_value=label), \
                     self.assertRaises(ValueError):
                    module.verify_identity()

    def test_dropped_identity_succeeds_but_saved_group_does_not(self):
        with patch.object(module.os, 'getuid', return_value=40254), \
             patch.object(module.os, 'getresuid', return_value=(40254,)*3), \
             patch.object(module.os, 'getresgid', return_value=(40254,)*3), \
             patch.object(module.os, 'getgroups', return_value=[]), \
             patch.object(module.Path, 'read_text', return_value='playbound-customer-ipc-40254 (enforce)'):
            module.verify_identity()
            with patch.object(module.os, 'getresgid', return_value=(40254, 40254, 0)), self.assertRaises(ValueError):
                module.verify_identity()

    def test_changed_or_short_source_is_rejected_before_execution(self):
        before = Mock(st_size=20, st_dev=1, st_ino=1, st_mtime_ns=1, st_ctime_ns=1)
        after = Mock(st_size=20, st_dev=1, st_ino=1, st_mtime_ns=2, st_ctime_ns=1)
        for payload, final in [(b'short', before), (b'x'*20, after)]:
            with patch.object(module, 'verify_source', side_effect=[before, final]), \
                 patch.object(module.os, 'pread', return_value=payload), \
                 patch('builtins.compile') as compile_source:
                with self.assertRaises(ValueError):
                    module.load_syscalls(1000)
                compile_source.assert_not_called()

    def test_stable_source_is_loaded_from_bounded_snapshot(self):
        payload = b'answer = 42\n'
        info = Mock(st_size=len(payload), st_dev=1, st_ino=1, st_mtime_ns=1, st_ctime_ns=1)
        with patch.object(module, 'verify_source', return_value=info), \
             patch.object(module.os, 'pread', return_value=payload) as read:
            source = module.load_syscalls(1000)
        self.assertEqual(source.answer, 42)
        read.assert_called_once_with(1000, len(payload)+1, 0)

    def test_guard_failure_never_loads_source_or_executes(self):
        with patch.object(module, 'verify_identity', side_effect=ValueError('guard')), \
             patch.object(module, 'load_syscalls') as load, patch.object(module.os, 'execv') as execute:
            with self.assertRaises(ValueError):
                module.enter(3, ['--', '/fixed-bootstrap'])
            load.assert_not_called()
            execute.assert_not_called()

    def test_readonly_root_source_and_descriptor_types(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root)/'source.py'
            file.write_text('# trusted helper\n')
            file.chmod(0o600)
            fd = os.open(file, os.O_RDONLY)
            try:
                if os.getuid() == 0:
                    module.verify_source(fd)
                else:
                    with self.assertRaises(ValueError):
                        module.verify_source(fd)
            finally:
                os.close(fd)
            for flags in (os.O_WRONLY, os.O_RDWR):
                fd = os.open(file, flags)
                try:
                    with self.assertRaises(ValueError):
                        module.verify_source(fd)
                finally:
                    os.close(fd)
            for descriptor in (True, None, '3', 0, 2, 1048577):
                with self.subTest(descriptor=descriptor), self.assertRaises(ValueError):
                    module.verify_source(descriptor)

    def test_caller_cannot_supply_a_second_filter_or_malformed_command(self):
        for args in ([], None, ['--'], ['--seccomp', '4', '--', '/game'],
                     ['--seccomp=4', '--', '/game'], ['--', '/game\x00bad'], [1]):
            # A bare separator has no executable; validate it independently too.
            with self.subTest(args=args), patch.object(module, 'verify_identity'), \
                 patch.object(module, 'load_syscalls') as load:
                with self.assertRaises(ValueError):
                    module.enter(3, args)
                load.assert_not_called()

    @unittest.skipUnless(os.geteuid() == 0, 'Root-owned helper contract')
    def test_root_ownership_alone_does_not_make_source_trusted(self):
        with tempfile.TemporaryDirectory() as root:
            source = Path(root)/'source.py'
            source.write_bytes(b'# reviewed source\n')
            for mode in (0o620, 0o602, 0o666):
                source.chmod(mode)
                fd = os.open(source, os.O_RDONLY)
                try:
                    with self.subTest(mode=mode), self.assertRaises(ValueError):
                        module.verify_source(fd)
                finally:
                    os.close(fd)
            source.chmod(0o600)
            os.link(source, Path(root)/'alias.py')
            fd = os.open(source, os.O_RDONLY)
            try:
                with self.assertRaises(ValueError):
                    module.verify_source(fd)
            finally:
                os.close(fd)
            (Path(root)/'alias.py').unlink()
            for contents in (b'', b'x'*262145):
                source.write_bytes(contents)
                fd = os.open(source, os.O_RDONLY)
                try:
                    with self.assertRaises(ValueError):
                        module.verify_source(fd)
                finally:
                    os.close(fd)

    def test_only_sealed_filter_is_execed_and_closed_on_exec_failure(self):
        fd = os.memfd_create('display-entry-test', os.MFD_ALLOW_SEALING)
        os.write(fd, b'12345678')
        seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
        source = Mock()
        source.sealed_filter.return_value = fd
        args = ['--unshare-user', '--', '/fixed-bootstrap']
        with patch.object(module, 'verify_identity'), patch.object(module, 'load_syscalls', return_value=source), \
             patch.object(module.os, 'set_inheritable') as inherited, \
             patch.object(module.os, 'execv', side_effect=OSError('exec failed')) as execute:
            with self.assertRaises(OSError):
                module.enter(1000, args)
        source.sealed_filter.assert_called_once_with(private_display=True)
        execute.assert_called_once_with('/usr/bin/bwrap', ['/usr/bin/bwrap', '--seccomp', str(fd), *args])
        self.assertEqual([c.args for c in inherited.call_args_list], [(fd, True), (1000, False)])
        with self.assertRaises(OSError):
            os.fstat(fd)

    def test_unsealed_filter_cannot_launch(self):
        fd = os.memfd_create('display-entry-unsealed', os.MFD_ALLOW_SEALING)
        source = Mock()
        source.sealed_filter.return_value = fd
        with patch.object(module, 'verify_identity'), patch.object(module, 'load_syscalls', return_value=source), \
             patch.object(module.os, 'execv') as execute:
            with self.assertRaises(ValueError):
                module.enter(1000, ['--', '/fixed-bootstrap'])
            execute.assert_not_called()
        with self.assertRaises(OSError):
            os.fstat(fd)


if __name__ == '__main__':
    unittest.main()
