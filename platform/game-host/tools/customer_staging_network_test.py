import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('staging_network', Path(__file__).with_name('customer-staging-network.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FixedStagingNetwork(unittest.TestCase):
    def test_rules_are_scoped_and_private_blocks_precede_public_egress(self):
        rows = module.rules('eth0')
        for row in rows:
            self.assertIn(module.COMMENT, row)
            self.assertTrue(module.HOST in row or module.ADDRESS+'/32' in row)
            self.assertNotIn('DNAT', row)
        forward = [row for row in rows if row[0] == 'FORWARD']
        outgoing = next(i for i, row in enumerate(forward) if '-i' in row and row[-1] == 'ACCEPT')
        self.assertTrue(all(row[-1] == 'DROP' for row in forward[:outgoing]))
        self.assertEqual(len(forward[:outgoing]), len(module.PRIVATE))
        self.assertEqual(forward[-2][-1], 'ACCEPT')
        self.assertIn('ESTABLISHED,RELATED', forward[-2])
        self.assertEqual(forward[-1][-1], 'DROP')

    def test_interface_injection_and_nonroot_start_are_refused(self):
        for interface in ('eth0;flush', '../eth0', '', True, 'x'*16):
            with self.assertRaises(ValueError):
                module.rules(interface)
        with patch.object(module.os, 'geteuid', return_value=1000), patch.object(module, 'execute') as execute:
            with self.assertRaises(ValueError):
                module.StagingEgress().start()
            execute.assert_not_called()

    def test_cleanup_removes_only_owned_exact_rules_and_link(self):
        network = module.StagingEgress()
        network.added = list(reversed(module.rules('eth0')))
        network.linked = True
        with patch.object(module, 'execute') as execute:
            network.close()
        calls = [call.args for call in execute.call_args_list]
        self.assertEqual(len(calls), len(module.rules('eth0'))+1)
        self.assertTrue(all('-D' in call for call in calls[:-1]))
        self.assertTrue(all(module.COMMENT in call for call in calls[:-1]))
        self.assertEqual(calls[-1], ('/usr/sbin/ip', 'link', 'del', module.HOST))
        self.assertFalse(network.added)
        self.assertFalse(network.linked)

    def test_failed_rule_cleanup_is_retained_for_exact_retry(self):
        network = module.StagingEgress()
        row = module.rules('eth0')[0]
        network.added = [row]
        with patch.object(module, 'execute', side_effect=OSError('fixture failure')):
            with self.assertRaises(RuntimeError):
                network.close()
        self.assertEqual(network.added, [row])
        with patch.object(module, 'execute') as execute:
            network.close()
        self.assertEqual(len(execute.call_args_list), 1)
        self.assertIn('-D', execute.call_args.args)
        self.assertFalse(network.added)


if __name__ == '__main__':
    unittest.main()
