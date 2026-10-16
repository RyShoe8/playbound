#!/usr/bin/python3 -I
"""Root-only, offline reviewed-native migration with retained originals and progress.

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
import ctypes
import fcntl

SOURCE = Path('/var/lib/playbound-host/customer-sandboxes')
ROOT = Path('/var/lib/playbound-customer-runtime')
STATE = Path('/var/lib/playbound-host/state')
MAX_ENTRIES = 8192
MAX_BYTES = 2 * 1024 ** 3
MAX_FILE_BYTES = 256 * 1024 ** 2
MAX_DEPTH = 16
GAME = 'teeworlds'
PROFILE = 'teeworlds-unix-v1'

def select_game(game):
    global GAME, PROFILE, SOURCE
    folders = {'teeworlds':'customer-sandboxes','bzflag':'bzflag-servers','hedgewars':'hedgewars-servers'}
    if game not in folders: raise ValueError('Unsupported migration game')
    GAME, PROFILE = game, game + '-unix-v1'
    SOURCE = Path('/var/lib/playbound-host') / folders[game]



def arguments(args):
    if len(args) != 2 or args[0] not in ('prepare', 'verify', 'activate', 'rollback', 'recover', 'enroll', 'complete-rollback', 'enable-network', 'disable-network') or not re.fullmatch(r'[a-f0-9]{24}', args[1]):
        raise ValueError('Invalid offline migration operation or server ID')
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
    if value.get('version') != 1 or value.get('serverId') != server_id or value.get('profile') != PROFILE:
        raise ValueError('Migration identity mismatch')
    return value


def prepare(server_id, owner):
    """Write a private checkpoint only; existing runtime/data paths stay intact."""
    source_fd = open_directory(SOURCE / ('pb-' + server_id))
    try:
        quiescent(owner)
        check_directory(source_fd, owner)
        # The checkpoint uses only root-owned traversal/control directories.
        helper = Path('/usr/local/libexec/playbound-customer-runtime')
        info = helper.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
            raise ValueError('Untrusted runtime helper')
        loader = importlib.machinery.SourceFileLoader('pb_runtime', str(helper))
        spec = importlib.util.spec_from_loader('pb_runtime', loader)
        runtime = importlib.util.module_from_spec(spec)
        loader.exec_module(runtime)
        runtime.select_game(GAME)
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
            value = {'version': 1, 'profile': PROFILE, 'serverId': server_id, 'entries': entries}
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


def tree(path, owner, destination=None):
    fd = open_directory(path)
    try:
        return walk(fd, owner, destination)
    finally:
        os.close(fd)


def inode(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISDIR(info.st_mode):
        raise ValueError('Migration location must be an unlinked directory')
    return [info.st_dev, info.st_ino]


def journal_read(control, server_id):
    fd = os.open(control / 'migration.json', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError('Unsafe migration journal')
        value = json.load(handle)
    if value.get('serverId') != server_id or value.get('version') != 1 or value.get('phase') not in ('activating', 'active', 'rolling-back', 'rolled-back'):
        raise ValueError('Migration journal identity mismatch')
    if value.get('gameSlug','teeworlds') != GAME: raise ValueError('Migration journal game mismatch')
    return value


def journal_write(control, value):
    fd, name = tempfile.mkstemp(prefix='journal-incomplete-', dir=control)
    with os.fdopen(fd, 'w') as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(name, control / 'migration.json')
    sync_directory(control)


def exchange(left, right):
    """Linux atomic directory exchange, with pinned no-follow parent FDs."""
    libc = ctypes.CDLL(None, use_errno=True)
    function = libc.renameat2
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    left_fd, right_fd = open_directory(left.parent), open_directory(right.parent)
    try:
        if function(left_fd, os.fsencode(left.name), right_fd, os.fsencode(right.name), 2) != 0:
            raise OSError(ctypes.get_errno(), 'Atomic migration exchange failed')
        os.fsync(left_fd)
        os.fsync(right_fd)
    finally:
        os.close(left_fd)
        os.close(right_fd)


def change_copy_owner(path, owner):
    """Only a just-created copy below root-private control/ is reassigned."""
    fd = open_directory(path)
    try:
        check_directory(fd, 0)
        for name in os.listdir(fd):
            info = os.stat(name, dir_fd=fd, follow_symlinks=False)
            if stat.S_ISDIR(info.st_mode):
                change_copy_owner(path / name, owner)
            elif stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1:
                child = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                try:
                    if fingerprint(info) != fingerprint(os.fstat(child)):
                        raise ValueError('Private migration copy changed')
                    os.fchown(child, owner, owner)
                    os.fsync(child)
                finally:
                    os.close(child)
            else:
                raise ValueError('Unsafe private migration copy')
        os.fchown(fd, owner, owner)
        os.fsync(fd)
    finally:
        os.close(fd)


def finish_transaction(server_id, control, value):
    root = ROOT / server_id
    rollback = value['phase'] in ('rolling-back', 'rolled-back')
    stage = control / ('rollback-copy-v1' if rollback else 'activation-copy-v1')
    target = SOURCE / ('pb-' + server_id) if rollback else root / 'data'
    expected = value['rollbackInode'] if rollback else value['activationInode']
    previous = value['sealedSourceInode'] if rollback else value['previousDataInode']
    if inode(target) != expected:
        if value['phase'] in ('active', 'rolled-back'):
            raise ValueError('Completed migration data identity changed')
        if inode(stage / 'data') != expected or inode(target) != previous:
            raise ValueError('Ambiguous migration requires operator review')
        # Resume only if the original source still matches its checkpoint. A
        # legacy process started after interruption may have written more saves.
        if not rollback and tree(SOURCE / ('pb-' + server_id), value['legacyUid']) != verify(server_id)['entries']:
            raise ValueError('Legacy progress changed during interrupted migration')
        if not rollback and previous is not None:
            entries = tree(target, value['uid'])
            if any(entry['path'] != 'server.cfg' or entry['type'] != 'file' or entry['bytes'] != 0 for entry in entries):
                raise ValueError('UID progress appeared during interrupted activation')
        if previous is None:
            os.rename(stage / 'data', target)
            sync_directory(stage)
            sync_directory(target.parent)
        else:
            exchange(stage / 'data', target)
    if not rollback:
        source = SOURCE / ('pb-' + server_id)
        retained = control / 'legacy-source-retained-v1'
        if inode(source) != value['sealedSourceInode']:
            if inode(source) != value['sourceInode'] or inode(retained) != value['sealedSourceInode']:
                raise ValueError('Ambiguous legacy seal requires operator review')
            if tree(source, value['legacyUid']) != verify(server_id)['entries']:
                raise ValueError('Legacy progress changed during interrupted migration')
            exchange(retained, source)
        # The root-owned empty placeholder rejects the service-user legacy
        # launch path. Original files are retained inside private control/.
        fd = open_directory(source)
        try:
            check_directory(fd, 0)
            if os.listdir(fd):
                raise ValueError('Legacy migration seal was modified')
        finally:
            os.close(fd)
    # An interruption after exchange is recognized by directory inode, never
    # inferred from an empty directory or a possibly stale completion flag.
    value['phase'] = 'rolled-back' if rollback else 'active'
    journal_write(control, value)
    return value


def transaction(action, server_id, legacy_uid, runtime, identities):
    quiescent(legacy_uid)
    original = verify(server_id)
    account = identities.ensure_identity(server_id)
    uid = account['uid']
    quiescent(uid)
    root = ROOT / server_id
    # Preparation is a prerequisite. Do not create an empty checkpoint or data
    # home when the operator named an unprepared server.
    for directory, mode in [(ROOT, 0o711), (root, 0o711), (root / 'control', 0o700)]:
        runtime.directory(directory, mode=mode)
    control = root / 'control'
    lock = os.open(control / 'runtime.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        identities.secure_stat(os.fstat(lock))
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        source = SOURCE / ('pb-' + server_id)
        try:
            value = journal_read(control, server_id)
        except FileNotFoundError:
            value = None
        if value is not None:
            if value.get('uid') != uid or value.get('legacyUid') != legacy_uid:
                raise ValueError('Migration account changed')
            if action == 'recover' or value['phase'] in ('activating', 'rolling-back'):
                return finish_transaction(server_id, control, value)
            if action == 'activate':
                if value['phase'] != 'active':
                    raise ValueError('Rolled-back migrations cannot be implicitly reactivated')
                return finish_transaction(server_id, control, value)
            if value['phase'] == 'rolled-back':
                return finish_transaction(server_id, control, value)
        elif action != 'activate':
            raise ValueError('No activation transaction to recover or roll back')
        if action == 'activate':
            if tree(source, legacy_uid) != original['entries']:
                raise ValueError('Legacy source changed; both versions require operator review')
            previous = inode(root / 'data')
            if previous is not None:
                entries = tree(root / 'data', uid)
                if any(entry['path'] != 'server.cfg' or entry['type'] != 'file' or entry['bytes'] != 0 for entry in entries):
                    raise ValueError('Existing UID game progress must not be replaced')
            stage = control / 'activation-copy-v1'
            origin, owner, target_uid = control / 'legacy-checkpoint-v1' / 'data', 0, uid
            value = {'version': 1, 'serverId': server_id, 'phase': 'activating', 'gameSlug': GAME, 'uid': uid, 'legacyUid': legacy_uid, 'previousDataInode': previous, 'sourceInode': inode(source)}
            seal = control / 'legacy-source-retained-v1'
            seal.mkdir(mode=0o700)
            value['sealedSourceInode'] = inode(seal)
        else:
            if value is None or value['phase'] != 'active' or inode(root / 'data') != value['activationInode']:
                raise ValueError('No active migration to roll back')
            if inode(source) != value['sealedSourceInode'] or tree(source, 0):
                raise ValueError('Legacy source changed; both versions require operator review')
            if tree(control / 'legacy-source-retained-v1', legacy_uid) != original['entries']:
                raise ValueError('Retained original data changed')
            stage = control / 'rollback-copy-v1'
            origin, owner, target_uid = root / 'data', uid, legacy_uid
            value = {**value, 'phase': 'rolling-back'}
        # Do not erase incomplete copies or retry by overwriting saved files.
        stage.mkdir(mode=0o700)
        data = stage / 'data'
        data.mkdir(mode=0o700)
        entries = tree(origin, owner, data)
        if entries != tree(origin, owner) or entries != tree(data, 0):
            raise ValueError('Migration copy verification failed')
        change_copy_owner(data, target_uid)
        if entries != tree(data, target_uid):
            raise ValueError('Reassigned migration copy differs')
        sync_directory(stage)
        sync_directory(control)
        value['rollbackInode' if action == 'rollback' else 'activationInode'] = inode(data)
        quiescent(legacy_uid)
        quiescent(uid)
        journal_write(control, value)
        return finish_transaction(server_id, control, value)
    finally:
        os.close(lock)


def registry_read(name, uid):
    directory = open_directory(STATE)
    try:
        check_directory(directory, uid)
        fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(fd) as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 16 * 1024 ** 2:
                raise ValueError('Unsafe managed registry')
            value = json.load(handle)
        if not isinstance(value, list) or not all(isinstance(row, dict) for row in value):
            raise ValueError('Invalid managed registry')
        return value
    finally:
        os.close(directory)


def transition_profile(action, server_id, legacy_uid, runtime, identities):
    """Explicit offline operator bridge; ordinary job writes remain sticky."""
    if action in ('enable-network','disable-network') and GAME != 'teeworlds':
        raise ValueError('Native network policy needs engine-specific acceptance')
    if action not in ('enroll', 'complete-rollback', 'enable-network', 'disable-network'):
        raise ValueError('Invalid profile transition')
    quiescent(legacy_uid)
    account = identities.ensure_identity(server_id)
    quiescent(account['uid'])
    control = ROOT / server_id / 'control'
    # Validate the private parent before opening a root lock or journal.
    for path, mode in [(ROOT, 0o711), (ROOT / server_id, 0o711), (control, 0o700)]:
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode:
            raise ValueError('Unsafe migration control')
    lock = os.open(control / 'runtime.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        identities.secure_stat(os.fstat(lock))
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        value = journal_read(control, server_id)
        if value.get('uid') != account['uid'] or value.get('legacyUid') != legacy_uid:
            raise ValueError('Migration account changed')
        if action in ('enroll', 'enable-network', 'disable-network'):
            if value['phase'] != 'active' or not runtime.migration_ready(server_id, account['uid'], allow_pending=True):
                raise ValueError('Data activation must complete before enrollment')
        elif value['phase'] != 'rolled-back' or inode(SOURCE / ('pb-' + server_id)) != value.get('rollbackInode'):
            raise ValueError('Data rollback must complete before profile rollback')
        rooms = registry_read('managed-rooms.json', legacy_uid)
        if any(row.get('communityServerId') == server_id for row in rooms):
            raise ValueError('Stop the managed runtime through the agent before migration')
        jobs = registry_read('managed-jobs.json', legacy_uid)
        selected = [row for row in jobs if row.get('communityServerId') == server_id]
        if len(selected) != 1 or selected[0].get('gameSlug') != GAME or selected[0].get('status') not in ('stopped', 'failed'):
            raise ValueError('Expected one stopped matching native managed job')
        if selected[0].get('identityProfile') not in (None, PROFILE):
            raise ValueError('Unexpected existing identity profile')
        row = selected[0]
        if action in ('enable-network', 'disable-network'):
            if row.get('identityProfile') != PROFILE or value.get('profileTransition', {}).get('state') != 'complete' or value.get('profileTransition', {}).get('target') != 'uid':
                raise ValueError('Complete UID enrollment before choosing network policy')
            if action == 'enable-network':
                network = runtime.trusted_module('pb_network', 'playbound-customer-network-check')
                if network.probe().get('preflightPassed') is not True:
                    raise ValueError('Kernel network preflight failed')
                value['networkProfile'] = 'public-game-v1'
            else:
                value.pop('networkProfile', None)
            quiescent(legacy_uid)
            quiescent(account['uid'])
            import datetime
            value['networkChange'] = {'actorUid': 0, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'profile': value.get('networkProfile')}
            journal_write(control, value)
            return value
        if action == 'enroll':
            row['identityProfile'] = PROFILE
        else:
            row.pop('identityProfile', None)
        target = 'uid' if action == 'enroll' else 'legacy'
        import datetime
        value['profileTransition'] = {'target': target, 'state': 'pending', 'actorUid': 0, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        journal_write(control, value)
        fd, name = tempfile.mkstemp(prefix='migration-jobs-', dir=STATE)
        with os.fdopen(fd, 'w') as handle:
            os.fchown(handle.fileno(), legacy_uid, legacy_uid)
            json.dump(jobs, handle)
            handle.flush()
            os.fsync(handle.fileno())
        quiescent(legacy_uid)
        quiescent(account['uid'])
        os.replace(name, STATE / 'managed-jobs.json')
        sync_directory(STATE)
        value['profileTransition']['state'] = 'complete'
        journal_write(control, value)
        return value
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        if os.getuid() != 0 or os.geteuid() != 0 or os.environ.get('SUDO_USER'):
            raise ValueError('Direct root operator required')
        cli = sys.argv[1:]
        if len(cli) == 4 and cli[0] == '--game':
            select_game(cli[1]); cli = cli[2:]
        action, server_id = arguments(cli)
        if action in ('prepare', 'verify'):
            value = prepare(server_id, pwd.getpwnam('playbound').pw_uid) if action == 'prepare' else verify(server_id)
            result = {'serverId': server_id, 'checkpointVerified': True, 'entries': len(value['entries']), 'activated': False}
        else:
            # Fixed, root-owned module loader already used by the runtime itself.
            helper = Path('/usr/local/libexec/playbound-customer-runtime')
            info = helper.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
                raise ValueError('Untrusted runtime helper')
            loader = importlib.machinery.SourceFileLoader('pb_runtime', str(helper))
            spec = importlib.util.spec_from_loader('pb_runtime', loader)
            runtime = importlib.util.module_from_spec(spec)
            loader.exec_module(runtime)
            runtime.select_game(GAME)
            identities = runtime.trusted_module('pb_identities', 'playbound-customer-identities')
            operation = transition_profile if action in ('enroll', 'complete-rollback', 'enable-network', 'disable-network') else transaction
            value = operation(action, server_id, pwd.getpwnam('playbound').pw_uid, runtime, identities)
            result = {'serverId': server_id, 'phase': value['phase'], 'activated': value['phase'] == 'active', 'enrollment': value.get('profileTransition', {}).get('target'), 'networkProfile': value.get('networkProfile')}
        print(json.dumps(result))
    except Exception:
        print('Offline migration failed; retain all copies and inspect/recover the journal before restarting', file=sys.stderr)
        sys.exit(1)
