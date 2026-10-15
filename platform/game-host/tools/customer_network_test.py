import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

if os.name == 'nt':
    raise unittest.SkipTest('Linux scoped network policy')
spec = importlib.util.spec_from_file_location('network', Path(__file__).with_name('customer-network-check.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SCOPE = '0::/system.slice/playbound-network-check-42.scope'


class NetworkInspection(unittest.TestCase):
    def test_apply_is_fixed_to_current_customer_scope_and_requires_kernel_proof(self):
        scope = 'playbound-customer-0123456789abcdef01234567-42.scope'
        with patch.object(module.os, 'geteuid', return_value=0), patch.object(Path, 'read_text', return_value='0::/system.slice/' + scope), patch.object(module.subprocess, 'run') as run, patch.object(module, 'attached_filters', return_value={'kernelIngressPrograms': 1, 'kernelEgressPrograms': 1}):
            self.assertEqual(module.apply_current_scope()['networkProfile'], 'public-game-v1')
            self.assertEqual(run.call_args.args[0], ['/usr/bin/systemctl', 'set-property', '--runtime', scope, 'IPAddressDeny=' + ' '.join(module.DENY)])
            self.assertEqual(run.call_args.kwargs['env'], {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
        with patch.object(module.os, 'geteuid', return_value=0), patch.object(Path, 'read_text', return_value='0::/system.slice/' + scope), patch.object(module.subprocess, 'run'), patch.object(module, 'attached_filters', side_effect=ValueError('no hook')):
            with self.assertRaises(ValueError): module.apply_current_scope()

    def test_apply_refuses_service_parent_and_unprivileged_callers(self):
        with patch.object(module.subprocess, 'run') as run:
            with patch.object(module.os, 'geteuid', return_value=0), patch.object(Path, 'read_text', return_value='0::/system.slice/playbound-game-host.service'):
                with self.assertRaises(ValueError): module.apply_current_scope()
            with patch.object(module.os, 'geteuid', return_value=1000):
                with self.assertRaises(ValueError): module.apply_current_scope()
            run.assert_not_called()

    def inspect(self, syscall, scope=SCOPE, machine='x86_64'):
        with patch.object(module.platform, 'machine', return_value=machine), patch.object(Path, 'read_text', return_value=scope), patch.object(module.os, 'open', return_value=7) as opened, patch.object(module.os, 'close') as closed, patch.object(module.ctypes, 'CDLL', return_value=SimpleNamespace(syscall=syscall)):
            result = module.attached_filters()
            self.assertEqual(opened.call_args.args[0], Path('/sys/fs/cgroup/system.slice/playbound-network-check-42.scope'))
            closed.assert_called_once_with(7)
            return result

    def test_both_exact_scope_hooks_are_queried_without_parent_fallback(self):
        types = []

        def syscall(number, operation, attributes, size):
            value = attributes._obj
            self.assertEqual((number, operation, size), (321, 16, 64))
            self.assertEqual(value.target_fd, 7)
            self.assertEqual(value.query_flags, 0)
            self.assertEqual(value.prog_cnt, 64)
            types.append(value.attach_type)
            value.prog_cnt = 1
            return 0

        self.assertEqual(self.inspect(syscall), {'kernelIngressPrograms': 1, 'kernelEgressPrograms': 1})
        self.assertEqual(types, [0, 1])

    def test_missing_ingress_or_egress_and_kernel_failure_are_not_enforcement(self):
        for missing in [0, 1]:
            def syscall(number, operation, attributes, size):
                value = attributes._obj
                value.prog_cnt = 0 if value.attach_type == missing else 1
                return 0
            with self.assertRaises(ValueError):
                self.inspect(syscall)
        with self.assertRaises(ValueError):
            self.inspect(lambda *args: -1)

    def test_unreviewed_architectures_and_foreign_scopes_fail_before_syscall(self):
        syscall = Mock()
        with self.assertRaises(ValueError):
            self.inspect(syscall, machine='aarch64')
        with self.assertRaises(ValueError):
            self.inspect(syscall, scope='0::/system.slice/playbound-game-host.service')
        syscall.assert_not_called()

    def test_child_verifies_kernel_before_privilege_drop_and_probes(self):
        order = []

        def connected(*args):
            self.assertEqual(order, ['kernel', 'groups', 'gid', 'uid'])
            return args[0] == '1.1.1.1'

        with patch.object(module.os, 'geteuid', return_value=0), patch.object(module.os, 'getuid', return_value=65534), patch.object(module.os, 'getgid', return_value=65534), patch.object(Path, 'read_text', return_value=SCOPE), patch.object(module, 'attached_filters', side_effect=lambda: order.append('kernel') or {'kernelIngressPrograms': 1, 'kernelEgressPrograms': 1}), patch.object(module.os, 'setgroups', side_effect=lambda groups: order.append('groups')), patch.object(module.os, 'setgid', side_effect=lambda gid: order.append('gid')), patch.object(module.os, 'setuid', side_effect=lambda uid: order.append('uid')), patch.object(module, 'connected', side_effect=connected):
            result = module.child(12345, 12346)
            self.assertTrue(result['loopback4Blocked'])
            self.assertTrue(result['loopback6Blocked'])
            self.assertTrue(result['public4Connected'])
            self.assertTrue(result['unprivileged'])

    def test_child_with_no_kernel_hook_cannot_report_success(self):
        with patch.object(module.os, 'geteuid', return_value=0), patch.object(Path, 'read_text', return_value=SCOPE), patch.object(module, 'attached_filters', side_effect=ValueError('no hook')), patch.object(module, 'connected') as connected:
            with self.assertRaises(ValueError):
                module.child(12345, 12346)
            connected.assert_not_called()


if __name__ == '__main__':
    unittest.main()
