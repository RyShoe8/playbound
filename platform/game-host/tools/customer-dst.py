#!/usr/bin/python3 -I
"""Fixed native DST contract, run after entering the reserved UID namespace."""
import configparser
import io
import json
import os
from pathlib import Path
import re
import stat
import tempfile


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid DST configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers'}:
        raise ValueError('Undeclared DST setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 80 or re.search(r'[\x00-\x1f\x7f]', value['name']):
        raise ValueError('Invalid DST name')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64:
        raise ValueError('Invalid DST slots')
    if type(port) is not int or not 11020 <= port <= 11041 or (port-11020) % 3:
        raise ValueError('Invalid DST allocation')
    return value


def private_read(file, maximum):
    descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > maximum:
            raise ValueError('Unsafe private DST file')
        content = source.read(maximum+1)
        if len(content) > maximum:
            raise ValueError('Private DST file exceeds limit')
        return content.decode('utf-8')


def merge(file, changes):
    parser = configparser.ConfigParser(interpolation=None)
    try:
        text = private_read(file, 262144)
    except FileNotFoundError:
        text = ''
    parser.read_string(text)
    for section, values in changes.items():
        if not parser.has_section(section):
            parser.add_section(section)
        for key, value in values.items():
            parser.set(section, key, str(value))
    output = io.StringIO()
    parser.write(output)
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-dst-', dir=file.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as target:
            target.write(output.getvalue())
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, file)
        directory = os.open(file.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def prepare(root, value, port):
    settings(json.dumps(value), port)
    for relative in ('PlayBound', 'PlayBound/Cluster_1', 'PlayBound/Cluster_1/Master'):
        directory = root / relative
        directory.mkdir(mode=0o700, exist_ok=True)
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private DST directory')
    cluster = root / 'PlayBound/Cluster_1'
    # The token stays in the private filesystem and never enters argv or logs.
    token = private_read(cluster/'cluster_token.txt', 4096).strip()
    if not token or re.search(r'[\x00-\x20\x7f]', token):
        raise ValueError('Private Klei cluster token required')
    merge(cluster/'cluster.ini', {
        'GAMEPLAY': {'max_players': value['maxPlayers'], 'pause_when_empty': 'true'},
        'NETWORK': {'cluster_name': value['name'], 'lan_only_cluster': 'false', 'autosaver_enabled': 'true'},
        'MISC': {'console_enabled': 'true'},
        'SHARD': {'shard_enabled': 'false'},
    })
    merge(cluster/'Master/server.ini', {
        'NETWORK': {'server_port': port},
        'SHARD': {'is_master': 'true'},
        'STEAM': {'master_server_port': port+1, 'authentication_port': port+2},
    })


def arguments(port, max_players):
    settings(json.dumps({'name': 'validate', 'maxPlayers': max_players}), port)
    return ['/game-data/bin64/dontstarve_dedicated_server_nullrenderer_x64',
            '-persistent_storage_root', '/server', '-conf_dir', 'PlayBound',
            '-cluster', 'Cluster_1', '-shard', 'Master', '-port', str(port),
            '-players', str(max_players), '-steam_master_server_port', str(port+1),
            '-steam_authentication_port', str(port+2)]


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/bin64/dontstarve_dedicated_server_nullrenderer_x64').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), value, payload['port'])
    command = arguments(payload['port'], value['maxPlayers'])
    os.chdir('/game-data/bin64')
    os.execv(command[0], command)
