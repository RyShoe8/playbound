#!/usr/bin/python3 -I
"""Root-only, offline Teeworlds migration preparation. Never activates data.

The agent has no sudo permission for this tool. Sources and destinations are
derived from a server ID; no caller-selected path or executable is accepted.
"""
import hashlib
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import tempfile

SOURCE = Path('/var/lib/playbound-host/customer-sandboxes')
ROOT = Path('/var/lib/playbound-customer-runtime')
MAX_ENTRIES = 8192
MAX_BYTES = 2 * 1024 ** 3
MAX_FILE_BYTES = 256 * 1024 ** 2
MAX_DEPTH = 16


def arguments(args):
    if len(args) != 2 or args[0] not in ('prepare', 'verify') or not re.fullmatch(r'[a-f0-9]{24}', args[1]):
        raise ValueError('Expected prepare|verify and a lowercase server ID')
    return args


def open_directory(path):
    """Walk from / with directory FDs: no intermediate symlinks are followed."""
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('Invalid fixed directory')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def check_directory(fd, uid):
    info = os.fstat(fd)
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o022:
        raise ValueError('Unsafe data directory')


def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def walk(source_fd, owner, destination=None, depth=0, prefix='', budget=None):
    """Copy/hash only regular, single-link, owned files through pinned FDs."""
    if budget is None:
        budget = [0, 0]
    if depth > MAX_DEPTH:
        raise ValueError('Data tree is too deep')
    check_directory(source_fd, owner)
    initial = os.fstat(source_fd)
    names = sorted(os.listdir(source_fd))
    entries = []
    for name in names:
        budget[0] += 1
        if budget[0] > MAX_ENTRIES or len(name.encode('utf-8')) > 255:
            raise ValueError('Too many data entries')
        relative = prefix + name
        info = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
        if info.st_uid != owner or info.st_mode & 0o022:
            raise ValueError('Unsafe data ownership or permissions')
        if stat.S_ISDIR(info.st_mode):
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=source_fd)
            try:
                if fingerprint(info) != fingerprint(os.fstat(fd)):
                    raise ValueError('Data directory changed')
                target = destination / name if destination is not None else None
                if target is not None:
                    target.mkdir(mode=0o700)
                entries.append({'path': relative, 'type': 'directory'})
                entries.extend(walk(fd, owner, target, depth + 1, relative + '/', budget))
                if target is not None:
                    sync_directory(target)
            finally:
                os.close(fd)
        elif stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= MAX_FILE_BYTES:
            budget[1] += info.st_size
            if budget[1] > MAX_BYTES:
                raise ValueError('Data exceeds migration size limit')
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=source_fd)
            try:
                opened = os.fstat(fd)
                if not stat.S_ISREG(opened.st_mode) or opened.st_nlink != 1 or fingerprint(info) != fingerprint(opened):
                    raise ValueError('Data file changed')
                digest = hashlib.sha256()
                count = 0
                output = None
                try:
                    if destination is not None:
                        output = (destination / name).open('xb')
                        os.fchmod(output.fileno(), 0o600)
                    while True:
                        chunk = os.read(fd, 1024 * 1024)
                        if not chunk:
                            break
                        count += len(chunk)
                        if count > info.st_size:
                            raise ValueError('Data file grew during copy')
                        digest.update(chunk)
                        if output is not None:
                            output.write(chunk)
                    if count != info.st_size or fingerprint(info) != fingerprint(os.fstat(fd)):
                        raise ValueError('Data file changed during copy')
                    if output is not None:
                        output.flush()
                        os.fsync(output.fileno())
                finally:
                    if output is not None:
                        output.close()
                entries.append({'path': relative, 'type': 'file', 'bytes': count, 'sha256': digest.hexdigest()})
            finally:
                os.close(fd)
        else:
            raise ValueError('Links, special files and oversized files cannot migrate')
    if names != sorted(os.listdir(source_fd)) or fingerprint(initial) != fingerprint(os.fstat(source_fd)):
        raise ValueError('Data directory changed during copy')
    return entries


def sync_directory(path):
    fd = open_directory(path)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def quiescent(uid):
    # Deliberately offline: stop the agent and all processes sharing its legacy
    # UID first. No attempt to infer emptiness from a query or stale registry.
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            lines = (entry / 'status').read_text().splitlines()
            ids = next(line for line in lines if line.startswith('Uid:')).split()[1:]
            if str(uid) in ids:
                raise ValueError('Legacy service processes must all be stopped')
        except FileNotFoundError:
            pass


def manifest_read(snapshot, server_id):
    fd = open_directory(snapshot)
    try:
        check_directory(fd, 0)
        file_fd = os.open('manifest.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(file_fd) as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 8 * 1024 ** 2:
                raise ValueError('Unsafe migration manifest')
            value = json.load(handle)
    finally:
        os.close(fd)
    if value.get('version') != 1 or value.get('serverId') != server_id or value.get('profile') != 'teeworlds-unix-v1':
        raise ValueError('Migration identity mismatch')
    return value


def prepare(server_id, owner):
    """Write a private checkpoint only; existing runtime/data paths stay intact."""
    source_fd = open_directory(SOURCE / ('pb-' + server_id))
    try:
        quiescent(owner)
        check_directory(source_fd, owner)
        # This trusted runtime helper creates only root-owned traversal/control
        # dirs and an empty UID home. The checkpoint lives under control/.
        helper = Path('/usr/local/libexec/playbound-customer-runtime')
        info = helper.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
            raise ValueError('Untrusted runtime helper')
        loader = importlib.machinery.SourceFileLoader('pb_runtime', str(helper))
        spec = importlib.util.spec_from_loader('pb_runtime', loader)
        runtime = importlib.util.module_from_spec(spec)
        loader.exec_module(runtime)
        # Do not reserve an account or create/change its live data directory.
        runtime.directory(ROOT)
        runtime.directory(ROOT / server_id)
        control = ROOT / server_id / 'control'
        runtime.directory(control, mode=0o700)
        lock = os.open(control / 'runtime.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            import fcntl
            lock_info = os.fstat(lock)
            if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != 0 or lock_info.st_nlink != 1 or lock_info.st_mode & 0o077:
                raise ValueError('Unsafe runtime lock')
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            snapshot = control / 'legacy-checkpoint-v1'
            if snapshot.exists():
                value = verify(server_id)
                if value['entries'] != walk(source_fd, owner):
                    raise ValueError('Source changed since checkpoint; operator review required')
                return value
            stage = Path(tempfile.mkdtemp(prefix='legacy-incomplete-', dir=control))
            # Failed/interrupted stages are retained for root operator review.
            # Never recursively delete an untrusted source or a live UID home.
            data = stage / 'data'
            data.mkdir(mode=0o700)
            entries = walk(source_fd, owner, data)
            quiescent(owner)
            if entries != walk(source_fd, owner):
                raise ValueError('Source changed during checkpoint')
            value = {'version': 1, 'profile': 'teeworlds-unix-v1', 'serverId': server_id, 'entries': entries}
            with (stage / 'manifest.json').open('x') as handle:
                os.fchmod(handle.fileno(), 0o600)
                json.dump(value, handle, ensure_ascii=True)
                handle.flush()
                os.fsync(handle.fileno())
            sync_directory(data)
            sync_directory(stage)
            os.rename(stage, snapshot)
            sync_directory(control)
            return verify(server_id)
        finally:
            os.close(lock)
    finally:
        os.close(source_fd)


def verify(server_id):
    snapshot = ROOT / server_id / 'control' / 'legacy-checkpoint-v1'
    value = manifest_read(snapshot, server_id)
    fd = open_directory(snapshot / 'data')
    try:
        if value['entries'] != walk(fd, 0):
            raise ValueError('Checkpoint verification failed')
    finally:
        os.close(fd)
    return value


if __name__ == '__main__':
    try:
        if os.getuid() != 0 or os.geteuid() != 0 or os.environ.get('SUDO_USER'):
            raise ValueError('Direct root operator required')
        action, server_id = arguments(sys.argv[1:])
        value = prepare(server_id, pwd.getpwnam('playbound').pw_uid) if action == 'prepare' else verify(server_id)
        print(json.dumps({'serverId': server_id, 'checkpointVerified': True, 'entries': len(value['entries']), 'activated': False}))
    except Exception:
        print('Offline migration checkpoint failed; source and active data unchanged', file=sys.stderr)
        sys.exit(1)
