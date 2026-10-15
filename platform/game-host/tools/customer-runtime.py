#!/usr/bin/python3 -I
"""Fixed Teeworlds identity handoff. No executable, path, environment or signal
is supplied by the caller. The unprivileged gate owns the cgroup first.
"""
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import time

ROOT = Path('/var/lib/playbound-customer-runtime')
LEGACY_ROOT = Path('/var/lib/playbound-host/customer-sandboxes')
ENV = {'PATH': '/usr/bin:/usr/games', 'LANG': 'C.UTF-8'}
PROFILE = 'teeworlds-unix-v1'


def trusted_module(name, filename):
    file = Path('/usr/local/libexec') / filename
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
        raise ValueError('Untrusted runtime dependency')
    loader = importlib.machinery.SourceFileLoader(name, str(file))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def request(args):
    if len(args) == 2 and args[0] == 'migration' and re.fullmatch(r'[a-f0-9]{24}', args[1]):
        return 'migration', args[1], None, None, None
    if len(args) not in (4, 7) or args[0] not in ('run', 'stop', 'status') or not re.fullmatch(r'[a-f0-9]{24}', args[1]) or not re.fullmatch(r'[1-9][0-9]{0,9}', args[2]) or int(args[2]) <= 1 or not re.fullmatch(r'[a-f0-9-]{36}:[0-9]+', args[3]):
        raise ValueError('Invalid runtime identity')
    action, server_id, raw_pid, identity = args[:4]
    if (action == 'run') != (len(args) == 7):
        raise ValueError('Invalid runtime operation')
    extra = None
    if action == 'run':
        if not all(re.fullmatch(r'[1-9][0-9]{0,4}', value) for value in args[4:]):
            raise ValueError('Invalid runtime allocation')
        port, cpu, memory = map(int, args[4:])
        if not 8303 <= port <= 8323 or not 250 <= cpu <= 6000 or not 256 <= memory <= 8192:
            raise ValueError('Unsupported runtime allocation')
        extra = port, cpu, memory
    return action, server_id, int(raw_pid), identity, extra


def config_bytes(text, port):
    if not isinstance(text, str) or len(text.encode('utf-8')) > 16384 or any(char in text for char in '\0\r;'):
        raise ValueError('Invalid Teeworlds configuration')
    values = {}
    numeric = {'sv_port': (port, port), 'sv_register': (0, 0), 'sv_max_clients': (2, 64), 'sv_spectator_slots': (0, 64), 'sv_scorelimit': (0, 100000), 'sv_timelimit': (0, 100000)}
    for line in text.splitlines():
        if not line.strip(): continue
        key, separator, value = line.partition(' ')
        if not separator or key in values or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError('Invalid configuration line')
        if key in numeric:
            lo, hi = numeric[key]
            if not re.fullmatch(r'[0-9]+', value) or not lo <= int(value) <= hi: raise ValueError('Invalid configuration number')
        elif key in ('sv_name', 'sv_motd'):
            if not 1 <= len(value) <= 128 or '"' in value or '\\' in value: raise ValueError('Invalid configuration text')
        elif key == 'sv_map':
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', value): raise ValueError('Invalid map')
        elif key == 'sv_gametype':
            if value not in ('dm', 'tdm', 'ctf'): raise ValueError('Invalid game mode')
        else:
            raise ValueError('Undeclared configuration key')
        values[key] = value
    if values.get('sv_port') != str(port) or values.get('sv_register') != '0' or 'sv_max_clients' not in values:
        raise ValueError('Missing private server configuration')
    return text.encode('utf-8')


def directory(file, uid=0, mode=0o711):
    try:
        file.mkdir(mode=mode)
        os.chown(file, uid, uid)
    except FileExistsError:
        pass
    info = file.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or stat.S_IMODE(info.st_mode) != mode:
        raise ValueError('Unsafe runtime directory')


def workspace(server_id, uid):
    for file in [Path('/'), Path('/var'), Path('/var/lib')]:
        info = file.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('Unsafe runtime ancestor')
    directory(ROOT)
    root = ROOT / server_id
    directory(root)
    directory(root / 'control', mode=0o700)
    directory(root / 'data', uid=uid, mode=0o700)
    return root


def binding_write(root, value):
    temporary = root / 'control' / ('binding-' + str(os.getpid()) + '.tmp')
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as handle:
            json.dump(value, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, root / 'control' / 'current.json')
        directory_fd = os.open(root / 'control', os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        temporary.unlink(missing_ok=True)


def binding_read(server_id, pid, identity):
    # All ancestors must remain root-owned, including the non-writable public
    # traversal directories. No caller path is ever opened.
    for file, mode in [(ROOT, 0o711), (ROOT / server_id, 0o711), (ROOT / server_id / 'control', 0o700)]:
        info = file.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode: raise ValueError('Unsafe runtime binding')
    fd = os.open(ROOT / server_id / 'control' / 'current.json', os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 4096: raise ValueError('Unsafe runtime binding')
        value = json.load(handle)
    if value.get('serverId') != server_id or value.get('gatePid') != pid or value.get('gateIdentity') != identity or value.get('profile') != PROFILE:
        raise ValueError('Runtime binding identity mismatch')
    return value


def scope_path(server_id, pid):
    return Path('/sys/fs/cgroup/system.slice') / f'playbound-customer-{server_id}-{pid}.scope'


def verify_scope(resources, server_id, pid, identity, cpu, memory):
    uid = pwd.getpwnam('playbound').pw_uid
    resources.verify_process(pid, identity, uid)
    scope = scope_path(server_id, pid)
    if (Path('/proc') / str(pid) / 'cgroup').read_text().strip() != '0::/system.slice/' + scope.name: raise ValueError('Gate is not placed')
    quota, period = (scope / 'cpu.max').read_text().split()
    if quota == 'max' or int(quota) * 1000 != cpu * int(period) or (scope / 'memory.max').read_text().strip() != str(memory * 1024 ** 2) or (scope / 'memory.swap.max').read_text().strip() != '0' or (scope / 'pids.max').read_text().strip() != '128' or (scope / 'memory.oom.group').read_text().strip() != '1': raise ValueError('Runtime allocation differs')
    return scope


def command(data, fd, port, memory):
    return ['/usr/bin/prlimit', '--as=' + str(max(1024 ** 3, memory * 2 * 1024 ** 2)), '--nofile=1024', '--core=0', '--', '/usr/bin/bwrap',
            '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-cgroup', '--disable-userns', '--cap-drop', 'ALL', '--die-with-parent',
            '--ro-bind', '/usr', '/usr', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--symlink', 'usr/bin', '/bin',
            '--proc', '/proc', '--dev', '/dev', '--size', '67108864', '--tmpfs', '/tmp', '--bind', str(data), '/server', '--ro-bind-data', str(fd), '/server/server.cfg',
            '--clearenv', '--setenv', 'PATH', '/usr/bin:/usr/games', '--setenv', 'HOME', '/server', '--setenv', 'XDG_DATA_HOME', '/server', '--setenv', 'XDG_CONFIG_HOME', '/server', '--setenv', 'LANG', 'C.UTF-8', '--chdir', '/server',
            '--', '/usr/games/teeworlds-server', '-f', 'server.cfg', 'sv_port ' + str(port)]


def verify_supervisor_scope(scope):
    if Path('/proc/self/cgroup').read_text().strip() != '0::/system.slice/' + scope.name:
        raise ValueError('Supervisor did not inherit the fenced scope')


def stop_runtime(server_id, pid, identity):
    binding_read(server_id, pid, identity)
    try:
        if game_identity(pid) != identity: raise ValueError('Gate PID was reused')
    except FileNotFoundError:
        pass  # The root binding still identifies an orphaned scope.
    scope = scope_path(server_id, pid)
    # A root-owned binding authorizes this exact scope even after the gate exits.
    # The agent cannot create or replace bindings, cgroups or their controls.
    if scope.exists():
        (scope / 'cgroup.kill').write_text('1')
    deadline = time.monotonic() + 2
    while scope.exists():
        try:
            if 'populated 0' in (scope / 'cgroup.events').read_text().splitlines(): break
        except FileNotFoundError:
            break
        if time.monotonic() >= deadline: raise ValueError('Runtime scope did not empty')
        time.sleep(0.02)
    return {'stopped': True}


def game_identity(pid):
    text = (Path('/proc') / str(pid) / 'stat').read_text()
    return Path('/proc/sys/kernel/random/boot_id').read_text().strip() + ':' + text[text.rfind(')') + 2:].split()[19]


def runtime_status(resources, server_id, pid, identity):
    value = binding_read(server_id, pid, identity)
    try:
        resources.verify_process(pid, identity, pwd.getpwnam('playbound').pw_uid)
        resources.verify_process(value['gamePid'], value['gameIdentity'], value['uid'])
        expected = '0::/system.slice/' + scope_path(server_id, pid).name
        if (Path('/proc') / str(value['gamePid']) / 'cgroup').read_text().strip() != expected: raise ValueError('Game scope changed')
        value['running'] = True
    except Exception:
        value['running'] = False
    return value


def migration_ready(server_id, uid, allow_pending=False):
    """Incomplete or rolled-back data transactions must never launch a game."""
    root = ROOT / server_id
    for directory, mode in [(ROOT, 0o711), (root, 0o711), (root / 'control', 0o700)]:
        try:
            info = directory.lstat()
        except FileNotFoundError:
            return False
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode:
            raise ValueError('Unsafe migration parent')
    file = root / 'control' / 'migration.json'
    try:
        fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return False
    with os.fdopen(fd) as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError('Unsafe migration journal')
        value = json.load(handle)
    if not allow_pending and value.get('profileTransition', {}).get('state') == 'pending':
        raise ValueError('Runtime enrollment transition is incomplete')
    data = (root / 'data').lstat()
    if value.get('version') != 1 or value.get('serverId') != server_id or value.get('phase') != 'active' or value.get('uid') != uid or not stat.S_ISDIR(data.st_mode) or data.st_uid != uid or value.get('activationInode') != [data.st_dev, data.st_ino]:
        raise ValueError('Customer migration is not ready')
    source = LEGACY_ROOT / ('pb-' + server_id)
    seal = source.lstat()
    if not stat.S_ISDIR(seal.st_mode) or seal.st_uid != 0 or stat.S_IMODE(seal.st_mode) != 0o700 or value.get('sealedSourceInode') != [seal.st_dev, seal.st_ino]:
        raise ValueError('Legacy migration seal changed')
    return True


def run_runtime(identities, resources, server_id, pid, identity, extra, text):
    port, cpu, memory = extra
    config = config_bytes(text, port)
    resources.verify_caller(pid, pwd.getpwnam('playbound').pw_uid)
    scope = verify_scope(resources, server_id, pid, identity, cpu, memory)
    account = identities.ensure_identity(server_id)
    migration_ready(server_id, account['uid'])
    root = workspace(server_id, account['uid'])
    lock = os.open(root / 'control' / 'runtime.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        identities.secure_stat(os.fstat(lock))
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        migration_ready(server_id, account['uid'])
        fd = os.memfd_create('pb-server-config', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
        child = None
        try:
            os.write(fd, config)
            os.lseek(fd, 0, os.SEEK_SET)
            fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
            verify_scope(resources, server_id, pid, identity, cpu, memory)
            verify_supervisor_scope(scope)
            for binary in ['/usr/bin/prlimit', '/usr/bin/bwrap', '/usr/games/teeworlds-server']:
                info = Path(binary).stat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('Untrusted runtime executable')
            child = subprocess.Popen(command(root / 'data', fd, port, memory), user=account['uid'], group=account['gid'], extra_groups=[], env=ENV, cwd='/', stdin=subprocess.DEVNULL, pass_fds=(fd,))
            binding_write(root, {'profile': PROFILE, 'serverId': server_id, 'gatePid': pid, 'gateIdentity': identity, 'uid': account['uid'], 'gid': account['gid'], 'gamePid': child.pid, 'gameIdentity': game_identity(child.pid)})
            while child.poll() is None:
                try:
                    resources.verify_process(pid, identity, pwd.getpwnam('playbound').pw_uid)
                except Exception:
                    # Kill the complete fenced tree if its unprivileged owner
                    # disappeared, including this supervisor. Never orphan a game.
                    (scope / 'cgroup.kill').write_text('1')
                    raise ValueError('Runtime gate disappeared')
                time.sleep(0.1)
            return child.returncode if child.returncode >= 0 else 1
        finally:
            os.close(fd)
            if child is not None and child.poll() is None:
                (scope / 'cgroup.kill').write_text('1')
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        identities = trusted_module('pb_identities', 'playbound-customer-identities')
        identities.verify_caller()
        action, server_id, pid, identity, extra = request(sys.argv[1:])
        if action == 'run':
            text = sys.stdin.buffer.read(16385)
            if len(text) > 16384: raise ValueError('Configuration exceeds limit')
            resources = trusted_module('pb_resources', 'playbound-customer-resources')
            sys.exit(run_runtime(identities, resources, server_id, pid, identity, extra, text.decode('utf-8')))
        elif action == 'migration':
            account = identities.ensure_identity(server_id)
            print(json.dumps({'serverId': server_id, 'migrationReady': migration_ready(server_id, account['uid'])}))
        elif action == 'stop':
            print(json.dumps(stop_runtime(server_id, pid, identity)))
        else:
            resources = trusted_module('pb_resources', 'playbound-customer-resources')
            print(json.dumps(runtime_status(resources, server_id, pid, identity)))
    except Exception:
        print('Customer identity runtime operation failed', file=sys.stderr)
        sys.exit(1)
