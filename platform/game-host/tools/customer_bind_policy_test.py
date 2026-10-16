import importlib.util
from pathlib import Path
import socket
import struct
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bind_policy', Path(__file__).with_name('customer-bind-policy.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BindPolicyTests(unittest.TestCase):
    def test_stk_secondary_port_is_udp_only_and_never_an_arbitrary_rule(self):
        rows = list(struct.iter_unpack('<BBhi',module.instructions(2779,True)))
        def evaluate(port,protocol):
            registers={1:0};position=0
            while position < len(rows):
                code,register,offset,value=rows[position];destination=register&15
                if code==0x61:registers[destination]={36:protocol,24:socket.htons(port)}[offset]
                elif code==0x15 and registers[destination]==value:position+=offset
                elif code==0x55 and registers[destination]!=value:position+=offset
                elif code==0xb7:registers[destination]=value
                elif code==0x95:return registers[0]
                position+=1
            self.fail('Unterminated bind program')
        for protocol in (socket.IPPROTO_TCP,socket.IPPROTO_UDP):
            for port in (0,2757,2758,2779,2780,60000):
                self.assertEqual(evaluate(port,protocol),int(port==2779 or port==2757 and protocol==socket.IPPROTO_UDP))
        for port,flag in [(27980,True),(2779,'true'),(2779,1)]:
            with self.assertRaises(ValueError):module.instructions(port,flag)
    def test_fixed_program_allows_only_allocated_network_order_port(self):
        rows = list(struct.iter_unpack('<BBhi', module.instructions(3999)))
        self.assertEqual(rows, [(0x61, 0x12, 24, 0), (0x15, 2, 2, socket.htons(3999)),
                                (0xb7, 0, 0, 0), (0x95, 0, 0, 0),
                                (0xb7, 0, 0, 1), (0x95, 0, 0, 0)])
        for port in (0, 3998, 4000, 65535):
            self.assertNotEqual(socket.htons(port), rows[1][3])

    def test_untyped_and_out_of_range_ports_rejected(self):
        for value in (True, False, '3999', 3999.0, -1, 0, 65536, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.instructions(value)

    def test_only_customer_scope_can_be_selected(self):
        good = Path('/sys/fs/cgroup/system.slice/playbound-customer-' + 'a' * 24 + '-123.scope')
        self.assertEqual(module.validate_scope(good), good)
        for value in (good.parent, Path('/tmp') / good.name,
                      good.with_name('playbound-game-host.service'),
                      good.with_name(good.name.replace('-123.', '-0.'))):
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.validate_scope(value)

    def test_missing_kernel_attachment_fails_closed(self):
        scope = Path('/sys/fs/cgroup/system.slice/playbound-customer-' + 'a' * 24 + '-123.scope')
        def query(command, attribute):
            self.assertEqual(command, 16)
            self.assertEqual(attribute.query_flags, 0)
            attribute.prog_cnt = 0
        with patch.object(module.os, 'O_DIRECTORY', 0, create=True), patch.object(module.os, 'O_NOFOLLOW', 0, create=True), patch.object(module.os, 'open', return_value=42), patch.object(module.os, 'close'), patch.object(module, 'syscall', side_effect=query):
            with self.assertRaisesRegex(ValueError, 'not attached'):
                module.program_ids(scope)


if __name__ == '__main__':
    unittest.main()
