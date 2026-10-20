#!/usr/bin/python3 -I
"""Fixed Battlefield 1942 static engine and private overlay contract."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid Battlefield configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers', 'map', 'gameMode', 'botSkill'}:
        raise ValueError('Undeclared Battlefield setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 80 or re.search(r'[\x00-\x1f\x7f"\\;]', value['name']):
        raise ValueError('Invalid Battlefield name')
    if not isinstance(value['map'], str) or not re.fullmatch(r'[A-Za-z0-9_]{1,64}', value['map']) or value['gameMode'] not in ('GPM_CQ', 'GPM_COOP'):
        raise ValueError('Invalid Battlefield map or mode')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64 or type(value['botSkill']) is not int or not 1 <= value['botSkill'] <= 100:
        raise ValueError('Invalid Battlefield slots or bot skill')
    if type(port) is not int or not 14567 <= port <= 14586:
        raise ValueError('Invalid Battlefield allocation')
    return value


def read_private(file):
    descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 262144:
            raise ValueError('Unsafe Battlefield configuration file')
        text = source.read(262145)
        if len(text) > 262144 or b'\x00' in text:
            raise ValueError('Invalid Battlefield configuration content')
        return text.decode('utf-8')


def write_private(file, text):
    try:
        read_private(file)
    except FileNotFoundError:
        pass
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-battlefield-', dir=file.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(text)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, file)
        parent = os.open(file.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def seed(source, target):
    """First start only: the engine's stock settings (profile, controls, defaults) from the sealed bundle."""
    if not source.is_dir() or (target/'serversettings.con').exists():
        return
    (target/'adminsettings.con').touch(mode=0o600, exist_ok=True)
    for path in sorted(source.rglob('*')):
        relative = path.relative_to(source)
        info = path.lstat()
        if stat.S_ISDIR(info.st_mode):
            (target/relative).mkdir(mode=0o700, parents=True, exist_ok=True)
        elif stat.S_ISREG(info.st_mode) and info.st_size <= 65536:
            (target/relative).parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            write_private(target/relative, path.read_text())
        else:
            raise ValueError('Invalid published Battlefield settings')


def prepare(root, value, port):
    settings(json.dumps(value), port)
    for name in ('settings', 'logs'):
        directory = root/name
        directory.mkdir(mode=0o700, exist_ok=True)
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe Battlefield overlay directory')
    seed(Path('/game-data/settings-seed'), root/'settings')
    values = {
        'game.serverName': '"'+value['name']+'"',
        'game.serverDedicated': '1', 'game.serverInternet': '0',
        'game.serverIP': '0.0.0.0', 'game.serverPort': str(port),
        'game.serverMaxPlayers': str(value['maxPlayers']), 'game.serverPassword': '""',
        'game.gameSpyLANPort': '0', 'game.gameSpyPort': '0', 'game.ASEPort': '0',
        'game.serverPunkBuster': '0', 'game.serverCoopAiSkill': str(value['botSkill']),
    }
    file = root/'settings/serversettings.con'
    try:
        original = read_private(file)
    except FileNotFoundError:
        original = ''
    keys = {key.lower() for key in values}
    retained = [line for line in original.splitlines()
                if not line.strip() or line.strip().split()[0].lower() not in keys]
    config = '\n'.join(retained).rstrip()+'\n'+''.join(key+' '+text+'\n' for key, text in values.items())
    write_private(file, config.lstrip('\n'))
    rotation = ('game.addLevel '+value['map']+' '+value['gameMode']+' bf1942\n'+
                'game.setCurrentLevel '+value['map']+' '+value['gameMode']+' bf1942\n')
    write_private(root/'settings/maplist.con', rotation)


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/bf1942_lnxded.static').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), value, payload['port'])
    os.chdir('/game-data')
    os.execv('/game-data/bf1942_lnxded.static',
             ['/game-data/bf1942_lnxded.static', '+overlayPath', '/server'])
