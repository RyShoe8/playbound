import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

spec = importlib.util.spec_from_file_location('deusex', Path(__file__).with_name('customer-deusex.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

TEMPLATE = '[URL]\r\nProtocol=deusex\r\nPort=7790\r\n[Engine.GameInfo]\r\nMaxPlayers=16\r\n[IpDrv.TcpNetDriver]\r\nAllowDownloads=True\r\n'


class DeusExContract(unittest.TestCase):
    def test_settings_and_port_triples(self):
        self.assertEqual(module.settings(json.dumps({'maxPlayers': 8}), 7793), {'maxPlayers': 8})
        for value, port in (({'maxPlayers': 9}, 7790), ({'maxPlayers': 1}, 7790), ({'maxPlayers': 4, 'x': 1}, 7790),
                            ({'maxPlayers': 4}, 7791), ({'maxPlayers': 4}, 7853), ({'maxPlayers': 4}, '7790')):
            with self.subTest(value=value, port=port), self.assertRaises(ValueError):
                module.settings(json.dumps(value), port)

    def test_private_files_are_only_ini_and_log(self):
        self.assertTrue(module.private_name('HX.ini'))
        self.assertTrue(module.private_name('HXServer.LOG'))
        self.assertFalse(module.private_name('HCC.exe'))
        self.assertFalse(module.private_name('HX.u'))

    def test_ini_matches_the_shared_runtime_byte_for_byte(self):
        python = module.build_ini(TEMPLATE, 7796, 12)
        self.assertIn('Port=7796', python)
        self.assertIn('MaxPlayers=8', python)
        self.assertIn('AllowDownloads=False', python)
        self.assertIn('[HX.HXUdpServerUplink]\r\nDoUplink=False', python)
        script = ("import('./deusExHx.js').then(m=>process.stdout.write(m.buildHxIni(process.argv[1],7796,12)))")
        try:
            node = subprocess.run(['node', '-e', script, TEMPLATE], cwd=Path(__file__).parent.parent,
                                  capture_output=True, timeout=30, check=True).stdout.decode('utf-8')
        except (FileNotFoundError, subprocess.CalledProcessError):
            self.skipTest('node is unavailable')
        self.assertEqual(python, node)


if __name__ == '__main__':
    unittest.main()
