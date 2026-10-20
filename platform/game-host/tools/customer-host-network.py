"""Root-only, per-UID host-service guard. Not a general firewall API.

This supplements private-network cgroup filters; it does not replace them.
No production enrollment is performed by importing or installing this module.
"""
import json
import ipaddress
import os
import subprocess

ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'}
PRIVATE4 = ('0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8',
            '169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.168.0.0/16',
            '198.18.0.0/15','224.0.0.0/4','240.0.0.0/4')
PRIVATE6 = ('::/128','::1/128','::ffff:0:0/96','fc00::/7','fe80::/10','ff00::/8')


def table_name(uid, probe=False):
    if type(uid) is not int or not 40000 <= uid <= 40255 or type(probe) is not bool:
        raise ValueError('Invalid reserved customer network identity')
    return ('pb_customer_probe_' if probe else 'pb_customer_guard_') + str(uid)


def policy(uid, probe=False, self_udp_port=None):
    table = table_name(uid, probe)
    if self_udp_port is not None and (type(self_udp_port) is not int or not 1024 <= self_udp_port <= 65535):
        raise ValueError('Invalid self-addressed UDP allocation')
    # TES3MP/RakNet self-tests by sending to its own bound UDP port. Only that
    # exact allocated port may reach a local address; everything else stays dropped.
    exception = '' if self_udp_port is None else f'  meta skuid {uid} udp dport {self_udp_port} fib daddr type local counter accept comment "pb-self-udp-v1"\n'
    return ('table inet ' + table + ' {\n'
            ' chain output {\n'
            '  type filter hook output priority 50; policy accept;\n'
            f'  meta skuid {uid} ct direction reply counter return comment "pb-replies-v1"\n'
            + exception +
            f'  meta skuid {uid} fib daddr type local counter drop comment "pb-host-v1"\n'
            f'  meta skuid {uid} ip daddr {{ ' + ', '.join(PRIVATE4) + ' } counter drop comment "pb-private4-v1"\n'
            f'  meta skuid {uid} ip6 daddr {{ ' + ', '.join(PRIVATE6) + ' } counter drop comment "pb-private6-v1"\n'
            ' }\n}\n')


def execute(args, text=None):
    if os.geteuid() != 0:
        raise ValueError('Root network supervisor required')
    return subprocess.run(['/usr/sbin/nft', *args], input=text, text=True,
                          capture_output=True, check=True, timeout=8, env=ENV, cwd='/').stdout


def verify_document(document, uid, probe=False):
    table = table_name(uid, probe)
    raw = document.get('nftables',[])
    if any(not isinstance(row,dict) or len(row) != 1 for row in raw): raise ValueError('Unknown network table document')
    rows = [row for row in raw if 'metainfo' not in row]
    match = lambda left,right: {'match':{'op':'==','left':left,'right':right}}
    if len(rows) == 7:
        # Reviewed optional rule: own allocated UDP port to a local address, directly after the reply rule.
        rule = rows[3].get('rule',{})
        expr = rule.get('expr',[])
        if set(rule) != {'family','table','chain','handle','comment','expr'} or rule['family'] != 'inet' or rule['table'] != table or rule['chain'] != 'output' or rule['comment'] != 'pb-self-udp-v1' or len(expr) != 5:
            raise ValueError('Self-addressed UDP rule changed')
        port = expr[1].get('match',{}).get('right') if isinstance(expr[1],dict) else None
        if type(port) is not int or not 1024 <= port <= 65535 or expr[0] != match({'meta':{'key':'skuid'}},uid) or \
           expr[1] != match({'payload':{'protocol':'udp','field':'dport'}},port) or \
           expr[2] != match({'fib':{'result':'type','flags':['daddr']}},'local') or \
           set(expr[3]) != {'counter'} or set(expr[3]['counter']) != {'packets','bytes'} or expr[4] != {'accept':None}:
            raise ValueError('Self-addressed UDP selector changed')
        rows = rows[:3] + rows[4:]
    if len(rows) != 6 or set(rows[0].get('table',{})) != {'family','name','handle'} or rows[0]['table']['family'] != 'inet' or rows[0]['table']['name'] != table:
        raise ValueError('Customer network table changed')
    chain = rows[1].get('chain',{})
    expected = {'family':'inet','table':table,'name':'output','type':'filter','hook':'output','prio':50,'policy':'accept'}
    if {key:value for key,value in chain.items() if key != 'handle'} != expected:
        raise ValueError('Customer network chain changed')
    match = lambda left,right: {'match':{'op':'==','left':left,'right':right}}
    for position, comment in enumerate(['pb-replies-v1','pb-host-v1','pb-private4-v1','pb-private6-v1']):
        rule = rows[position+2].get('rule',{})
        if set(rule) != {'family','table','chain','handle','comment','expr'} or rule['family'] != 'inet' or rule['table'] != table or rule['chain'] != 'output' or rule['comment'] != comment:
            raise ValueError('Customer network rule changed')
        expr = rule['expr']
        verdict = {'return':None} if position == 0 else {'drop':None}
        if len(expr) != 4 or expr[0] != match({'meta':{'key':'skuid'}},uid) or expr[-1] != verdict or set(expr[2]) != {'counter'} or set(expr[2]['counter']) != {'packets','bytes'}:
            raise ValueError('Customer network selector changed')
        if any(type(value) is not int or value < 0 for value in expr[2]['counter'].values()):
            raise ValueError('Invalid customer network counter')
        if position == 0:
            if expr[1] != match({'ct':{'key':'direction'}},'reply'): raise ValueError('Reply guard changed')
        elif position == 1:
            if expr[1] != match({'fib':{'result':'type','flags':['daddr']}},'local'): raise ValueError('Host destination guard changed')
        else:
            network = expr[1].get('match',{})
            protocol = 'ip' if position == 2 else 'ip6'
            if set(network) != {'op','left','right'} or network['op'] != '==' or network['left'] != {'payload':{'protocol':protocol,'field':'daddr'}} or set(network['right']) != {'set'}:
                raise ValueError('Private destination guard changed')
            actual=[]
            for member in network['right']['set']:
                if set(member) != {'prefix'} or set(member['prefix']) != {'addr','len'}: raise ValueError('Unknown private network expression')
                value=member['prefix'];actual.append(ipaddress.ip_network(str(value['addr'])+'/'+str(value['len'])))
            normalized=lambda values: sorted(str(value) for value in ipaddress.collapse_addresses(values))
            if normalized(actual) != normalized(map(ipaddress.ip_network, PRIVATE4 if position == 2 else PRIVATE6)):
                raise ValueError('Private destination ranges changed')
    return True


def verify(uid, probe=False):
    result = execute(['--json','list','table','inet',table_name(uid,probe)])
    if len(result) > 32768: raise ValueError('Customer network guard exceeds limit')
    return verify_document(json.loads(result), uid, probe)


def self_udp_port(uid, probe=False):
    document = json.loads(execute(['--json','list','table','inet',table_name(uid,probe)]))
    verify_document(document, uid, probe)
    for row in document['nftables']:
        rule = row.get('rule',{})
        if rule.get('comment') == 'pb-self-udp-v1': return rule['expr'][1]['match']['right']
    return None


def install(uid, probe=False, self_udp=None):
    # Reattach only to the exact kernel rule structure; never replace or flush
    # an unknown table, chain, destination range or verdict.
    table = table_name(uid, probe)
    tables = json.loads(execute(['--json','list','tables']))
    if any(row.get('table',{}).get('name') == table for row in tables.get('nftables',[])):
        if self_udp_port(uid,probe) != self_udp:
            raise ValueError('Existing customer network guard differs from the reviewed self-addressed UDP allocation')
        verify(uid,probe)
        return {'uid':uid,'table':table,'guardInstalled':True,'reattached':True}
    text = policy(uid, probe, self_udp)
    execute(['--check','--file','-'], text)
    execute(['--file','-'], text)
    verify(uid,probe)
    return {'uid': uid, 'table': table, 'guardInstalled': True}


def remove(uid, probe=False):
    verify(uid,probe)
    execute(['delete','table','inet',table_name(uid,probe)])


def remove_if_present(uid, probe=False):
    table = table_name(uid,probe)
    document = json.loads(execute(['--json','list','tables']))
    if not any(row.get('table',{}).get('family') == 'inet' and row.get('table',{}).get('name') == table for row in document.get('nftables',[])):
        return False
    remove(uid,probe)
    return True
