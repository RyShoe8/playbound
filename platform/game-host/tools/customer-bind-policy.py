"""Fixed x86_64 cgroup bind policy for the root runtime supervisor.

Six verifier-bounded instructions compare bpf_sock_addr.user_port to the
allocated network-order port. No maps, helpers, caller bytecode or fallback.
"""
import ctypes
import os
from pathlib import Path
import platform
import re
import socket
import struct


class Load(ctypes.Structure):
    _fields_ = [('prog_type',ctypes.c_uint32),('insn_cnt',ctypes.c_uint32),
                ('insns',ctypes.c_uint64),('license',ctypes.c_uint64),
                ('log_level',ctypes.c_uint32),('log_size',ctypes.c_uint32),
                ('log_buf',ctypes.c_uint64),('kern_version',ctypes.c_uint32),
                ('prog_flags',ctypes.c_uint32),('prog_name',ctypes.c_char*16),
                ('prog_ifindex',ctypes.c_uint32),('expected_attach_type',ctypes.c_uint32)]


class Attach(ctypes.Structure):
    _fields_ = [('target_fd',ctypes.c_uint32),('attach_bpf_fd',ctypes.c_uint32),
                ('attach_type',ctypes.c_uint32),('attach_flags',ctypes.c_uint32),
                ('replace_bpf_fd',ctypes.c_uint32)]


class Information(ctypes.Structure):
    _fields_ = [('bpf_fd',ctypes.c_uint32),('info_len',ctypes.c_uint32),('info',ctypes.c_uint64)]


class Query(ctypes.Structure):
    _fields_ = [('target_fd',ctypes.c_uint32),('attach_type',ctypes.c_uint32),
                ('query_flags',ctypes.c_uint32),('attach_flags',ctypes.c_uint32),
                ('prog_ids',ctypes.c_uint64),('prog_cnt',ctypes.c_uint32),
                ('padding',ctypes.c_uint32),('prog_attach_flags',ctypes.c_uint64),
                ('link_ids',ctypes.c_uint64),('link_attach_flags',ctypes.c_uint64),
                ('revision',ctypes.c_uint64)]


def syscall(command, attribute):
    if os.geteuid() != 0 or platform.machine() != 'x86_64':
        raise ValueError('Native bind policy needs the reviewed root x86_64 ABI')
    libc = ctypes.CDLL(None,use_errno=True)
    libc.syscall.restype = ctypes.c_long
    result = libc.syscall(321,command,ctypes.byref(attribute),ctypes.sizeof(attribute))
    if result < 0:
        raise ValueError('Kernel rejected the native bind policy operation: ' + str(ctypes.get_errno()))
    return result


def instructions(port, stk_discovery=False, flightgear_status=False):
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError('Invalid native port allocation')
    if type(stk_discovery) is not bool or stk_discovery and (not 2759 <= port <= 2777 or port % 2 != 1):
        raise ValueError('Invalid SuperTuxKart discovery contract')
    if type(flightgear_status) is not bool or flightgear_status and (stk_discovery or not 5000 <= port <= 5010 or port % 2):
        raise ValueError('Invalid FlightGear status allocation')
    if stk_discovery or flightgear_status:
        # Only STK's allocated UDP discovery port is additional. TCP discovery,
        # dynamic binds and every other explicit port remain denied.
        rows = [(0x61,0x12,24,0), (0x15,0x02,5,socket.htons(port)),
                (0x61,0x13,36,0), (0x55,0x03,1,socket.IPPROTO_TCP if flightgear_status else socket.IPPROTO_UDP),
                (0x15,0x02,2,socket.htons(port+1)),
                (0xb7,0,0,0),(0x95,0,0,0),(0xb7,0,0,1),(0x95,0,0,0)]
        return b''.join(struct.pack('<BBhi',*row) for row in rows)
    rows = [(0x61,0x12,24,0),       # r2 = *(u32 *)(r1 + user_port)
            (0x15,0x02,2,socket.htons(port)),
            (0xb7,0x00,0,0),(0x95,0x00,0,0),
            (0xb7,0x00,0,1),(0x95,0x00,0,0)]
    return b''.join(struct.pack('<BBhi',*row) for row in rows)


def validate_scope(scope):
    if scope.parent != Path('/sys/fs/cgroup/system.slice') or not re.fullmatch(r'playbound-customer-[a-f0-9]{24}-[1-9][0-9]*\.scope',scope.name):
        raise ValueError('Invalid native bind scope')
    return scope


def program_ids(scope):
    validate_scope(scope)
    descriptor = os.open(scope,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        result = {}
        for kind in (8,9):
            ids = (ctypes.c_uint32*64)()
            query = Query(target_fd=descriptor,attach_type=kind,prog_ids=ctypes.addressof(ids),prog_cnt=64)
            syscall(16,query)
            if not 1 <= query.prog_cnt <= 64:
                raise ValueError('Native bind policy is not attached')
            result[str(kind)] = list(ids[:query.prog_cnt])
        return result
    finally:
        os.close(descriptor)


def apply_current(port, stk_discovery=False, flightgear_status=False):
    program_bytes = instructions(port,stk_discovery,flightgear_status)
    bytecode = ctypes.create_string_buffer(program_bytes)
    license = ctypes.create_string_buffer(b'GPL\0')
    placement = Path('/proc/self/cgroup').read_text().strip()
    match = re.fullmatch(r'0::/system.slice/(playbound-customer-[a-f0-9]{24}-[1-9][0-9]*\.scope)',placement)
    if not match:
        raise ValueError('Bind policy must attach to the current customer scope')
    scope = validate_scope(Path('/sys/fs/cgroup/system.slice')/match[1])
    target = os.open(scope,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    expected = {}
    try:
        for kind in (8,9):
            log = ctypes.create_string_buffer(65536)
            attribute = Load(prog_type=18,insn_cnt=len(program_bytes)//8,insns=ctypes.addressof(bytecode),
                             license=ctypes.addressof(license),log_level=1,log_size=65536,
                             log_buf=ctypes.addressof(log),prog_name=b'pb_bind_port_v1',expected_attach_type=kind)
            program = syscall(5,attribute)
            try:
                info = ctypes.create_string_buffer(256)
                syscall(15,Information(bpf_fd=program,info_len=256,info=ctypes.addressof(info)))
                program_type, program_id = struct.unpack_from('<II',info.raw)
                if program_type != 18 or program_id <= 0:
                    raise ValueError('Unexpected native bind program identity')
                syscall(8,Attach(target_fd=target,attach_bpf_fd=program,attach_type=kind,attach_flags=2))
                expected[str(kind)] = [program_id]
            finally:
                os.close(program)
        if program_ids(scope) != expected:
            raise ValueError('Native bind program attachment mismatch')
        for family in (socket.AF_INET,socket.AF_INET6):
            with socket.socket(family,socket.SOCK_STREAM) as probe:
                try:
                    probe.bind(('0.0.0.0' if family == socket.AF_INET else '::',60000 if port != 60000 else 60001))
                except PermissionError:
                    pass
                else:
                    raise ValueError('Kernel did not enforce native bind denial')
        return expected
    finally:
        os.close(target)
