"""Create an empty, isolated RVGL data home for a never-before-run server.

This is not legacy migration: existing legacy/private data and partial attempts
are refused for operator review. No caller path, UID, game or command is used.
"""
import json
import os
from pathlib import Path
import pwd
import stat

ROOT = Path('/var/lib/playbound-customer-runtime')
LEGACY = Path('/var/lib/playbound-host/rvgl-servers')


def fresh_candidate(server_id, root=None, legacy=None):
    if not isinstance(server_id, str) or len(server_id) != 24 or any(c not in '0123456789abcdef' for c in server_id):
        raise ValueError('Invalid fresh RVGL identity')
    root = root or ROOT
    legacy = legacy or LEGACY
    return not (root / server_id).exists() and not (root / server_id).is_symlink() and not (legacy / ('pb-' + server_id)).exists() and not (legacy / ('pb-' + server_id)).is_symlink()


def initialize(server_id, runtime, identities):
    if not fresh_candidate(server_id):
        raise ValueError('RVGL data already exists; fresh enrollment refused')
    parent = LEGACY.lstat()
    service_uid = pwd.getpwnam('playbound').pw_uid
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != service_uid or parent.st_mode & 0o077:
        raise ValueError('Unsafe RVGL legacy parent')
    runtime.directory(ROOT)
    # Reserve the identity durably before any per-server directories are made.
    account = identities.ensure_identity(server_id)
    uid = account['uid']
    if not 40000 <= uid <= 40255:
        raise ValueError('Invalid private RVGL UID')
    server_root = ROOT / server_id
    source = LEGACY / ('pb-' + server_id)
    # Exclusive creation makes interrupted provisioning fail closed. The
    # operator can inspect a partial tree; no retry may overwrite game data.
    server_root.mkdir(mode=0o711)
    control = server_root / 'control'
    data = server_root / 'data'
    control.mkdir(mode=0o700)
    data.mkdir(mode=0o700)
    os.chown(data, uid, uid)
    source.mkdir(mode=0o700)
    source_info = source.lstat()
    data_info = data.lstat()
    value = {
        'version': 1, 'serverId': server_id, 'gameSlug': 're-volt-rvgl',
        'origin': 'fresh', 'phase': 'active', 'uid': uid,
        'activationInode': [data_info.st_dev, data_info.st_ino],
        'sealedSourceInode': [source_info.st_dev, source_info.st_ino],
        'profileTransition': {'target': 'uid', 'state': 'complete'},
    }
    fd = os.open(control / 'migration.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())
    for directory in (control, server_root, source):
        fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try: os.fsync(fd)
        finally: os.close(fd)
    if not runtime.migration_ready(server_id, uid):
        raise ValueError('Fresh RVGL enrollment was not verified')
    return account
