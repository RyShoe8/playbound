#!/usr/bin/python3 -I
"""Stopped, UID-isolated world snapshots. No caller paths or executable input."""
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import shutil
import signal
import subprocess
import sys
import uuid
from datetime import datetime, timezone

ROOT = Path('/var/lib/playbound-customer-runtime')
FILE_WORKER_ROOT = Path('/usr/local/libexec/playbound-customer-files')
UUID = re.compile(r'[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}')


def load_runtime():
    file = Path('/usr/local/libexec/playbound-customer-runtime')
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
        raise ValueError('Untrusted runtime helper')
    loader = importlib.machinery.SourceFileLoader('pb_runtime', str(file))
    spec = importlib.util.spec_from_loader('pb_runtime', loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def arguments(args):
    if len(args) not in (2, 3) or args[0] not in ('list', 'create', 'restore', 'recover', 'files') or not re.fullmatch(r'[a-f0-9]{24}', args[1]):
        raise ValueError('Invalid isolated backup operation')
    if args[0] == 'restore' and (len(args) != 3 or not UUID.fullmatch(args[2])) or args[0] == 'create' and len(args) == 3 and not re.fullmatch(r'(?:[1-9]|[1-4][0-9]|50)',args[2]) or args[0] in ('list','recover','files') and len(args) != 2:
        raise ValueError('Invalid isolated backup identity')
    return args[0], args[1], args[2] if len(args) == 3 else None


def read_json(file):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 8 * 1024 ** 2:
            raise ValueError('Untrusted snapshot metadata')
        return json.load(source)


def write_json(file, value, migration):
    temporary = file.parent / ('.snapshot-' + str(uuid.uuid4()))
    with temporary.open('x') as output:
        os.fchmod(output.fileno(), 0o600)
        json.dump(value, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, file)
    migration.sync_directory(file.parent)


def metadata(file, server_id, game):
    value = read_json(file)
    if value.get('serverId') != server_id or value.get('gameSlug') != game or value.get('version') != 1 or not UUID.fullmatch(value.get('id', '')):
        raise ValueError('Snapshot does not belong to this server')
    return value


def summary(value):
    return {key: value[key] for key in ('id', 'serverId', 'gameSlug', 'createdAt', 'bytes', 'files', 'kind')}


def recover(root, control, uid, server_id, game, migration):
    file = control / 'world-restore.json'
    if not file.exists():
        return {'recovered': False}
    transaction = read_json(file)
    if transaction.get('serverId') != server_id or transaction.get('gameSlug') != game or not UUID.fullmatch(transaction.get('id', '')):
        raise ValueError('Invalid restore transaction')
    stage = control / ('world-restore-' + transaction['id'])
    data = root / 'data'
    journal = migration.journal_read(control, server_id)
    if journal.get('phase') != 'active' or journal.get('uid') != uid:
        raise ValueError('World restore requires an active matching identity')
    if transaction.get('complete'):
        if migration.inode(data) != transaction['newInode'] or journal.get('activationInode') != transaction['newInode']:
            raise ValueError('Completed restore identity changed')
        return {'recovered': True, 'id': transaction['id']}
    current, staged = migration.inode(data), migration.inode(stage)
    if current == transaction['oldInode'] and staged == transaction['newInode']:
        if migration.tree(stage, uid) != transaction['entries']:
            raise ValueError('Staged restore data changed')
        migration.exchange(data, stage)
    elif current != transaction['newInode'] or staged != transaction['oldInode']:
        raise ValueError('Restore locations require operator review')
    if migration.tree(data, uid) != transaction['entries']:
        raise ValueError('Restored data verification failed')
    journal['activationInode'] = transaction['newInode']
    journal['worldRestore'] = {'id': transaction['id'], 'at': datetime.now(timezone.utc).isoformat(), 'actorUid': os.getuid()}
    migration.journal_write(control, journal)
    transaction['complete'] = True
    write_json(file, transaction, migration)
    return {'recovered': True, 'id': transaction['id']}


def reserve_disk(folder, entries):
    space = os.statvfs(folder)
    required = sum(row.get('bytes', 0) for row in entries)
    reserve = max(2 * 1024 ** 3, space.f_blocks * space.f_frsize // 10)
    if space.f_bavail * space.f_frsize - required < reserve:
        raise ValueError('Insufficient disk space for an isolated snapshot')


def operation(action, server_id, backup_id, runtime, identities, migration, file_input=None):
    game = runtime.journal_game(server_id)
    if game not in ('teeworlds', 'bzflag', 'hedgewars', 'openttd', 'luanti', 'openarena', 'battle-for-wesnoth', 'supertuxkart', '0-ad', 'ysoccer', 'flightgear', 'mindustry', 'hurry-curry', 'assaultcube', 'xonotic', 'wolfenstein-enemy-territory', 'medal-of-honor-allied-assault', 'freedoom', 'freeciv', 'warzone-2100', 'hypersomnia'):
        raise ValueError('This isolated engine has no world snapshot profile')
    runtime.select_game(game)
    migration.select_game(game)
    account = identities.ensure_identity(server_id)
    uid = account['uid']
    root, control = ROOT / server_id, ROOT / server_id / 'control'
    runtime.directory(ROOT)
    runtime.directory(root)
    runtime.directory(control, mode=0o700)
    lock = os.open(control / 'runtime.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    global_lock = None
    try:
        identities.secure_stat(os.fstat(lock))
        # Listing metadata does not need to stop the game. Other operations
        # exclude the supervisor's lifetime lock and all processes of this UID.
        if action != 'list':
            global_lock = os.open(ROOT / '.world-snapshots.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            identities.secure_stat(os.fstat(global_lock))
            fcntl.flock(global_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            migration.quiescent(uid)
        if action == 'recover':
            return recover(root, control, uid, server_id, game, migration)
        if (control / 'world-restore.json').exists():
            transaction = read_json(control / 'world-restore.json')
            if not transaction.get('complete'):
                raise ValueError('Recover the interrupted world restore before another operation')
        if not runtime.migration_ready(server_id, uid):
            raise ValueError('Customer data migration is not ready')
        if action == 'files':
            if not isinstance(file_input, dict): raise ValueError('Invalid file operation')
            folder = FILE_WORKER_ROOT
            info = folder.lstat()
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('Untrusted file worker directory')
            for name in ['worker.mjs','dedicatedFiles.js','dedicatedDataBackups.js','package.json']:
                info = (folder / name).lstat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > 1024 ** 2: raise ValueError('Untrusted file worker')
            result = subprocess.run(['/usr/bin/prlimit','--nofile=128','--cpu=20','--core=0','--','/usr/bin/node','--max-old-space-size=128',str(folder/'worker.mjs'),server_id,game],
                input=json.dumps(file_input), text=True, capture_output=True, timeout=25, check=True,
                user=uid,group=account['gid'],extra_groups=[],cwd='/',env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/nonexistent'})
            if len(result.stdout) > 6 * 1024 ** 2: raise ValueError('File response exceeds limit')
            return {**json.loads(result.stdout), 'gameSlug': game}
        backups = control / 'world-backups'
        runtime.directory(backups, mode=0o700)
        if action == 'list':
            rows = []
            for child in backups.iterdir():
                if UUID.fullmatch(child.name):
                    runtime.directory(child, mode=0o700)
                    rows.append(summary(metadata(child / 'metadata.json', server_id, game)))
            return sorted(rows, key=lambda row: row['createdAt'], reverse=True)
        data = root / 'data'
        if action == 'create':
            original = migration.tree(data, uid)
            reserve_disk(control, original)
            token = str(uuid.uuid4())
            stage = backups / ('.creating-' + token)
            runtime.directory(stage, mode=0o700)
            runtime.directory(stage / 'data', mode=0o700)
            entries = migration.tree(data, uid, stage / 'data')
            if entries != original or entries != migration.tree(data, uid) or entries != migration.tree(stage / 'data', 0):
                raise ValueError('World changed during snapshot')
            value = {'version': 1, 'id': token, 'serverId': server_id, 'gameSlug': game, 'createdAt': datetime.now(timezone.utc).isoformat(), 'kind': 'manual', 'entries': entries,
                     'bytes': sum(row.get('bytes', 0) for row in entries), 'files': sum(row['type'] == 'file' for row in entries)}
            write_json(stage / 'metadata.json', value, migration)
            migration.sync_directory(stage / 'data')
            os.rename(stage, backups / token)
            migration.sync_directory(backups)
            # Root-only verified snapshots; retain the newest three. Retained
            # pre-restore worlds are separate and never pruned here.
            rows = []
            for child in backups.iterdir():
                if UUID.fullmatch(child.name):
                    runtime.directory(child, mode=0o700)
                    old = metadata(child / 'metadata.json', server_id, game)
                    if old['id'] != child.name: raise ValueError('Snapshot identity mismatch')
                    rows.append((old['createdAt'], child, old))
            for _, child, old in sorted(rows, key=lambda row: row[0], reverse=True)[int(backup_id or 3):]:
                if migration.tree(child / 'data', 0) != old['entries']: raise ValueError('Retained snapshot changed')
                shutil.rmtree(child)
            return summary(value)
        snapshot = backups / backup_id
        runtime.directory(snapshot, mode=0o700)
        value = metadata(snapshot / 'metadata.json', server_id, game)
        if value['id'] != backup_id:
            raise ValueError('Snapshot filename identity mismatch')
        if value['entries'] != migration.tree(snapshot / 'data', 0):
            raise ValueError('Snapshot contents changed')
        reserve_disk(control, value['entries'])
        token = str(uuid.uuid4())
        stage = control / ('world-restore-' + token)
        runtime.directory(stage, mode=0o700)
        if migration.tree(snapshot / 'data', 0, stage) != value['entries']:
            raise ValueError('Restore copy differs from snapshot')
        migration.change_copy_owner(stage, uid)
        transaction = {'serverId': server_id, 'gameSlug': game, 'id': token, 'oldInode': migration.inode(data), 'newInode': migration.inode(stage), 'entries': value['entries'], 'complete': False}
        write_json(control / 'world-restore.json', transaction, migration)
        result = recover(root, control, uid, server_id, game, migration)
        return {**result, 'gameSlug': game, 'restored': backup_id, 'beforeRestoreSaved': True}
    finally:
        os.close(lock)
        if global_lock is not None: os.close(global_lock)


if __name__ == '__main__':
    try:
        action, server_id, backup_id = arguments(sys.argv[1:])
        def deadline(_signal, _frame): raise TimeoutError('Snapshot deadline exceeded')
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(110)
        runtime = load_runtime()
        identities = runtime.trusted_module('pb_identities', 'playbound-customer-identities')
        identities.verify_caller()
        migration = runtime.trusted_module('pb_migration', 'playbound-customer-data-migration')
        file_input = None
        if action == 'files':
            body = sys.stdin.buffer.read(4 * 1024 ** 2 + 4097)
            if len(body) > 4 * 1024 ** 2 + 4096: raise ValueError('File request exceeds limit')
            file_input = json.loads(body)
        print(json.dumps(operation(action, server_id, backup_id, runtime, identities, migration, file_input)))
    except Exception:
        print('Isolated world snapshot failed; stop the server or recover its restore transaction', file=sys.stderr)
        sys.exit(1)
