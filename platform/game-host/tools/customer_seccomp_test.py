import ctypes
import errno
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import socket
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
    def test_display_filter_requires_matching_reserved_enforced_label(self):
        for value in (1, 'yes', None, {}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.sealed_filter(private_display=value)
        for uid in (0, 39999, 40256):
            with patch.object(module.os, 'getuid', return_value=uid):
                with self.assertRaises(ValueError):module.sealed_filter(private_display=True)
        for label in ('unconfined', 'playbound-customer-ipc-40001 (enforce)',
                      'playbound-customer-ipc-40000 (complain)'):
            with patch.object(module.os, 'getuid', return_value=40000), patch.object(module.Path, 'read_text', return_value=label):
                with self.assertRaises(ValueError):module.sealed_filter(private_display=True)
        with patch.object(module.os, 'getuid', return_value=40000):
            with self.assertRaises(ValueError):module.sealed_filter(legacy_x86=True, private_display=True)

    def test_guarded_i386_mode_requires_the_enforced_label_and_is_exclusive(self):
        for kwargs in ({'private_display': True}, {'legacy_x86': True}, {'seqpacket_pairs': True}):
            with patch.object(module.os, 'getuid', return_value=40000), self.assertRaises(ValueError):
                module.sealed_filter(guarded_x86=True, **kwargs)
        with self.assertRaises(ValueError):
            module.sealed_filter(guarded_x86=1)
        with patch.object(module.os, 'getuid', return_value=1000), self.assertRaises(ValueError):
            module.sealed_filter(guarded_x86=True)
        for label in ('unconfined', 'playbound-customer-ipc-40001 (enforce)', 'playbound-customer-ipc-40000 (complain)'):
            with patch.object(module.os, 'getuid', return_value=40000), patch.object(module.Path, 'read_text', return_value=label):
                with self.subTest(label=label), self.assertRaises(ValueError):
                    module.sealed_filter(guarded_x86=True)

    def test_guarded_i386_filter_is_sealed_and_larger_than_the_native_one(self):
        with patch.object(module.os, 'getuid', return_value=40000), patch.object(module.Path, 'read_text', return_value='playbound-customer-ipc-40000 (enforce)'):
            guarded = module.sealed_filter(guarded_x86=True)
            legacy_size = None
        try:
            expected = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
            self.assertEqual(fcntl.fcntl(guarded, fcntl.F_GET_SEALS), expected)
            native = module.sealed_filter()
            try:
                self.assertGreater(os.fstat(guarded).st_size, os.fstat(native).st_size)
            finally:
                os.close(native)
        finally:
            os.close(guarded)

    def test_display_filter_is_sealed_after_label_guard(self):
        with patch.object(module.os, 'getuid', return_value=40000), patch.object(module.Path, 'read_text', return_value='playbound-customer-ipc-40000 (enforce)'):
            descriptor = module.sealed_filter(private_display=True)
        try:
            expected=fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL
            self.assertEqual(fcntl.fcntl(descriptor, fcntl.F_GET_SEALS),expected)
            self.assertGreater(os.fstat(descriptor).st_size,0)
        finally:os.close(descriptor)

    def test_display_filter_allows_only_reviewed_socket_pairs_in_real_kernel(self):
        # Mock only the construction precondition locally. Actual peer-label
        # isolation is verified separately by the VPS acceptance harness.
        with patch.object(module.os, 'getuid', return_value=40000), patch.object(module.Path, 'read_text', return_value='playbound-customer-ipc-40000 (enforce)'):
            descriptor = module.sealed_filter(private_display=True)
        self.addCleanup(os.close, descriptor)
        code = '''import ctypes,errno,os,socket,sys
raw=os.read(int(sys.argv[1]),32768)
class Instruction(ctypes.Structure):
 _fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
class Program(ctypes.Structure):
 _fields_=[('length',ctypes.c_ushort),('filter',ctypes.POINTER(Instruction))]
instructions=(Instruction*(len(raw)//8)).from_buffer_copy(raw)
program=Program(len(instructions),instructions)
libc=ctypes.CDLL(None,use_errno=True)
assert libc.prctl(38,1,0,0,0)==0
assert libc.syscall(317,1,0,ctypes.byref(program))==0
for kind in (socket.SOCK_STREAM,socket.SOCK_DGRAM):
 a,b=socket.socketpair(socket.AF_UNIX,kind);a.send(b'x');assert b.recv(1)==b'x';a.close();b.close()
for operation in (lambda:socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM),lambda:socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)):
 try:operation()
 except OSError as error:assert error.errno==errno.EPERM
 else:raise AssertionError('Unreviewed Unix socket operation admitted')
for number in (272,321,101):
 ctypes.set_errno(0)
 assert libc.syscall(number,0,0,0,0,0,0)==-1 and ctypes.get_errno()==errno.EPERM
print('display-kernel-filter-passed')
'''
        result = subprocess.run(['/usr/bin/python3', '-I', '-c', code, str(descriptor)],
                                pass_fds=(descriptor,), capture_output=True, text=True,
                                timeout=10, check=True)
        self.assertEqual(result.stdout.strip(), 'display-kernel-filter-passed')

    def test_filter_enforces_unix_socket_and_privileged_syscall_denials_without_bwrap(self):
        # Exercise the real kernel filter even on test hosts without bubblewrap.
        # Installing it only in a child keeps the test runner unrestricted.
        descriptor = module.sealed_filter()
        self.addCleanup(os.close, descriptor)
        code = '''import ctypes, errno, os, socket, sys
fd=int(sys.argv[1])
raw=os.read(fd,32768)
class Instruction(ctypes.Structure):
 _fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
class Program(ctypes.Structure):
 _fields_=[('length',ctypes.c_ushort),('filter',ctypes.POINTER(Instruction))]
instructions=(Instruction*(len(raw)//8)).from_buffer_copy(raw)
program=Program(len(instructions),instructions)
libc=ctypes.CDLL(None,use_errno=True)
assert libc.prctl(38,1,0,0,0)==0
assert libc.syscall(317,1,0,ctypes.byref(program))==0
for number in (272,321,101):
 ctypes.set_errno(0)
 assert libc.syscall(number,0,0,0,0,0,0)==-1 and ctypes.get_errno()==errno.EPERM
try: socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
except OSError as error: assert error.errno==errno.EPERM
else: raise AssertionError('host Unix sockets were allowed')
left,right=socket.socketpair()
left.sendall(b'private')
assert right.recv(32)==b'private'
left.close();right.close()
for kind in (socket.SOCK_DGRAM,socket.SOCK_SEQPACKET):
 try: socket.socketpair(socket.AF_UNIX,kind)
 except OSError as error: assert error.errno==errno.EPERM
 else: raise AssertionError('reconnectable socketpair was allowed')
print('kernel-filter-passed')
'''
        result = subprocess.run(['/usr/bin/python3', '-I', '-c', code, str(descriptor)],
                                pass_fds=(descriptor,), capture_output=True, text=True,
                                timeout=10, check=True)
        self.assertEqual(result.stdout.strip(), 'kernel-filter-passed')

    def test_seqpacket_pairs_are_opt_in_and_limited_to_anonymous_pairs_in_real_kernel(self):
        for kwargs in ({'private_display':True},{'legacy_x86':True}):
            with self.assertRaises(ValueError):module.sealed_filter(seqpacket_pairs=True,**kwargs)
        with self.assertRaises(ValueError):module.sealed_filter(seqpacket_pairs=1)
        descriptor = module.sealed_filter(seqpacket_pairs=True)
        self.addCleanup(os.close, descriptor)
        code = '''import ctypes, errno, os, socket, sys
raw=os.read(int(sys.argv[1]),32768)
class Instruction(ctypes.Structure):
 _fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
class Program(ctypes.Structure):
 _fields_=[('length',ctypes.c_ushort),('filter',ctypes.POINTER(Instruction))]
instructions=(Instruction*(len(raw)//8)).from_buffer_copy(raw)
program=Program(len(instructions),instructions)
libc=ctypes.CDLL(None,use_errno=True)
assert libc.prctl(38,1,0,0,0)==0
assert libc.syscall(317,1,0,ctypes.byref(program))==0
left,right=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET)
left.send(b'loader');assert right.recv(32)==b'loader'
for call in (lambda: socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET),lambda: socket.socketpair(socket.AF_UNIX,socket.SOCK_DGRAM)):
 try: call()
 except OSError as error: assert error.errno==errno.EPERM
 else: raise AssertionError('unreviewed Unix socket was allowed')
print('seqpacket-filter-passed')
'''
        result = subprocess.run(['/usr/bin/python3', '-I', '-c', code, str(descriptor)], pass_fds=(descriptor,), capture_output=True, text=True, timeout=10, check=True)
        self.assertEqual(result.stdout.strip(), 'seqpacket-filter-passed')

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
left,right=socket.socketpair()
left.sendall(b'private ipc')
assert right.recv(32)==b'private ipc'
try:
 left.connect('\\0playbound-host-socket-probe')
except OSError as error:
 assert error.errno==errno.EISCONN
else: raise AssertionError('Connected IPC pair reached an external socket')
left.close();right.close()
for kind in [socket.SOCK_DGRAM,socket.SOCK_SEQPACKET]:
 try: socket.socketpair(socket.AF_UNIX,kind)
 except OSError as error: assert error.errno==errno.EPERM
 else: raise AssertionError('Reconnectable Unix socket pair was allowed')
assert not Path('/opt/playbound-host/agent').exists()
assert not Path('/var/lib/playbound-host').exists()
assert not Path('/etc/playbound-game-host.env').exists()
Path('/server/owned.txt').write_text('private')
print(json.dumps({'filterApplied':True,'dangerousCallsDenied':True,'privateWritePassed':True}))
'''
        listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.addCleanup(listener.close)
        name='playbound-host-socket-probe-'+str(os.getpid())
        listener.bind('\0'+name);listener.listen(1);listener.setblocking(False)
        code=code.replace('playbound-host-socket-probe',name)
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
                                              native_settings={'maxPlayers':4,'scoreLimit':3,'name':'Private fixture','mode':3,'difficulty':1,'skill':3,'botFill':0,'map':'random/mainland'}, seccomp_fd=descriptor,
                                              assets=[(config,'/game-data/packages/maps/official/fixture.cgz')] if game=='assaultcube' else [(config,'/game-data/game.so')] if game=='medal-of-honor-allied-assault' else [(config,'/game-data/zandronum.pk3')] if game=='freedoom' else ())
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
