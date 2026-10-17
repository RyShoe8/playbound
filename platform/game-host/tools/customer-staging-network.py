"""Fixed Core Keeper staging egress. Import-only; never an agent operation."""
import os
from pathlib import Path
import re
import subprocess

NAMESPACE = 'pb-staging-corekeeper'
HOST = 'pbstckh'
PEER = 'pbstckn'
ADDRESS = '172.31.201.2'
GATEWAY = '172.31.201.1'
COMMENT = 'pb-staging-corekeeper-egress'
PRIVATE = ('0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
           '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.168.0.0/16',
           '198.18.0.0/15', '224.0.0.0/4', '240.0.0.0/4')


def execute(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=8,
                          env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})


def rules(external):
    if not isinstance(external, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,15}', external):
        raise ValueError('Invalid staging outbound interface')
    rows = [('-t', 'nat', 'POSTROUTING', '-s', ADDRESS+'/32', '-o', external, '-j', 'MASQUERADE'),
            ('INPUT', '-i', HOST, '-j', 'DROP')]
    rows.extend(('FORWARD', '-i', HOST, '-s', ADDRESS+'/32', '-d', destination, '-j', 'DROP') for destination in PRIVATE)
    rows.extend([('FORWARD', '-i', HOST, '-s', ADDRESS+'/32', '-o', external, '-j', 'ACCEPT'),
                 ('FORWARD', '-o', HOST, '-d', ADDRESS+'/32', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'),
                 ('FORWARD', '-o', HOST, '-j', 'DROP')])
    return [list(row[:-2])+['-m', 'comment', '--comment', COMMENT]+list(row[-2:]) for row in rows]


class StagingEgress:
    def __init__(self):
        self.added = []
        self.linked = False

    def change_rule(self, operation, row):
        prefix, rest = (row[:2], row[2:]) if row[0] == '-t' else ([], row)
        execute('/usr/sbin/iptables', '-w', '5', *prefix, operation, *rest)

    def start(self):
        if os.geteuid() != 0 or self.linked or self.added:
            raise ValueError('Fresh root staging network owner required')
        if Path('/proc/sys/net/ipv4/ip_forward').read_text().strip() != '1':
            raise ValueError('IPv4 forwarding must already be enabled')
        if execute('/usr/sbin/ip', '-n', NAMESPACE, 'route', 'show').stdout.strip():
            raise ValueError('Staging namespace already has routes')
        if execute('/usr/sbin/ip', 'route', 'show', GATEWAY+'/30').stdout.strip():
            raise ValueError('Staging address range is occupied')
        route = execute('/usr/sbin/ip', 'route', 'get', '1.1.1.1').stdout.split()
        external = route[route.index('dev')+1]
        entries = rules(external)
        try:
            execute('/usr/sbin/ip', 'link', 'add', HOST, 'type', 'veth', 'peer', 'name', PEER)
            self.linked = True
            execute('/usr/sbin/ip', 'link', 'set', PEER, 'netns', NAMESPACE)
            execute('/usr/sbin/ip', 'addr', 'add', GATEWAY+'/30', 'dev', HOST)
            execute('/usr/sbin/ip', 'link', 'set', HOST, 'up')
            execute('/usr/sbin/ip', '-n', NAMESPACE, 'addr', 'add', ADDRESS+'/30', 'dev', PEER)
            execute('/usr/sbin/ip', '-n', NAMESPACE, 'link', 'set', PEER, 'up')
            execute('/usr/sbin/ip', 'netns', 'exec', NAMESPACE, '/usr/sbin/sysctl', '-qw', 'net.ipv6.conf.all.disable_ipv6=1')
            # Insert in reverse so private destinations precede public egress
            # and established replies precede the unconditional inbound drop.
            for row in reversed(entries):
                self.change_rule('-I', row)
                self.added.append(row)
            execute('/usr/sbin/ip', '-n', NAMESPACE, 'route', 'add', 'default', 'via', GATEWAY)
        except BaseException:
            self.close()
            raise

    def close(self):
        failures = []
        remaining = []
        for row in reversed(self.added):
            try:
                self.change_rule('-D', row)
            except Exception as error:
                failures.append(error)
                remaining.append(row)
        self.added = list(reversed(remaining))
        if self.linked:
            try:
                execute('/usr/sbin/ip', 'link', 'del', HOST)
                self.linked = False
            except Exception as error:
                failures.append(error)
        if failures:
            raise RuntimeError('Staging network cleanup requires attention')
