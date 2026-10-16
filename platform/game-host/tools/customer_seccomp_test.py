import ctypes
import errno
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

if os.name == 'nt':
    raise unittest.SkipTest('Linux syscall boundary')


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


module = load('syscalls', 'customer-seccomp.py')
runtime = load('runtime', 'customer-runtime.py')


class NativeSyscalls(unittest.TestCase):
    def test_filter_is_bounded_sealed_and_cannot_be_modified(self):
        descriptor = module.sealed_filter()
        try:
            self.assertTrue(0 < os.fstat(descriptor).st_size <= 32768)
            self.assertEqual(fcntl.fcntl(descriptor, fcntl.F_GET_SEALS), 15)
            with self.assertRaises(OSError):
                os.write(descriptor, b'changed')
        finally:
            os.close(descriptor)

    def test_unreviewed_architecture_fails_closed(self):
        with patch.object(module.platform, 'machine', return_value='unknown'):
            with self.assertRaises(ValueError):
                module.sealed_filter()

    @unittest.skipUnless(os.getuid() == 0 and Path('/usr/bin/bwrap').exists(), 'Root native namespace fixture')
    def test_each_native_command_applies_the_filter_and_retains_private_data_access(self):
        code = '''import ctypes, errno, json, os, socket
from pathlib import Path
status=Path('/proc/self/status').read_text()
assert 'NoNewPrivs:\\t1' in status and 'Seccomp:\\t2' in status
libc=ctypes.CDLL(None,use_errno=True)
for number in [272,101,310,321]:
 ctypes.set_errno(0)
 assert libc.syscall(number,0,0,0,0,0,0)==-1 and ctypes.get_errno()==errno.EPERM
try:
 socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
except OSError as error:
 assert error.errno==errno.EPERM
else: raise AssertionError('Unix host socket access was allowed')
assert not Path('/opt/playbound-host/agent').exists()
assert not Path('/var/lib/playbound-host').exists()
assert not Path('/etc/playbound-game-host.env').exists()
Path('/server/owned.txt').write_text('private')
print(json.dumps({'filterApplied':True,'dangerousCallsDenied':True,'privateWritePassed':True}))
'''
        for game in runtime.NATIVE_GAMES:
            runtime.select_game(game)
            with tempfile.TemporaryDirectory() as temporary:
                folder = Path(temporary)
                folder.chmod(0o711)
                data = folder / 'data'
                data.mkdir(mode=0o700)
                os.chown(data, 65534, 65534)
                config = os.memfd_create('config-fixture', os.MFD_CLOEXEC)
                descriptor = module.sealed_filter()
                try:
                    command = runtime.command(data, config, runtime.NATIVE_GAMES[game][1], 1024,
                                              native_settings={'maxPlayers':4,'scoreLimit':3,'name':'Private fixture','mode':3,'difficulty':1}, seccomp_fd=descriptor)
                    delimiter = len(command) - 1 - command[::-1].index('--')
                    result = subprocess.run([*command[:delimiter+1], '/usr/bin/python3', '-I', '-c', code],
                        user=65534, group=65534, extra_groups=[], pass_fds=(config,descriptor),
                        env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}, cwd='/', capture_output=True, text=True, timeout=10, check=True)
                    self.assertTrue(json.loads(result.stdout)['filterApplied'])
                    self.assertEqual((data/'owned.txt').stat().st_uid,65534)
                finally:
                    os.close(config)
                    os.close(descriptor)


if __name__ == '__main__':
    unittest.main()
