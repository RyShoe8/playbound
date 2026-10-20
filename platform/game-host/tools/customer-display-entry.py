#!/usr/bin/python3 -I
"""Unprivileged internal handoff for root-constructed private-display launches.

Not a sudo endpoint. The supervisor owns the fixed namespace argv and passes a
read-only descriptor for its root-owned syscall helper. Constructing the filter
must happen after dropping identity and entering the enforced IPC policy.
"""
import fcntl
import os
from pathlib import Path
import stat
import sys
import types


def verify_identity():
    uid = os.getuid()
    if not 40000 <= uid <= 40255 or os.getresuid() != (uid, uid, uid):
        raise ValueError('Dropped customer identity required')
    if os.getresgid() != (uid, uid, uid):
        raise ValueError('Dropped customer group required')
    if os.getgroups():
        raise ValueError('Supplementary groups must be cleared')
    expected = 'playbound-customer-ipc-'+str(uid)+' (enforce)'
    if Path('/proc/self/attr/current').read_text().strip() != expected:
        raise ValueError('Enforced customer IPC policy required')


def verify_source(descriptor):
    if type(descriptor) is not int or not 3 <= descriptor <= 1048576:
        raise ValueError('Invalid syscall source descriptor')
    info = os.fstat(descriptor)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1
            or info.st_mode & 0o022 or not 0 < info.st_size <= 262144):
        raise ValueError('Untrusted syscall source')
    if fcntl.fcntl(descriptor, fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY:
        raise ValueError('Syscall source must be read-only')
    return info


def load_syscalls(descriptor):
    before = verify_source(descriptor)
    payload = os.pread(descriptor, before.st_size+1, 0)
    after = verify_source(descriptor)
    if len(payload) != before.st_size or any(getattr(before, field) != getattr(after, field)
           for field in ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')):
        raise ValueError('Syscall source changed during handoff')
    # Execute only the bounded, stable snapshot, never a pyc or reopened path.
    module = types.ModuleType('pb_display_syscalls')
    exec(compile(payload, '<trusted-display-syscalls>', 'exec'), module.__dict__)
    return module


def enter(source_descriptor, namespace_arguments, guarded_x86=False):
    verify_identity()  # Never import or execute a helper before this guard.
    if (not isinstance(namespace_arguments, list) or not namespace_arguments
            or any(not isinstance(arg, str) or '\x00' in arg for arg in namespace_arguments)
            or '--' not in namespace_arguments
            or namespace_arguments.index('--') == len(namespace_arguments)-1
            or any(arg == '--seccomp' or arg.startswith('--seccomp=') for arg in namespace_arguments)):
        raise ValueError('Invalid internal namespace command')
    source = load_syscalls(source_descriptor)
    descriptor = None
    try:
        # 32-bit engines get the guarded i386 profile; display games keep theirs.
        descriptor = source.sealed_filter(guarded_x86=True) if guarded_x86 else source.sealed_filter(private_display=True)
        seals = fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL
        if fcntl.fcntl(descriptor, fcntl.F_GET_SEALS) & seals != seals:
            raise ValueError('Unsealed private-display syscall filter')
        os.set_inheritable(descriptor, True)
        # The source helper is not part of the game namespace or inherited ABI.
        os.set_inheritable(source_descriptor, False)
        os.execv('/usr/bin/bwrap', ['/usr/bin/bwrap', '--seccomp', str(descriptor), *namespace_arguments])
    finally:
        if descriptor is not None:
            os.close(descriptor)


if __name__ == '__main__':
    try:
        if len(sys.argv) < 4 or not sys.argv[1].isascii() or not sys.argv[1].isdigit():
            raise ValueError('Invalid internal handoff')
        if sys.argv[2] == '--guarded-x86':
            enter(int(sys.argv[1]), sys.argv[3:], guarded_x86=True)
        else:
            enter(int(sys.argv[1]), sys.argv[2:])
    except Exception:
        # No raw argv, paths, configuration or game output in an error response.
        print('Private-display runtime handoff refused', file=sys.stderr)
        sys.exit(1)
