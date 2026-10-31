#!/usr/bin/python3 -I
"""Identity-bound RimWorld Together status and console relay. No caller-supplied path.

An isolated server keeps playbound-status.json and playbound-console.fifo in its
private data folder (0700, owned by the reserved UID), where the agent cannot
reach them. This reads the one and writes a single validated line to the other,
only for the RimWorld runtime whose process identity the caller names.
"""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

ROOT = Path('/var/lib/playbound-customer-runtime')
PROFILE = 'rimworld-together-unix-v1'


def trusted(name, filename):
    path = Path('/usr/local/libexec') / filename
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
        raise ValueError('Untrusted runtime dependency')
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def validate_command(value):
    if not isinstance(value, dict) or set(value) != {'command'} or not isinstance(value['command'], str):
        raise ValueError('Invalid console command')
    command = value['command'].strip()
    if not command or len(command) > 200 or re.search(r'[\x00-\x1f\x7f]', command):
        raise ValueError('Send one console command at a time')
    return command


def validate_status(doc, now):
    if not isinstance(doc, dict) or not isinstance(doc.get('players'), list) or type(doc.get('maxPlayers')) is not int or doc['maxPlayers'] < 1:
        raise ValueError('Invalid RimWorld status')
    updated = doc.get('updatedAt')
    if not isinstance(updated, (int, float)) or now - updated > 10000 or updated > now + 2000:
        raise ValueError('RimWorld player status is stale')
    players = []
    for player in doc['players'][:256]:
        if not isinstance(player, dict) or not isinstance(player.get('name'), str) or len(player['name']) > 64:
            raise ValueError('Invalid RimWorld player')
        if player.get('id') is not None and (not isinstance(player['id'], str) or len(player['id']) > 64):
            raise ValueError('Invalid RimWorld player')
        players.append({'name': player['name'], 'id': player.get('id')})
    return {'players': players, 'maxPlayers': doc['maxPlayers'], 'updatedAt': updated}


def identity(action, server_id, pid, process_identity):
    if action not in ('status', 'command') or not re.fullmatch(r'[a-f0-9]{24}', server_id) or not re.fullmatch(r'[1-9][0-9]{0,9}', pid) or int(pid) <= 1 or not re.fullmatch(r'[a-f0-9-]{36}:[0-9]+', process_identity):
        raise ValueError('Invalid console identity')
    identities = trusted('rim_identities', 'playbound-customer-identities')
    identities.verify_caller()
    runtime = trusted('rim_runtime', 'playbound-customer-runtime')
    resources = trusted('rim_resources', 'playbound-customer-resources')
    if runtime.journal_game(server_id) != 'rimworld-together':
        raise ValueError('Wrong console game')
    runtime.select_game('rimworld-together')
    result = runtime.runtime_status(resources, server_id, int(pid), process_identity)
    if result.get('running') is not True or result.get('profile') != PROFILE:
        raise ValueError('RimWorld runtime is not healthy')
    uid = result['uid']
    if type(uid) is not int or not 40000 <= uid <= 40255:
        raise ValueError('Invalid console UID')
    data = ROOT / server_id / 'data'
    info = data.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise ValueError('Unsafe console directory')
    return uid, data


def open_owned(path, uid, flags, kind):
    # O_NOFOLLOW and the post-open check pin the object the customer owns; a
    # swapped symlink or hard link to a host file is refused, never followed.
    descriptor = os.open(path, flags | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    info = os.fstat(descriptor)
    if not kind(info.st_mode) or info.st_uid != uid or info.st_nlink != 1:
        os.close(descriptor)
        raise ValueError('Unsafe console file')
    return descriptor, info


def main(args):
    if len(args) != 4:
        raise ValueError('Expected action and runtime identity')
    action, server_id, pid, process_identity = args
    uid, data = identity(action, server_id, pid, process_identity)
    if action == 'status':
        descriptor, info = open_owned(data / 'playbound-status.json', uid, os.O_RDONLY, stat.S_ISREG)
        try:
            if not 0 < info.st_size <= 65536:
                raise ValueError('Invalid RimWorld status')
            doc = json.loads(os.read(descriptor, 65537))
        finally:
            os.close(descriptor)
        print(json.dumps(validate_status(doc, time.time() * 1000)))
        return
    body = sys.stdin.buffer.read(1025)
    if len(body) > 1024:
        raise ValueError('Console command too large')
    command = validate_command(json.loads(body))
    descriptor, _ = open_owned(data / 'playbound-console.fifo', uid, os.O_WRONLY, stat.S_ISFIFO)
    try:
        os.write(descriptor, (command + '\n').encode('utf-8'))
    finally:
        os.close(descriptor)
    print('{"ok":true}')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as error:
        reason = str(error)[:160] if isinstance(error, ValueError) else type(error).__name__
        print('Private RimWorld console operation failed: ' + reason, file=sys.stderr)
        sys.exit(1)
