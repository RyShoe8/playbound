#!/usr/bin/python3 -I
"""Root-owned, ANEURISM-only network supervisor. Never accepts shell commands."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import select
import signal
import socket
import stat
import subprocess
import sys
import time

CONTROL = Path('/var/lib/playbound-aniv-control')
DATA = Path('/var/lib/playbound-host/aneurism-iv-servers')
CREDENTIALS = Path('/var/lib/playbound-host/credentials/aneurism-iv')
BINARY = Path('/opt/playbound-host/games/aneurism-iv/aniv_server.x86_64')
LOG_READ_BYTES = 65536
LOG_RETAIN_BYTES = 8 * 1024 * 1024


def redact_log_line(line):
    line = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', line)
    line = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', line)
    if re.search(r'password|passwd|passphrase|rcon[_ -]?pass|token|gslt|secret|authorization|api[_ -]?key|private[_ -]?key|BEGIN .*KEY', line, re.I):
        return '[credential-bearing line omitted]'
    line = re.sub(r'\b[a-f0-9]{32,}\b', '[redacted]', line, flags=re.I)
    line = re.sub(r'[A-Za-z0-9+/=_-]{64,}', '[redacted]', line)
    return re.sub(r'(?:https?|wss?)://\S+', '[URL omitted]', line, flags=re.I)


def read_logs(server_id):
    # CONTROL is root-owned and mode 0700; no caller supplies a filename.
    filename = CONTROL / ('startup-' + identity(server_id) + '.log')
    try:
        fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return {'available': False, 'lines': [], 'truncated': False}
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != 0 or info.st_mode & 0o077:
            raise ValueError('Unsafe private server log')
        start = max(0, info.st_size - LOG_READ_BYTES)
        os.lseek(fd, start, os.SEEK_SET)
        text = os.read(fd, LOG_READ_BYTES).decode(errors='replace')
        if start:
            text = text.partition('\n')[2]
        text = text.rpartition('\n')[0]
        lines = text.split('\n') if text else []
        return {'available': True, 'lines': [redact_log_line(line) for line in lines[-200:]], 'truncated': bool(start or len(lines) > 200)}
    finally:
        os.close(fd)


def write_bounded_log(log, chunk):
    # This helper owns the only writer. Rollover retains a small tail and resets
    # its own offset; never externally truncate a legacy non-O_APPEND writer.
    size = log.seek(0, os.SEEK_END)
    if size + len(chunk) > LOG_RETAIN_BYTES:
        log.seek(max(0, size - LOG_READ_BYTES))
        tail = log.read(LOG_READ_BYTES)
        tail = tail.partition(b'\n')[2]
        log.seek(0)
        log.truncate(0)
        log.write(tail)
    log.write(chunk)


def retain_stopped_logs():
    # An old live helper writes without O_APPEND. Never change its file offset
    # externally; apply its new bounded writer on the next natural startup.
    active = set()
    for manifest in CONTROL.glob('slot-*.json'):
        saved = json.loads(manifest.read_text())
        if saved.get('identity') and process_identity(saved.get('pid')) == saved['identity']:
            active.add(identity(saved['serverId']))
    trimmed = 0
    for filename in CONTROL.glob('startup-*.log'):
        match = re.fullmatch(r'startup-([a-f0-9]{24})\.log', filename.name)
        if not match or match[1] in active:
            continue
        fd = os.open(filename, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != 0 or info.st_mode & 0o077:
                raise ValueError('Unsafe private server log')
            if info.st_size <= LOG_RETAIN_BYTES:
                continue
            os.lseek(fd, info.st_size - LOG_READ_BYTES, os.SEEK_SET)
            tail = os.read(fd, LOG_READ_BYTES).partition(b'\n')[2]
            os.lseek(fd, 0, os.SEEK_SET)
            os.ftruncate(fd, 0)
            os.write(fd, tail)
            trimmed += 1
        finally:
            os.close(fd)
    return {'trimmed': trimmed}


def identity(value):
    if not re.fullmatch(r'[A-Za-z0-9_-]{6,80}', value):
        raise ValueError('Invalid server identity')
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def placement(slot):
    if not 27700 <= slot <= 27715:
        raise ValueError('Invalid ANEURISM isolation slot')
    offset = (slot - 27700) * 4
    return f'pb-aniv-{slot}', f'avh{slot}', f'avp{slot}', f'172.31.200.{offset+1}', f'172.31.200.{offset+2}'


def settings(raw):
    if not isinstance(raw, dict):
        raise ValueError('Expected server settings')
    name = raw.get('name', 'PlayBound ANEURISM IV')
    slots = raw.get('maxPlayers', 4)
    game_map = raw.get('map', 'aneurismiv')
    if not isinstance(name, str) or not 1 <= len(name) <= 64 or re.search(r'[\x00-\x1f\x7f]', name):
        raise ValueError('Invalid server name')
    # The game's CommunityHostingSettings rejects names resembling a network
    # route, including our usual PlayBound.Club branding. Keep the display
    # words while removing URL/address punctuation from the in-game name.
    name = re.sub(r'\s+', ' ', re.sub(r'[.:/\\]', ' ', name)).strip()
    if not name:
        raise ValueError('Server name must contain display text')
    if type(slots) is not int or not 2 <= slots <= 32:
        raise ValueError('Player limit must be 2–32')
    if game_map not in ('aneurismiv', 'misery'):
        raise ValueError('Unsupported map')
    return {'name': name, 'maxPlayers': slots, 'map': game_map}


def call(*args, check=True):
    return subprocess.run(args, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def process_identity(pid):
    try:
        stat = Path(f'/proc/{pid}/stat').read_text()
        return Path('/proc/sys/kernel/random/boot_id').read_text().strip() + ':' + stat[stat.rfind(')')+2:].split()[19]
    except (OSError, IndexError):
        return None


def emit(payload):
    print(json.dumps(payload), flush=True)


def private_value(file, owner):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != owner or info.st_mode & 0o077 or info.st_size > 256:
            raise ValueError('Steam credentials require private, service-owned regular files')
        content = os.read(fd, 257)
        after = os.fstat(fd)
        if len(content) > 256 or len(content) != info.st_size or (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ValueError('Steam credential file changed while reading')
        try:
            return content.decode('ascii').strip()
        except UnicodeDecodeError:
            raise ValueError('Invalid Steam credential encoding') from None
    finally:
        os.close(fd)


def parse_occupancy(packet):
    if len(packet) < 18 or packet[:5] != b'\xff\xff\xff\xffI':
        return None
    offset = 6
    for _ in range(4):
        end = packet.find(b'\0', offset)
        if end == -1:
            return None
        offset = end + 1
    if offset + 5 > len(packet):
        return None
    total, maximum, bots = packet[offset+2:offset+5]
    if not 2 <= maximum <= 60 or total > maximum or bots > total:
        return None
    return {'players':total-bots, 'maxPlayers':maximum, 'bots':bots}


def query_occupancy(slot, server_id):
    namespace = placement(slot)[0]
    manifest = CONTROL / f'slot-{slot}.json'
    if not manifest.exists():
        return None
    saved = json.loads(manifest.read_text())
    if saved.get('serverId') != server_id or saved.get('namespace') != namespace:
        return None
    if not saved.get('identity') or process_identity(saved.get('pid')) != saved.get('identity'):
        return None
    # Only this fixed server namespace is reachable; callers cannot supply a
    # namespace, query address, port, command or executable.
    fd = os.open('/var/run/netns/' + namespace, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.setns(fd, 0)
    finally:
        os.close(fd)
    request = b'\xff\xff\xff\xffTSource Engine Query\0'
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as query:
        query.settimeout(2.5)
        query.connect(('127.0.0.1', 27016))
        try:
            query.send(request)
            packet = query.recv(65536)
            if len(packet) == 9 and packet[:5] == b'\xff\xff\xff\xffA':
                query.send(request + packet[5:9])
                packet = query.recv(65536)
            return parse_occupancy(packet)
        except (TimeoutError, ConnectionError, OSError):
            return None


def supervise(slot, server_id, config):
    digest = identity(server_id)
    ns, host, peer, gateway, address = placement(slot)
    config = settings(config)
    account = pwd.getpwnam('playbound')
    data = DATA / ('pb-' + digest)
    # Agent preparation owns this path; root never creates files through it.
    if not data.is_dir() or data.resolve() != data or data.stat().st_uid != account.pw_uid:
        raise ValueError('Server data directory must be prepared by the agent')
    token_path = data / 'gslt.txt' if (data / 'gslt.txt').exists() else CREDENTIALS / 'gslt.txt'
    owner_path = data / 'owner-steamid64.txt' if (data / 'owner-steamid64.txt').exists() else CREDENTIALS / 'owner-steamid64.txt'
    token = private_value(token_path, account.pw_uid)
    owner = private_value(owner_path, account.pw_uid)
    if not re.fullmatch(r'[a-fA-F0-9]{32}', token) or not re.fullmatch(r'\d{17}', owner):
        raise ValueError('A valid private Steam token and owner SteamID64 are required')
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    lock = open(CONTROL / ('token-' + token_hash + '.lock'), 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise ValueError('This Steam token is already assigned to a running ANEURISM server') from None
    # A dead supervisor must not authorize reuse while its game is still alive.
    for manifest in CONTROL.glob('slot-*.json'):
        saved = json.loads(manifest.read_text())
        if saved.get('tokenHash') == token_hash and call('ip', 'netns', 'pids', saved['namespace'], check=False).stdout.strip():
            raise ValueError('This Steam token still belongs to an occupied namespace')
    if ns in [line.split()[0] for line in call('ip', 'netns', 'list').stdout.splitlines() if line.strip()]:
        raise ValueError('ANEURISM isolation slot is already occupied')
    if call('ip', 'route', 'show', gateway + '/30').stdout.strip():
        raise ValueError('ANEURISM isolation address range is occupied')
    if Path('/proc/sys/net/ipv4/ip_forward').read_text().strip() != '1':
        raise ValueError('Host IPv4 forwarding must already be enabled')
    route = call('ip', 'route', 'get', '1.1.1.1').stdout.split()
    external = route[route.index('dev')+1]
    if not re.fullmatch(r'[A-Za-z0-9_.-]+', external):
        raise ValueError('Invalid outbound interface')
    rules = [
        ['-t', 'nat', 'POSTROUTING', '-s', address+'/32', '-o', external, '-j', 'MASQUERADE'],
        ['FORWARD', '-i', host, '-o', external, '-s', address+'/32', '-j', 'ACCEPT'],
        ['FORWARD', '-i', external, '-o', host, '-d', address+'/32', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
    ]
    manifest = CONTROL / f'slot-{slot}.json'
    resolv = Path('/etc/netns') / ns
    added, child, created, linked = [], None, False, False
    stopping = False

    def request_stop(_signal, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    log_guard = open(CONTROL / 'log-retention.lock', 'a')
    fcntl.flock(log_guard, fcntl.LOCK_SH)
    try:
        manifest.write_text(json.dumps({'pid':os.getpid(), 'identity':process_identity(os.getpid()), 'serverId':server_id, 'namespace':ns, 'tokenHash':token_hash}))
        if stopping:
            return
        call('ip', 'netns', 'add', ns)
        created = True
        call('ip', 'link', 'add', host, 'type', 'veth', 'peer', 'name', peer)
        linked = True
        call('ip', 'link', 'set', peer, 'netns', ns)
        call('ip', 'addr', 'add', gateway+'/30', 'dev', host)
        call('ip', 'link', 'set', host, 'up')
        for args in [('link','set','lo','up'), ('addr','add',address+'/30','dev',peer), ('link','set',peer,'up'), ('route','add','default','via',gateway)]:
            call('ip', '-n', ns, *args)
        resolv.mkdir(parents=True, exist_ok=False)
        (resolv/'resolv.conf').write_text('nameserver 1.1.1.1\nnameserver 8.8.8.8\n')
        for rule in rules:
            prefix, rest = (rule[:2], rule[2:]) if rule[0] == '-t' else ([], rule)
            call('iptables', *prefix, '-I', *rest)
            added.append(rule)
        env = {'PATH':'/usr/bin:/bin', 'HOME':str(data/'home'), 'USER':'playbound', 'LD_LIBRARY_PATH':str(BINARY.parent/'linux64'),
               'ANIV_COMMUNITY_OWNER_STEAM_ID':owner, 'ANIV_SERVER_NAME':config['name'], 'ANIV_MAX_PLAYERS':str(config['maxPlayers']),
               'ANIV_MAP':config['map'], 'ANIV_ROTATION':'persistent-world', 'ANIV_SERVER_PASSWORD':'', 'ANIV_DATA_ROOT':str(data/'data')}
        child = subprocess.Popen(['/usr/sbin/ip','netns','exec',ns,'/usr/bin/setpriv',f'--reuid={account.pw_uid}',f'--regid={account.pw_gid}','--init-groups',str(BINARY),'-batchmode','-nographics','-logFile','-','-gslt',token], cwd=BINARY.parent,
                                 env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        state = {'ready':False, 'steamServerId':None, 'gamePid':child.pid, 'gameIdentity':process_identity(child.pid), 'namespace':ns, 'maxPlayers':config['maxPlayers']}
        authenticated, loaded, started, pending, last = False, False, False, '', 0
        logfd = os.open(CONTROL / ('startup-'+digest+'.log'), os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW, 0o600)
        log_guard.close()
        with os.fdopen(logfd, 'w+b', buffering=0) as log:
            while not stopping and child.poll() is None:
                readable, _, _ = select.select([child.stdout], [], [], 0.25)
                if readable:
                    chunk = os.read(child.stdout.fileno(), 65536)
                    write_bounded_log(log, chunk)
                    pending += chunk.decode(errors='replace')
                    lines = pending.split('\n')
                    pending = lines.pop()[-65536:]
                    for line in lines:
                        match = re.search(r'Steam GameServer authenticated\. Steam ID:\s*(\d{17})', line)
                        if match:
                            state['steamServerId'] = match[1]
                            authenticated = True
                        if re.search(r'Steam server disconnected|Steam GameServer.*authentication failed', line, re.I):
                            authenticated = False
                            state['steamServerId'] = None
                        loaded |= f'Map {config["map"]} has been loaded successfully.' in line
                        started |= 'Server started.' in line
                state['ready'] = authenticated and loaded and started
                if time.monotonic()-last >= 2:
                    emit(state)
                    last = time.monotonic()
            if not stopping:
                emit({'ready':False, 'error':f'ANEURISM process exited (code {child.poll()})'})
    finally:
        log_guard.close()
        if child and child.poll() is None:
            os.killpg(child.pid, signal.SIGINT)
            try:
                child.wait(timeout=120)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        for rule in reversed(added):
            prefix, rest = (rule[:2], rule[2:]) if rule[0] == '-t' else ([], rule)
            call('iptables', *prefix, '-D', *rest, check=False)
        if linked:
            call('ip', 'link', 'del', host, check=False)
        if created:
            call('ip', 'netns', 'del', ns, check=False)
        if resolv.exists():
            (resolv/'resolv.conf').unlink(missing_ok=True)
            resolv.rmdir()
        manifest.unlink(missing_ok=True)
        lock.close()


def main():
    if os.geteuid() != 0:
        raise ValueError('ANEURISM network helper must run through its scoped sudo rule')
    CONTROL.mkdir(mode=0o700, exist_ok=True)
    if CONTROL.stat().st_uid != 0 or CONTROL.is_symlink():
        raise ValueError('Invalid control directory ownership')
    os.chmod(CONTROL, 0o700)
    if len(sys.argv) != 4 or sys.argv[1] not in ('run', 'stop', 'query', 'logs', 'retain-logs'):
        raise ValueError('Expected run|stop|query|logs|retain-logs, isolation slot, server identity')
    action, slot, server_id = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    identity(server_id)
    placement(slot)
    if action == 'retain-logs':
        # Serialize with starts and other maintenance. Supervisors hold this
        # lock only for setup; do not hold it over the lifetime of a game.
        with open(CONTROL / 'log-retention.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            emit(retain_stopped_logs())
        return
    if action == 'logs':
        emit(read_logs(server_id))
        return
    if action == 'query':
        emit(query_occupancy(slot, server_id))
        return
    # Serialize setup/stop for each slot without waiting indefinitely on callers.
    if action == 'stop':
        manifest = CONTROL / f'slot-{slot}.json'
        if manifest.exists():
            saved = json.loads(manifest.read_text())
            if saved['serverId'] != server_id:
                raise ValueError('Isolation slot belongs to another server')
            if process_identity(saved['pid']) == saved['identity']:
                os.kill(saved['pid'], signal.SIGTERM)
        return
    with open(CONTROL / f'slot-{slot}.lock', 'a') as slot_lock:
        try:
            fcntl.flock(slot_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('ANEURISM isolation slot is already occupied') from None
        line = sys.stdin.readline(4097)
        if len(line) > 4096:
            raise ValueError('Server settings are too large')
        supervise(slot, server_id, json.loads(line))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, FileNotFoundError) as error:
        emit({'ready':False, 'error':str(error) if isinstance(error, ValueError) else 'Required ANEURISM host file is missing'})
        sys.exit(1)
    except Exception:
        # Never echo subprocess arguments: the native startup argv contains GSLT.
        emit({'ready':False, 'error':'ANEURISM network supervisor failed; inspect the private host log'})
        sys.exit(1)
