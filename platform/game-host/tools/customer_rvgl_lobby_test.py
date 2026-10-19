import importlib.util
import os
from pathlib import Path
from unittest.mock import patch
import unittest

if os.name == 'nt':
    raise unittest.SkipTest('Linux private RVGL lobby helper')

spec = importlib.util.spec_from_file_location('rvgl_lobby', Path(__file__).with_name('customer-rvgl-lobby.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateLobby(unittest.TestCase):
    def test_input_is_bounded_and_nonprogrammable(self):
        self.assertEqual(module.validate_input({'type': 'key', 'key': 'Return'}),
                         (['mousemove', '320', '240'], ['key', '--clearmodifiers', 'Return']))
        self.assertEqual(module.validate_input({'type': 'click', 'x': 639, 'y': 479}),
                         (['mousemove', '639', '479'], ['click', '1']))
        for value in ({'type': 'click', 'x': -1, 'y': 0},
                      {'type': 'click', 'x': True, 'y': 1},
                      {'type': 'key', 'key': 'Ctrl+Alt+Delete'},
                      {'type': 'key', 'key': 'Return', 'command': 'extra'}, []):
            with self.assertRaises(ValueError):
                module.validate_input(value)

    def test_fixed_label_uid_display_and_binary(self):
        with patch.object(module.subprocess, 'run') as run:
            run.return_value.stdout = b'example'
            self.assertEqual(module.execute(40001, 1001, '/private/auth', ['/usr/bin/xdotool', 'getmouselocation']), b'example')
            command = run.call_args.args[0]
            self.assertEqual(command[:7], ['/usr/bin/aa-exec', '-p', 'playbound-customer-ipc-40001', '--',
                                            '/usr/bin/setpriv', '--reuid=40001', '--regid=40001'])
            self.assertIn('DISPLAY=:1001', command)
            self.assertIn('XAUTHORITY=/private/auth', command)
            self.assertEqual(command[-2:], ['/usr/bin/xdotool', 'getmouselocation'])


if __name__ == '__main__':
    unittest.main()
