import importlib.util
import os
from pathlib import Path
import unittest
from types import SimpleNamespace
from unittest.mock import patch

if os.name == 'nt':
    raise unittest.SkipTest('Root-owned scope helper is Linux-only')

spec = importlib.util.spec_from_file_location('customer_resources', Path(__file__).with_name('customer-resources.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ID = '0123456789abcdef01234567'
BOOT = '01234567-0123-0123-0123-0123456789ab'


class ResourceBoundaries(unittest.TestCase):
    def test_fixed_profiles_only_no_commands_paths_or_properties(self):
        for game in module.PROFILES:
            self.assertEqual(module.request(['attach', ID, game, '42', BOOT + ':100']), (ID, game, 42, BOOT + ':100', None))
        for arguments in ([], ['shell', ID, 'teeworlds', '42', BOOT + ':100'], ['attach', '../other', 'teeworlds', '42', BOOT + ':100'], ['attach', ID, 'other', '42', BOOT + ':100'], ['attach', ID, 'teeworlds', '1', BOOT + ':100'], ['attach', ID, 'teeworlds', '42;reboot', BOOT + ':100'], ['attach', ID, 'teeworlds', '42', '../identity']):
            with self.assertRaises(ValueError):
                module.request(arguments)

    def test_explicit_allocations_are_numeric_bounded_and_keep_task_swap_policy(self):
        for cpu, memory in [('250', '256'), ('500', '1024'), ('6000', '8192')]:
            parsed = module.request(['attach', ID, 'teeworlds', '42', BOOT + ':100', cpu, memory])
            self.assertEqual(parsed[-1], (int(cpu), int(memory)))
            _, command = module.scope_command(ID, 'teeworlds', 42, parsed[-1])
            self.assertIn(str(int(cpu) * 1000), command)
            self.assertIn(str(int(memory) * 1024 ** 2), command)
            self.assertEqual(module.allocation('teeworlds', parsed[-1])[2], 128)
        for cpu, memory in [('0', '1024'), ('249', '1024'), ('6001', '1024'), ('500', '255'), ('500', '8193'), ('500.0', '1024'), ('500', 'max'), ('500;reboot', '1024')]:
            with self.assertRaises(ValueError):
                module.request(['attach', ID, 'teeworlds', '42', BOOT + ':100', cpu, memory])

    def test_scope_is_new_fail_mode_with_bounded_fixed_properties(self):
        for game, (cores, memory, tasks) in module.PROFILES.items():
            scope, command = module.scope_command(ID, game, 42)
            self.assertEqual(scope, f'playbound-customer-{ID}-42.scope')
            self.assertIn('fail', command)
            self.assertNotIn('replace', command)
            self.assertNotIn('ExecStart', command)
            self.assertEqual(command[0], '/usr/bin/busctl')
            self.assertIn(str(cores * 1000000), command)
            self.assertIn(str(memory), command)
            self.assertEqual(tasks, 128)
            self.assertIn('MemorySwapMax', command)
            self.assertNotIn('ExecStart', command)

    def test_stale_root_setuid_or_zombie_process_is_refused(self):
        # comm may contain spaces and closing parentheses.
        fields = ['S', '1'] + ['0'] * 17 + ['100']
        sample = '42 (fixture ) gate) ' + ' '.join(fields)
        values = {'/proc/42/stat': sample, '/proc/sys/kernel/random/boot_id': BOOT, '/proc/42/status': 'Uid:\t1001\t1001\t1001\t1001\n'}
        def read(file, *args, **kwargs): return values[str(file)]
        with patch.object(Path, 'read_text', read):
            module.verify_process(42, BOOT + ':100', 1001)
            with self.assertRaises(ValueError): module.verify_process(42, BOOT + ':99', 1001)
            values['/proc/42/status'] = 'Uid:\t0\t0\t0\t0\n'
            with self.assertRaises(ValueError): module.verify_process(42, BOOT + ':100', 1001)
            values['/proc/42/status'] = 'Uid:\t1001\t0\t1001\t1001\n'
            with self.assertRaises(ValueError): module.verify_process(42, BOOT + ':100', 1001)
            values['/proc/42/stat'] = sample.replace(') S ', ') Z ')
            with self.assertRaises(ValueError): module.verify_process(42, BOOT + ':100', 1001)

    def test_sudo_cannot_place_an_unrelated_process_or_another_user(self):
        with patch.dict(os.environ, {'SUDO_UID': '1001'}), patch.object(module.os, 'getppid', return_value=42):
            module.verify_caller(42, 1001)
            with self.assertRaises(ValueError): module.verify_caller(42, 1002)
        with patch.dict(os.environ, {'SUDO_UID': '1001'}), patch.object(module.os, 'getppid', return_value=1):
            with self.assertRaises(ValueError): module.verify_caller(42, 1001)

    def test_attach_waits_for_systemd_placement_and_verifies_kernel_limits(self):
        scope = f'playbound-customer-{ID}-42.scope'
        root = '/sys/fs/cgroup/system.slice/' + scope
        checks = iter(['0::/old.scope', '0::/system.slice/' + scope])
        values = {root + '/cpu.max': '100000 100000', root + '/memory.max': str(1024 ** 3), root + '/memory.swap.max': '0', root + '/pids.max': '128', root + '/memory.oom.group': '1'}
        writes = []
        def read(file, *args, **kwargs):
            return next(checks) if str(file) == '/proc/42/cgroup' else values[str(file)]
        def write(file, value, *args, **kwargs):
            writes.append((str(file), value))
        with patch.object(module.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=1001)), patch.object(module, 'verify_process') as verify, patch.object(module, 'verify_caller'), patch.object(module.subprocess, 'run') as run, patch.object(module.time, 'sleep'), patch.object(Path, 'read_text', read), patch.object(Path, 'write_text', write):
            result = module.attach(ID, 'teeworlds', 42, BOOT + ':100')
            self.assertTrue(result['attached'])
            self.assertEqual(result['scope'], scope)
            self.assertGreaterEqual(verify.call_count, 3)
            self.assertEqual(run.call_args.kwargs['timeout'], 6)
            self.assertEqual(writes, [(root + '/memory.oom.group', '1')])


if __name__ == '__main__': unittest.main()
