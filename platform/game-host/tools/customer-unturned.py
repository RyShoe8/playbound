#!/usr/bin/python3 -I
"""Fixed Unturned private data and credential bootstrap."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid Unturned settings')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers', 'map', 'perspective', 'pve', 'cheats'}:
        raise ValueError('Undeclared Unturned setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 100 or re.search(r'[\x00-\x1f\x7f]', value['name']):
        raise ValueError('Invalid Unturned name')
    if value['map'] not in ('PEI', 'Washington', 'Yukon', 'Russia', 'Germany') or value['perspective'] not in ('Both', 'First', 'Third', 'Vehicle'):
        raise ValueError('Invalid Unturned map or perspective')
    if type(value['pve']) is not bool or type(value['cheats']) is not bool or type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64:
        raise ValueError('Invalid Unturned gameplay settings')
    if type(port) is not int or not 27075 <= port <= 27099 or (port-27075) % 3:
        raise ValueError('Invalid Unturned allocation')
    return value


def prepare(root, value, port):
    settings(json.dumps(value), port)
    descriptor = os.open(root/'gslt.txt', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 128:
            raise ValueError('Unsafe private Unturned token file')
        token = source.read(129).decode('ascii').strip()
        if not re.fullmatch(r'[A-Fa-f0-9]{20,64}', token):
            raise ValueError('Private Unturned GSLT required')
    config = root/'Server'
    config.mkdir(mode=0o700, exist_ok=True)
    info = config.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Unsafe Unturned configuration directory')
    destination = config/'Commands.dat'
    try:
        info = destination.lstat()
    except FileNotFoundError:
        pass
    else:
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077:
            raise ValueError('Unsafe Unturned command file')
    content = ('Name '+value['name']+'\nMap '+value['map']+'\nMaxPlayers '+str(value['maxPlayers'])+
               '\nPort '+str(port)+'\nPerspective '+value['perspective']+'\n'+
               ('PvE\n' if value['pve'] else 'PvP\n')+('Cheats\n' if value['cheats'] else '')+
               'GSLT '+token+'\n')
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-unturned-', dir=config)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as target:
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, destination)
        parent = os.open(config, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def arguments():
    return ['/game-data/Unturned_Headless.x86_64', '-batchmode', '-nographics',
            '-logfile', '/server/unturned.log', '+InternetServer/PlayBound']


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/Unturned_Headless.x86_64').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), value, payload['port'])
    command = arguments()
    os.chdir('/runtime')
    os.execv(command[0], command)
