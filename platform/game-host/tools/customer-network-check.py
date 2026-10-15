#!/usr/bin/python3 -I
"""Manual network-policy preflight. No existing unit/firewall is modified.

This is evidence for a future opt-in profile, not activation of that profile.
There is intentionally no agent sudo permission or periodic sampler.
"""
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys

# Candidate policy: private/loopback/link-local/metadata/multicast destinations.
# Per-port restrictions and game query/RCON delivery require separate work.
DENY = (
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.168.0.0/16',
    '198.18.0.0/15', '224.0.0.0/4', '240.0.0.0/4',
    '::/128', '::1/128', '::ffff:0:0/96', 'fc00::/7', 'fe80::/10', 'ff00::/8',
)
PUBLIC = ('1.1.1.1', 443)


def connected(host, port, family=socket.AF_INET):
    with socket.socket(family, socket.SOCK_STREAM) as client:
        client.settimeout(2)
        try:
            client.connect((host, port))
            return True
        except OSError:
            return False


def child(port4, port6):
    # Test as an unprivileged UID inside the actual scope; no PAM service can
    # move this probe into a different cgroup after policy placement.
    if os.geteuid() != 0:
        raise ValueError('Probe child must enter from its root scope')
    scope = Path('/proc/self/cgroup').read_text().strip()
    if not scope.startswith('0::/system.slice/playbound-network-check-') or not scope.endswith('.scope'):
        raise ValueError('Probe child was not scoped')
    os.setgroups([])
    os.setgid(65534)
    os.setuid(65534)
    return {
        'loopback4Blocked': not connected('127.0.0.1', port4),
        'loopback6Blocked': not connected('::1', port6, socket.AF_INET6),
        'public4Connected': connected(*PUBLIC),
        'unprivileged': os.getuid() == 65534 and os.getgid() == 65534,
    }


def probe():
    if sys.platform != 'linux' or os.getuid() != 0 or os.geteuid() != 0 or os.environ.get('SUDO_USER'):
        raise ValueError('Direct Linux root operator required')
    executable = Path(__file__).resolve(strict=True)
    if executable != Path('/usr/local/libexec/playbound-customer-network-check'):
        raise ValueError('Install the fixed operator helper before probing')
    for directory in [Path('/'), Path('/usr'), Path('/usr/local'), executable.parent]:
        parent = directory.lstat()
        if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or parent.st_mode & 0o022:
            raise ValueError('Untrusted network probe parent')
    info = executable.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
        raise ValueError('Network probe must be a trusted root-owned file')
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as ipv4, socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as ipv6:
        ipv4.bind(('127.0.0.1', 0))
        ipv6.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        ipv6.bind(('::1', 0))
        ipv4.listen(4)
        ipv6.listen(4)
        port4, port6 = ipv4.getsockname()[1], ipv6.getsockname()[1]
        # A rejected connection proves nothing without a reachable control.
        if not connected('127.0.0.1', port4) or not connected('::1', port6, socket.AF_INET6) or not connected(*PUBLIC):
            raise ValueError('Unrestricted control connectivity failed')
        unit = 'playbound-network-check-' + str(os.getpid()) + '.scope'
        command = ['/usr/bin/systemd-run', '--scope', '--quiet', '--collect', '--unit=' + unit,
                   '--property=IPAddressDeny=' + ' '.join(DENY),
                   '/usr/bin/python3', '-I', str(executable), '--child', str(port4), str(port6)]
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=15,
                                env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'}, cwd='/')
        checks = json.loads(result.stdout)
        if checks != {'loopback4Blocked': True, 'loopback6Blocked': True, 'public4Connected': True, 'unprivileged': True}:
            raise ValueError('Kernel network policy was not enforced')
        return {'preflightPassed': True, **checks, 'gamePolicyEnabled': False,
                'existingUnitsChanged': False, 'privateCidrCoverage': 'configured; only loopback controls exercised',
                'publicIpv6JoinVerified': False, 'gameQueryTransportVerified': False}


if __name__ == '__main__':
    try:
        if len(sys.argv) == 4 and sys.argv[1] == '--child' and all(value.isdecimal() and 1 <= int(value) <= 65535 for value in sys.argv[2:]):
            print(json.dumps(child(int(sys.argv[2]), int(sys.argv[3]))))
        elif sys.argv[1:] == ['probe']:
            print(json.dumps(probe()))
        else:
            raise ValueError('Expected probe')
    except Exception:
        print(json.dumps({'preflightPassed': False, 'gamePolicyEnabled': False}), file=sys.stderr)
        sys.exit(1)
