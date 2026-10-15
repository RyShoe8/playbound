#!/usr/bin/python3 -I
"""Allocate stable, non-login server identities. Never launches, signals,
chowns, deletes an account, or accepts a command/path/UID from the caller.
Runtime handoff is deliberately separate from account readiness.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import grp
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import uuid

STATE = Path('/var/lib/playbound-customer-identities')
ROOT_UID = 0
UID_FIRST, UID_LAST = 40000, 40255
MAX_STATE_BYTES = 128 * 1024
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'}


def request(arguments):
    if len(arguments) != 2 or arguments[0] != 'ensure' or not re.fullmatch(r'[a-f0-9]{24}', arguments[1], re.I):
        raise ValueError('Expected a server identity request')
    return arguments[1].lower()


def verify_caller():
    if os.geteuid() != 0:
        raise ValueError('Root-owned identity helper required')
    if 'SUDO_UID' in os.environ and os.environ['SUDO_UID'] != str(pwd.getpwnam('playbound').pw_uid):
        raise ValueError('Only the hosting service may request an identity')


def secure_stat(value, directory=False):
    kind = stat.S_ISDIR(value.st_mode) if directory else stat.S_ISREG(value.st_mode)
    if not kind or value.st_uid != ROOT_UID or value.st_mode & 0o077 or (not directory and value.st_nlink != 1):
        raise ValueError('Identity state is not private and root-owned')


def secure_directory(root):
    # No agent-writable ancestor or linked alternate state directory.
    for parent in reversed(root.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != ROOT_UID or info.st_mode & 0o022:
            raise ValueError('Unsafe identity state ancestor')
    root.mkdir(mode=0o700, exist_ok=True)
    secure_stat(root.lstat(), directory=True)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate identity state key')
        result[key] = value
    return result


def validate_state(value):
    if not isinstance(value, dict) or set(value) != {'version', 'identities'} or type(value['version']) is not int or value['version'] != 1 or not isinstance(value['identities'], dict) or len(value['identities']) > UID_LAST - UID_FIRST + 1:
        raise ValueError('Invalid identity state')
    used = set()
    for server_id, row in value['identities'].items():
        if not re.fullmatch(r'[a-f0-9]{24}', server_id) or not isinstance(row, dict) or set(row) != {'uid', 'gid', 'state', 'createdAt'}:
            raise ValueError('Invalid identity mapping')
        uid = row['uid']
        if type(uid) is not int or not UID_FIRST <= uid <= UID_LAST or row['gid'] != uid or type(row['gid']) is not int or uid in used or row['state'] not in ('reserved', 'ready') or not isinstance(row['createdAt'], str):
            raise ValueError('Invalid or reused identity')
        datetime.fromisoformat(row['createdAt'])
        used.add(uid)
    return value


class IdentityStore:
    def __init__(self, root=STATE):
        self.root = root

    @contextmanager
    def locked(self):
        secure_directory(self.root)
        fd = os.open(self.root / 'registry.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            secure_stat(os.fstat(fd))
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield self
        finally:
            os.close(fd)

    def read(self):
        try:
            fd = os.open(self.root / 'identities.json', os.O_RDONLY | os.O_NOFOLLOW)
        except FileNotFoundError:
            return {'version': 1, 'identities': {}}
        with os.fdopen(fd, 'r', encoding='utf-8') as handle:
            info = os.fstat(handle.fileno())
            secure_stat(info)
            if info.st_size > MAX_STATE_BYTES:
                raise ValueError('Identity state exceeds limit')
            text = handle.read(MAX_STATE_BYTES + 1)
            if len(text.encode('utf-8')) > MAX_STATE_BYTES:
                raise ValueError('Identity state exceeds limit')
            return validate_state(json.loads(text, object_pairs_hook=unique_object))

    def write(self, value):
        validate_state(value)
        text = json.dumps(value, separators=(',', ':')).encode('utf-8')
        if len(text) > MAX_STATE_BYTES:
            raise ValueError('Identity state exceeds limit')
        temp = self.root / ('registry-' + str(uuid.uuid4()) + '.tmp')
        try:
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'wb') as handle:
                handle.write(text)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp, self.root / 'identities.json')
            directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            temp.unlink(missing_ok=True)


def lookup(function, key):
    try:
        return function(key)
    except KeyError:
        return None


def account_name(server_id):
    return 'pbcs-' + server_id


def inspect_account(server_id, uid):
    name = account_name(server_id)
    user = lookup(pwd.getpwnam, name)
    group = lookup(grp.getgrnam, name)
    by_uid, by_gid = lookup(pwd.getpwuid, uid), lookup(grp.getgrgid, uid)
    if (user and (user.pw_uid != uid or user.pw_gid != uid or user.pw_dir != '/nonexistent' or user.pw_shell != '/usr/sbin/nologin')) or (group and (group.gr_gid != uid or group.gr_mem)) or (by_uid and by_uid.pw_name != name) or (by_gid and by_gid.gr_name != name):
        raise ValueError('Server identity conflicts with host accounts')
    if any(name in item.gr_mem for item in grp.getgrall()):
        raise ValueError('Server identity has supplementary group access')
    return user, group


def run_account_tool(tool, arguments):
    executable = Path('/usr/sbin') / tool
    info = executable.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Untrusted host account tool')
    subprocess.run([str(executable), *arguments], check=True, capture_output=True, timeout=15, env=ENV, cwd='/')


def ensure_identity(server_id, store=None):
    # Keep the function boundary strict too; do not rely only on CLI validation.
    server_id = request(['ensure', server_id])
    store = store or IdentityStore()
    with store.locked():
        state = store.read()
        row = state['identities'].get(server_id)
        if row is None:
            # Never reclaim a slot, even after a failed creation or server deletion.
            used = {item['uid'] for item in state['identities'].values()}
            uid = next((candidate for candidate in range(UID_FIRST, UID_LAST + 1) if candidate not in used and not lookup(pwd.getpwuid, candidate) and not lookup(grp.getgrgid, candidate)), None)
            if uid is None:
                raise ValueError('Server identity pool is full')
            if lookup(pwd.getpwnam, account_name(server_id)) or lookup(grp.getgrnam, account_name(server_id)):
                raise ValueError('Unregistered server account already exists')
            row = {'uid': uid, 'gid': uid, 'state': 'reserved', 'createdAt': datetime.now(timezone.utc).isoformat()}
            state['identities'][server_id] = row
            store.write(state)  # Reserve durably before touching NSS accounts.
        uid = row['uid']
        user, group = inspect_account(server_id, uid)
        if row['state'] == 'ready' and (not user or not group):
            raise ValueError('Registered server identity was removed')
        name = account_name(server_id)
        if not group:
            run_account_tool('groupadd', ['--gid', str(uid), '--', name])
        if not user:
            run_account_tool('useradd', ['--uid', str(uid), '--gid', str(uid), '--no-user-group', '--no-create-home', '--no-log-init', '--home-dir', '/nonexistent', '--shell', '/usr/sbin/nologin', '--password', '!', '--key', 'SUB_UID_COUNT=0', '--key', 'SUB_GID_COUNT=0', '--', name])
        user, group = inspect_account(server_id, uid)
        if not user or not group:
            raise ValueError('Server account creation was not confirmed')
        if row['state'] != 'ready':
            row['state'] = 'ready'
            store.write(state)
        return {'serverId': server_id, 'uid': uid, 'gid': uid, 'account': name, 'identityReady': True, 'profile': 'customer-unix-v1'}


if __name__ == '__main__':
    try:
        verify_caller()
        print(json.dumps(ensure_identity(request(sys.argv[1:]))))
    except Exception:
        print(json.dumps({'error': 'Customer identity could not be confirmed'}))
        sys.exit(1)
