import importlib.util
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest

if os.name == 'nt':
    raise unittest.SkipTest('Linux i386 kernel boundary')

spec = importlib.util.spec_from_file_location('legacy_filter', Path(__file__).with_name('customer-seccomp.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    """Small static i386 ELF: no compiler, linker, libc or downloads required."""
    code = bytearray()
    branches = []
    def move(opcode, value):
        code.extend(bytes([opcode])+struct.pack('<I', value))
    def syscall(number, first=0, second=0, third=0):
        move(0xb8, number); move(0xbb, first); move(0xb9, second); move(0xba, third)
        code.extend(b'\xcd\x80')
    def denied():
        code.extend(b'\x83\xf8\xff\x0f\x85')  # cmp eax,-1; jne failure
        branches.append(len(code)); code.extend(b'\0'*4)
    syscall(102, 1)  # socketcall(SYS_SOCKET,NULL): never dereference the pointer
    denied()
    syscall(117)  # old SysV IPC multiplexer
    denied()
    for number in (21, 26, 310):  # mount, ptrace, unshare under the i386 ABI
        syscall(number)
        denied()
    syscall(359, 1, 1)  # direct socket(AF_UNIX,SOCK_STREAM,0)
    denied()
    syscall(359, 2, 2)  # direct socket(AF_INET,SOCK_DGRAM,0) remains usable
    code.extend(b'\x83\xf8\x00\x0f\x8c')  # cmp eax,0; jl failure
    branches.append(len(code)); code.extend(b'\0'*4)
    syscall(1, 0)
    failure = len(code)
    syscall(1, 77)
    for position in branches:
        struct.pack_into('<i', code, position, failure-position-4)
    header_size = 52+32
    base = 0x08048000
    header = struct.pack('<16sHHIIIIIHHHHHH', b'\x7fELF\x01\x01\x01'+b'\0'*9,
                         2, 3, 1, base+header_size, 52, 0, 0, 52, 32, 1, 0, 0, 0)
    program = struct.pack('<IIIIIIII', 1, 0, base, base, header_size+len(code),
                          header_size+len(code), 5, 4096)
    return header+program+code


class LegacyAbiBoundary(unittest.TestCase):
    def test_i386_direct_networking_retains_guards_and_multiplexers_fail_closed(self):
        descriptor = module.sealed_filter(legacy_x86=True)
        self.addCleanup(os.close, descriptor)
        driver = '''import ctypes,os,sys
raw=os.read(int(sys.argv[1]),32768)
class Insn(ctypes.Structure):
 _fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
class Program(ctypes.Structure):
 _fields_=[('length',ctypes.c_ushort),('filter',ctypes.POINTER(Insn))]
instructions=(Insn*(len(raw)//8)).from_buffer_copy(raw)
program=Program(len(instructions),instructions)
libc=ctypes.CDLL(None,use_errno=True)
assert libc.prctl(38,1,0,0,0)==0
assert libc.syscall(317,1,0,ctypes.byref(program))==0
os.execv(sys.argv[2],[sys.argv[2]])
'''
        with tempfile.TemporaryDirectory() as temporary:
            binary = Path(temporary)/'i386-boundary'
            binary.write_bytes(fixture()); binary.chmod(0o700)
            result = subprocess.run(['/usr/bin/python3', '-I', '-c', driver,
                                     str(descriptor), str(binary)], pass_fds=(descriptor,),
                                    capture_output=True, text=True, timeout=10)
            if result.returncode != 0 and 'Exec format error' in result.stderr:
                self.skipTest('Kernel lacks IA32 execution support')
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_abi_policy_is_not_a_caller_defined_value(self):
        for value in ('true', 1, None, {}, 'wine'):
            with self.assertRaises(ValueError):
                module.sealed_filter(legacy_x86=value)


if __name__ == '__main__':
    unittest.main()
