"""Fixed native-game syscall boundary. No caller rules, paths or filter bytes."""
import ctypes
import errno
import fcntl
import os
import platform
from pathlib import Path

DENIED = (
    'mount', 'umount2', 'pivot_root', 'open_tree', 'move_mount', 'fsopen',
    'fsconfig', 'fsmount', 'fspick', 'mount_setattr', 'unshare', 'setns',
    'ptrace', 'process_vm_readv', 'process_vm_writev', 'open_by_handle_at',
    'bpf', 'perf_event_open', 'userfaultfd', 'keyctl', 'add_key', 'request_key',
    'init_module', 'finit_module', 'delete_module', 'kexec_load',
    'kexec_file_load', 'reboot', 'swapon', 'swapoff', 'io_uring_setup',
)


def sealed_filter(legacy_x86=False, private_display=False, seqpacket_pairs=False, guarded_x86=False, guarded_streams=False):
    """guarded_x86: a 32-bit engine whose sockets go through the socketcall multiplexer.

    socketcall cannot be argument-filtered, so it is admitted only inside the
    enforced per-UID AppArmor policy, which limits Unix sockets to same-label
    peers (host abstract sockets stay unreachable). `ipc` stays denied.

    guarded_streams: the NaCl seqpacket-pair profile plus AF_UNIX stream sockets,
    admitted only inside that same enforced AppArmor policy. Daemon (Unvanquished)
    always opens a filesystem singleton socket in $TMPDIR and has no flag to skip it.
    """
    if (type(private_display) is not bool or type(seqpacket_pairs) is not bool or type(guarded_x86) is not bool
            or type(guarded_streams) is not bool
            or (guarded_streams and (private_display or legacy_x86 or guarded_x86 or seqpacket_pairs))
            or (seqpacket_pairs and (private_display or legacy_x86 or guarded_x86))
            or (guarded_x86 and (private_display or legacy_x86))):
        raise ValueError('Invalid private display policy')
    if private_display or guarded_x86 or guarded_streams:
        uid = os.getuid()
        if legacy_x86 or not 40000 <= uid <= 40255:
            raise ValueError('Reviewed private display identity required')
        expected = 'playbound-customer-ipc-'+str(uid)+' (enforce)'
        if Path('/proc/self/attr/current').read_text().strip() != expected:
            raise ValueError('Enforced private IPC label required')
    if type(legacy_x86) is not bool:
        raise ValueError("Invalid legacy ABI policy")
    if platform.machine() != 'x86_64':
        raise ValueError('Native syscall profile requires reviewed x86_64 ABI')
    library = ctypes.CDLL('libseccomp.so.2', use_errno=True)
    library.seccomp_init.argtypes = [ctypes.c_uint32]
    library.seccomp_init.restype = ctypes.c_void_p
    library.seccomp_arch_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    library.seccomp_arch_add.restype = ctypes.c_int
    library.seccomp_release.argtypes = [ctypes.c_void_p]
    library.seccomp_release.restype = None
    library.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    library.seccomp_syscall_resolve_name.restype = ctypes.c_int
    library.seccomp_rule_add_array.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint, ctypes.c_void_p]
    library.seccomp_rule_add_array.restype = ctypes.c_int
    library.seccomp_export_bpf.argtypes = [ctypes.c_void_p, ctypes.c_int]
    library.seccomp_export_bpf.restype = ctypes.c_int
    context = library.seccomp_init(0x7fff0000)  # SCMP_ACT_ALLOW
    if not context:
        raise ValueError('Could not construct native syscall boundary')
    descriptor = None
    try:
        if legacy_x86:
            if library.seccomp_arch_add(context, 0x40000003) != 0:  # SCMP_ARCH_X86
                raise ValueError('Reviewed i386 ABI is unavailable')
            # Never permit opaque pointer-based multiplexers. Modern i386
            # direct socket syscalls retain the same argument checks below.
            for name in ('socketcall', 'ipc'):
                number = library.seccomp_syscall_resolve_name(name.encode('ascii'))
                if library.seccomp_rule_add_array(context, 0x00050000 | errno.EPERM, number, 0, None) != 0:
                    raise ValueError('Legacy multiplexer denial is unavailable')
        for name, error in [*((name, errno.EPERM) for name in DENIED), ('clone3', errno.ENOSYS)]:
            syscall = library.seccomp_syscall_resolve_name(name.encode('ascii'))
            if syscall < 0 or library.seccomp_rule_add_array(context, 0x00050000 | error, syscall, 0, None) != 0:
                raise ValueError('Native syscall rule is unavailable')
        class Argument(ctypes.Structure):
            _fields_ = [('arg',ctypes.c_uint),('op',ctypes.c_int),('a',ctypes.c_uint64),('b',ctypes.c_uint64)]
        family = Argument(arg=0,op=4,a=1,b=0)  # SCMP_CMP_EQ, AF_UNIX
        # Java NIO needs connected stream pairs. Reconnectable datagram pairs
        # remain denied by default; only the accepted private-display peer
        # boundary can admit them for Steam's internal IPC.
        syscall=library.seccomp_syscall_resolve_name(b'socket')
        if syscall < 0:
            raise ValueError('Native Unix socket boundary is unavailable')
        if private_display or guarded_x86 or guarded_streams:
            # Only stream sockets are admitted, and only after entering the
            # accepted per-UID AppArmor peer boundary. No datagram reconnects.
            for kind in range(16):
                if kind == 1: continue
                arguments=(Argument*2)(family,Argument(arg=1,op=7,a=15,b=kind))
                if library.seccomp_rule_add_array(context,0x00050000|errno.EPERM,syscall,2,arguments) != 0:
                    raise ValueError('Private display socket boundary is unavailable')
        elif library.seccomp_rule_add_array(context,0x00050000|errno.EPERM,syscall,1,ctypes.byref(family)) != 0:
            raise ValueError('Native Unix socket boundary is unavailable')
        pair=library.seccomp_syscall_resolve_name(b'socketpair')
        non_unix=Argument(arg=0,op=1,a=1,b=0)  # SCMP_CMP_NE
        if pair < 0 or library.seccomp_rule_add_array(context,0x00050000|errno.EPERM,pair,1,ctypes.byref(non_unix)) != 0:
            raise ValueError('Private stream IPC boundary is unavailable')
        for kind in range(16):
            if kind == 1 or (private_display and kind == 2) or ((seqpacket_pairs or guarded_streams) and kind == 5): continue  # streams; guarded same-label datagram pairs; anonymous connected seqpacket pairs for the NaCl loader
            arguments=(Argument*2)(family,Argument(arg=1,op=7,a=15,b=kind))  # MASKED_EQ
            if library.seccomp_rule_add_array(context,0x00050000|errno.EPERM,pair,2,arguments) != 0:
                raise ValueError('Private stream IPC type boundary is unavailable')
        if guarded_x86:
            # The i386 ABI is added only now, after the native-only socket argument
            # rules above, so libseccomp does not translate those rules into a
            # blanket socketcall denial. The AppArmor profile (checked at entry)
            # is what confines Unix sockets for these engines; ipc stays denied
            # and the common deny list applies to both ABIs.
            if library.seccomp_arch_add(context, 0x40000003) != 0:  # SCMP_ARCH_X86
                raise ValueError('Reviewed i386 ABI is unavailable')
            for name, error in [('ipc', errno.EPERM), *((name, errno.EPERM) for name in DENIED), ('clone3', errno.ENOSYS)]:
                syscall = library.seccomp_syscall_resolve_name(name.encode('ascii'))
                if library.seccomp_rule_add_array(context, 0x00050000 | error, syscall, 0, None) != 0:
                    raise ValueError('Guarded i386 syscall rule is unavailable')
        descriptor = os.memfd_create('playbound-native-syscalls-v1', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
        if library.seccomp_export_bpf(context, descriptor) != 0:
            raise ValueError('Could not export native syscall boundary')
        size = os.fstat(descriptor).st_size
        if not 0 < size <= 32768 or size % 8:
            raise ValueError('Invalid native syscall program')
        os.lseek(descriptor, 0, os.SEEK_SET)
        fcntl.fcntl(descriptor, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
        result, descriptor = descriptor, None
        return result
    finally:
        library.seccomp_release(context)
        if descriptor is not None:
            os.close(descriptor)
