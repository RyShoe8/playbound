#!/usr/bin/python3 -I
"""Fixed BombSquad controller bootstrap; no caller-supplied Python or exec code."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid BombSquad configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers'}:
        raise ValueError('Undeclared BombSquad setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 100 or re.search(r'[\x00-\x1f\x7f]', value['name']):
        raise ValueError('Invalid BombSquad name')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 8 or type(port) is not int or not 43210 <= port <= 43230:
        raise ValueError('Invalid BombSquad allocation')
    return value


def prepare(root, value, port):
    settings(json.dumps(value), port)
    directory = root/'root'
    directory.mkdir(mode=0o700, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Unsafe private BombSquad directory')
    config = root/'controller-config.json'
    try:
        info = config.lstat()
    except FileNotFoundError:
        pass
    else:
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077:
            raise ValueError('Unsafe private BombSquad configuration')
    value = {'party_name': value['name'], 'party_is_public': False, 'port': port,
             'max_party_size': value['maxPlayers']+1,
             'session_max_players_override': value['maxPlayers'],
             'session_type': 'teams', 'show_tutorial': False,
             'dont_write_bytecode': True}
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-bombsquad-', dir=root)
    try:
        with os.fdopen(descriptor, 'w') as output:
            json.dump(value, output)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, config)
        parent = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def arguments():
    return ['/python/bin/python3.14', '-I', '-O', '-B', '/game-data/bombsquad_server',
            '--config', '/server/controller-config.json', '--root', '/server/root',
            '--noninteractive']


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/bombsquad_server').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), value, payload['port'])
    command = arguments()
    os.chdir('/game-data')
    os.execv(command[0], command)
