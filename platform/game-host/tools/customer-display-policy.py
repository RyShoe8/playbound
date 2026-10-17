#!/usr/bin/python3 -I
"""Render-only candidate Unix IPC policy. Never loads or changes host policy.

This is an additional boundary for future display/Wine runtimes, not permission
to relax their syscall filters or enroll a customer. Peer-label enforcement must
pass actual kernel acceptance first. Existing runtimes do not call this module.
"""
from pathlib import Path
import re
import sys

UID_FIRST = 40000
UID_LAST = 40255


def profile_name(uid):
    if type(uid) is not int or not UID_FIRST <= uid <= UID_LAST:
        raise ValueError('Reserved customer UID required')
    return 'playbound-customer-ipc-'+str(uid)


def display_number(uid):
    profile_name(uid)
    return 1000+uid-UID_FIRST


def render(uid):
    name = profile_name(uid)
    display = display_number(uid)
    # File and mount permissions cover trusted bubblewrap construction. Its
    # existing readonly mounts, UID/cgroup/egress fences and syscall restrictions
    # remain mandatory after construction. No profile transition is granted.
    return '''abi <abi/4.0>,
profile '''+name+''' flags=(attach_disconnected,mediate_deleted) {
  / r,
  /** r,
  /bindfile?????? rw,
  /newroot/ rw,
  /newroot/** rwklm,
  /usr/** mrix,
  /{bin,lib,lib64}/** mrix,
  /game-data/** mrix,
  /game-data/{GameInfo.txt,GameID.txt} rwk,
  /python/** mrix,
  /server/** rwklm,
  /server/runtime/rvgl.64 ix,
  /tmp/** rwklm,
  /dev/** rw,
  /dev/shm/** rwk,
  owner /proc/** rw,
  /proc/sys/user/max_user_namespaces rw,
  owner /var/lib/playbound-customer-runtime/*/data/** rwklm,
  capability,
  mount,
  umount,
  pivot_root,
  userns,
  network inet,
  network inet6,
  network netlink raw,
  unix (create,getattr,setattr,setopt,getopt,shutdown) type=stream,
  unix (bind,listen) type=stream addr=none,
  unix (bind,listen) type=stream addr="@/tmp/.X11-unix/X'''+str(display)+'''",
  unix (connect,accept,send,receive) type=stream peer=(label='''+name+'''),
  unix (create,getattr,setattr,setopt,getopt,shutdown) type=dgram,
  unix (bind) type=dgram addr="@/tmp/.X11-unix/X'''+str(display)+'''",
  unix (connect,send,receive) type=dgram peer=(label='''+name+'''),
  ptrace (read,readby) peer='''+name+''',
  signal (send,receive) peer='''+name+''',
  signal (receive) peer=unconfined,
}
'''


def verify_enforced(uid):
    """Future handoff precondition; no supplied text can stand in for the kernel."""
    name = profile_name(uid)
    features = Path('/sys/kernel/security/apparmor/features')
    for relative in ('network/af_unix', 'domain/change_profile', 'policy/versions/v8'):
        if (features/relative).read_text().strip() != 'yes':
            raise ValueError('Required AppArmor IPC feature unavailable')
    rows = Path('/sys/kernel/security/apparmor/profiles').read_text().splitlines()
    if rows.count(name+' (enforce)') != 1 or any(row.startswith(name+' ') and row != name+' (enforce)' for row in rows):
        raise ValueError('Exact enforced customer IPC profile required')
    return name


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] != '--render' or not re.fullmatch(r'40[0-9]{3}', sys.argv[2]):
        raise SystemExit('Usage: customer-display-policy.py --render RESERVED_UID')
    # Rendering alone requires no privilege and performs no host mutation.
    print(render(int(sys.argv[2])), end='')
