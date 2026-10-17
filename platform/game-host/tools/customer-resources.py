#!/usr/bin/python3 -I
"""Root-owned scope placement only. No executable, shell, path or unit property
is accepted from the caller. Never changes the shared hosting service's limits.
These first five engine defaults are used only by older control planes. Explicit
allocations have fixed bounds; neither is a measured baseline or full isolation.
"""
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys
import time

PROFILES = {
    'teeworlds': (1, 1024 ** 3, 128),
    'bzflag': (1, 1024 ** 3, 128),
    'hedgewars': (1, 1024 ** 3, 128),
    'openttd': (1, 1024 ** 3, 128),
    'luanti': (2, 2 * 1024 ** 3, 128),
    'openarena': (1, 1024 ** 3, 128),
    'battle-for-wesnoth': (1, 1024 ** 3, 128),
    'supertuxkart': (1, 1024 ** 3, 128),
    '0-ad': (2, 2 * 1024 ** 3, 128),
    'ysoccer': (1, 1024 ** 3, 128),
    'flightgear': (1, 1024 ** 3, 128),
    'mindustry': (1, 1024 ** 3, 128),
    'hurry-curry': (1, 1024 ** 3, 128),
    'assaultcube': (1, 1024 ** 3, 128),
    'xonotic': (1, 1024 ** 3, 128),
    'wolfenstein-enemy-territory': (1, 1024 ** 3, 128),
    'medal-of-honor-allied-assault': (1, 1024 ** 3, 128),
    'freedoom': (1, 1024 ** 3, 128),
    'freeciv': (1, 1024 ** 3, 128),
    'warzone-2100': (1, 1024 ** 3, 128),
    'hypersomnia': (1, 1024 ** 3, 128),
    'terraria': (1, 1024 ** 3, 128),
    'factorio': (1, 1024 ** 3, 128),
    'unvanquished': (1, 1024 ** 3, 128),
    'openra': (1, 1024 ** 3, 128),
    'openhv': (1, 1024 ** 3, 128),
    'earth-2140-trilogy': (1, 1024 ** 3, 128),
    'rimworld-together': (1, 1024 ** 3, 128),
    'space-station-14': (1, 1024 ** 3, 128),
    'triplea': (1, 1024 ** 3, 128),
    'necesse': (1, 1024 ** 3, 128),
    'veloren': (1, 1024 ** 3, 128),
    'barotrauma': (1, 1024 ** 3, 128),
    'morrowind': (1, 1024 ** 3, 128),
    'bombsquad': (1, 1024 ** 3, 128),
    'counter-strike-source': (1, 1024 ** 3, 128),
    'open-fortress': (1, 1024 ** 3, 128),
    'battlefield-1942-anthology': (1, 1024 ** 3, 128),
    'unturned': (1, 1024 ** 3, 128),
    'trackmania': (1, 1024 ** 3, 128),
    'team-fortress-2': (1, 1024 ** 3, 128),
    'counter-strike-2': (2, 3*1024 ** 3, 128),
    'dont-starve-together': (1, 1024 ** 3, 128),
    'core-keeper': (1, 2 * 1024 ** 3, 128),
    're-volt-rvgl': (1, 1024 ** 3, 128),
}


def request(arguments):
    if len(arguments) not in (5, 7) or arguments[0] != 'attach':
        raise ValueError('Expected a customer resource placement')
    _, server_id, game, raw_pid, identity = arguments[:5]
    if not re.fullmatch(r'[a-f0-9]{24}', server_id, re.I) or game not in PROFILES or not re.fullmatch(r'[1-9][0-9]{0,9}', raw_pid):
        raise ValueError('Invalid customer resource identity')
    if int(raw_pid) <= 1 or not re.fullmatch(r'[a-f0-9-]{36}:[0-9]+', identity):
        raise ValueError('Invalid process identity')
    limits = None
    if len(arguments) == 7:
        if not all(re.fullmatch(r'[1-9][0-9]{0,4}', value) for value in arguments[5:]):
            raise ValueError('Invalid resource allocation')
        limits = tuple(map(int, arguments[5:]))
        allocation(game, limits)
    return server_id.lower(), game, int(raw_pid), identity, limits


def allocation(game, limits=None):
    if limits is None:
        return PROFILES[game]
    cpu_millis, memory_mib = limits
    if not 250 <= cpu_millis <= 6000 or not 256 <= memory_mib <= 8192:
        raise ValueError('Resource allocation exceeds rollout bounds')
    return cpu_millis / 1000, memory_mib * 1024 ** 2, 128


def verify_process(pid, identity, uid):
    root = Path('/proc') / str(pid)
    info = (root / 'stat').read_text()
    fields = info[info.rfind(')') + 2:].split()
    actual = Path('/proc/sys/kernel/random/boot_id').read_text().strip() + ':' + fields[19]
    if actual != identity or fields[0] in ('Z', 'X'):
        raise ValueError('Process identity no longer matches')
    status = (root / 'status').read_text()
    ids = re.search(r'^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)', status, re.M)
    if not ids or any(int(value) != uid for value in ids.groups()):
        raise ValueError('Only unprivileged hosting processes may be placed')


def verify_caller(pid, uid):
    if 'SUDO_UID' not in os.environ:
        return  # A root operator may run isolated acceptance fixtures directly.
    if os.environ['SUDO_UID'] != str(uid):
        raise ValueError('Only the hosting service may request placement')
    parent = os.getppid()
    for _ in range(8):
        if parent == pid:
            return
        if parent <= 1:
            break
        text = (Path('/proc') / str(parent) / 'stat').read_text()
        parent = int(text[text.rfind(')') + 2:].split()[1])
    raise ValueError('Only the requesting runtime may enter a resource scope')


def scope_command(server_id, game, pid, limits=None):
    cores, memory, tasks = allocation(game, limits)
    scope = f'playbound-customer-{server_id}-{pid}.scope'
    properties = [
        ('Description', 's', ['PlayBound customer runtime ' + server_id]),
        ('PIDs', 'au', ['1', str(pid)]),
        ('CPUAccounting', 'b', ['true']), ('MemoryAccounting', 'b', ['true']),
        ('TasksAccounting', 'b', ['true']),
        ('CPUQuotaPerSecUSec', 't', [str(round(cores * 1000000))]),
        ('MemoryMax', 't', [str(memory)]), ('MemorySwapMax', 't', ['0']),
        ('TasksMax', 't', [str(tasks)]),
        ('CollectMode', 's', ['inactive-or-failed']),
    ]
    command = ['/usr/bin/busctl', '--system', '--timeout=5', 'call', 'org.freedesktop.systemd1',
               '/org/freedesktop/systemd1', 'org.freedesktop.systemd1.Manager', 'StartTransientUnit',
               'ssa(sv)a(sa(sv))', scope, 'fail', str(len(properties))]
    for name, kind, values in properties:
        command.extend([name, kind, *values])
    command.append('0')
    return scope, command


def attach(server_id, game, pid, identity, limits=None):
    account = pwd.getpwnam('playbound')
    verify_caller(pid, account.pw_uid)
    verify_process(pid, identity, account.pw_uid)
    # The unit name, profile and properties are fixed here. Existing units fail
    # rather than being replaced or having their limits relaxed.
    scope, command = scope_command(server_id, game, pid, limits)
    subprocess.run(command, check=True, capture_output=True, timeout=6)
    expected = '/system.slice/' + scope
    deadline = time.monotonic() + 1.5
    while True:
        verify_caller(pid, account.pw_uid)
        verify_process(pid, identity, account.pw_uid)
        if (Path('/proc') / str(pid) / 'cgroup').read_text().strip() == '0::' + expected:
            break
        if time.monotonic() >= deadline:
            raise ValueError('Resource scope placement was not confirmed')
        time.sleep(0.02)
    directory = Path('/sys/fs/cgroup') / expected.lstrip('/')
    # systemd 255 does not expose memory.oom.group as a transient scope
    # property. Set this one fixed cgroup control after identity/path checks.
    (directory / 'memory.oom.group').write_text('1')
    cores, memory, tasks = allocation(game, limits)
    cpu = (directory / 'cpu.max').read_text().split()
    if cpu[0] == 'max' or int(cpu[0]) > cores * int(cpu[1]) or (directory / 'memory.max').read_text().strip() != str(memory) or (directory / 'memory.swap.max').read_text().strip() != '0' or (directory / 'pids.max').read_text().strip() != str(tasks) or (directory / 'memory.oom.group').read_text().strip() != '1':
        raise ValueError('Resource scope limits were not confirmed')
    return {'attached': True, 'scope': scope, 'cpuCores': cores, 'ramBytes': memory, 'maxTasks': tasks, 'swapBytes': 0}


if __name__ == '__main__':
    try:
        if os.geteuid() != 0:
            raise ValueError('Customer resource helper requires its scoped sudo rule')
        print(json.dumps(attach(*request(sys.argv[1:]))))
    except Exception:
        # No raw subprocess stderr, argv or filesystem contents cross this API.
        print(json.dumps({'error': 'Customer resource placement was not confirmed'}))
        sys.exit(1)
