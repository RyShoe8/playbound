import copy
import importlib.util
import ipaddress
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('host_network', Path(__file__).with_name('customer-host-network.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    uid = 40000
    table = module.table_name(uid)
    match = lambda left, right: {'match': {'op': '==', 'left': left, 'right': right}}
    network = lambda protocol, values: match({'payload': {'protocol': protocol, 'field': 'daddr'}},
        {'set': [{'prefix': {'addr': str(value.network_address), 'len': value.prefixlen}}
                 for value in ipaddress.collapse_addresses(map(ipaddress.ip_network, values))]})
    selectors = [match({'ct': {'key': 'direction'}}, 'reply'),
                 match({'fib': {'result': 'type', 'flags': ['daddr']}}, 'local'),
                 network('ip', module.PRIVATE4), network('ip6', module.PRIVATE6)]
    rows = [{'table': {'family': 'inet', 'name': table, 'handle': 1}},
            {'chain': {'family': 'inet', 'table': table, 'name': 'output', 'handle': 2,
                       'type': 'filter', 'hook': 'output', 'prio': 50, 'policy': 'accept'}}]
    for index, comment in enumerate(['pb-replies-v1', 'pb-host-v1', 'pb-private4-v1', 'pb-private6-v1']):
        rows.append({'rule': {'family': 'inet', 'table': table, 'chain': 'output',
                    'handle': index + 3, 'comment': comment,
                    'expr': [match({'meta': {'key': 'skuid'}}, uid), selectors[index],
                             {'counter': {'packets': 0, 'bytes': 0}},
                             {'return': None} if index == 0 else {'drop': None}]}})
    return {'nftables': rows}


class HostNetworkTests(unittest.TestCase):
    def test_exact_kernel_document_and_collapsed_ranges(self):
        self.assertTrue(module.verify_document(fixture(), 40000))

    def test_mutated_policy_is_never_adopted(self):
        mutations = [lambda rows: rows[0]['table'].update(flags=['dormant']),
                     lambda rows: rows[1]['chain'].update(policy='drop'),
                     lambda rows: rows[2]['rule']['expr'][0]['match'].update(right=40001),
                     lambda rows: rows[2]['rule']['expr'][1]['match'].update(right='original'),
                     lambda rows: rows[3]['rule']['expr'].__setitem__(3, {'accept': None}),
                     lambda rows: rows[4]['rule']['expr'][1]['match']['right']['set'].pop(),
                     lambda rows: rows[5]['rule']['expr'][2]['counter'].update(bytes=-1),
                     lambda rows: rows.append(copy.deepcopy(rows[-1]))]
        for mutate in mutations:
            document = fixture()
            mutate(document['nftables'])
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                module.verify_document(document, 40000)

    def test_reserved_identity_only(self):
        for value in (True, '40000', 39999, 40256, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.policy(value)


def with_self_udp(port=25580):
    document = fixture()
    rows = document['nftables']
    rule = copy.deepcopy(rows[2])
    rule['rule']['comment'] = 'pb-self-udp-v1'
    rule['rule']['handle'] = 99
    match = lambda left, right: {'match': {'op': '==', 'left': left, 'right': right}}
    rule['rule']['expr'] = [match({'meta': {'key': 'skuid'}}, 40000),
        match({'payload': {'protocol': 'udp', 'field': 'dport'}}, port),
        match({'fib': {'result': 'type', 'flags': ['daddr']}}, 'local'),
        {'counter': {'packets': 0, 'bytes': 0}}, {'accept': None}]
    rows.insert(3, rule)
    return document


class SelfUdpTests(unittest.TestCase):
    def test_policy_text_adds_only_the_exact_port_rule(self):
        self.assertNotIn('pb-self-udp-v1', module.policy(40000))
        text = module.policy(40000, False, 25580)
        self.assertIn('udp dport 25580 fib daddr type local counter accept comment "pb-self-udp-v1"', text)
        self.assertLess(text.index('pb-replies-v1'), text.index('pb-self-udp-v1'))
        self.assertLess(text.index('pb-self-udp-v1'), text.index('pb-host-v1'))
        for value in (True, '25580', 80, 70000):
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.policy(40000, False, value)

    def test_exact_self_udp_document_verifies_and_mutations_do_not(self):
        self.assertTrue(module.verify_document(with_self_udp(), 40000))
        mutations = [lambda rows: rows[3]['rule']['expr'][1]['match'].update(right=80),
                     lambda rows: rows[3]['rule']['expr'][1]['match']['left']['payload'].update(protocol='tcp'),
                     lambda rows: rows[3]['rule']['expr'][2]['match'].update(right='unicast'),
                     lambda rows: rows[3]['rule']['expr'].__setitem__(4, {'return': None}),
                     lambda rows: rows[3]['rule']['expr'][0]['match'].update(right=40001),
                     lambda rows: rows[3]['rule'].update(comment='pb-other'),
                     lambda rows: rows[3]['rule']['expr'].pop(2)]
        for mutate in mutations:
            document = with_self_udp()
            mutate(document['nftables'])
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                module.verify_document(document, 40000)


if __name__ == '__main__':
    unittest.main()
