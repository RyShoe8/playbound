"""Deus Ex HX private configuration candidate; no runtime enrollment or Wine exec."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid HX configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'maxPlayers'}:
        raise ValueError('Undeclared HX setting')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 8:
        raise ValueError('Invalid HX slot count')
    if type(port) is not int or not 7790 <= port <= 7850 or (port-7790) % 3:
        raise ValueError('Invalid HX port allocation')
    return value


def arguments(value, port):
    settings(json.dumps(value), port)
    return ['/usr/bin/wine', '/server/System/HCC.exe', 'server',
            '01_NYC_UNATCOIsland', '-ini=HX.ini', '-userini=HXUser.ini', '-log=HXServer.log']


def environment():
    return {'PATH': '/usr/bin:/bin', 'HOME': '/server', 'LANG': 'C.UTF-8',
            'WINEPREFIX': '/server/wineprefix', 'WINEDEBUG': '-all',
            'XDG_RUNTIME_DIR': '/server/.runtime', 'XDG_CACHE_HOME': '/server/.cache'}


def build_config(text, port, max_players):
    settings(json.dumps({'maxPlayers': max_players}), port)
    if not isinstance(text, str) or len(text.encode()) > 1024**2 or '\x00' in text:
        raise ValueError('Invalid HX INI')
    overrides = {'url': {'port': str(port)},
                 'engine.gameinfo': {'maxplayers': str(max_players)},
                 'ipdrv.tcpnetdriver': {'allowdownloads': 'False'},
                 'hx.hxudpserveruplink': {'douplink': 'False'}}
    # Collapse managed duplicates across repeated sections. Preserve unrelated
    # rules and comments; disable interpolation by treating all text literally.
    output = []
    section = None
    emitted = set()
    for line in text.replace('\r\n', '\n').replace('\r', '\n').splitlines():
        match = re.fullmatch(r'\s*\[([^\[\]\r\n]+)\]\s*', line)
        if match:
            section = match[1].strip().lower()
            output.append(line)
            if section in overrides and section not in emitted:
                output.extend(key+'='+value for key, value in overrides[section].items())
                emitted.add(section)
            continue
        elif section in overrides and '=' in line:
            key = line.split('=', 1)[0].strip().lower()
            if key in overrides[section]:
                continue
        output.append(line)
    for section, values in overrides.items():
        if section not in emitted:
            output.extend(['['+section+']', *(key+'='+value for key, value in values.items())])
    return '\r\n'.join(output)+'\r\n'


def private_directory(root, relative):
    current = root
    for part in Path(relative).parts:
        current /= part
        current.mkdir(mode=0o700, exist_ok=True)
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe HX private directory')
    return current


def read_config(file, private):
    descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 1024**2:
            raise ValueError('Unsafe HX configuration file')
        if private:
            if info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise ValueError('Unsafe HX private configuration')
        elif info.st_uid != 0 or info.st_mode & 0o222:
            raise ValueError('Untrusted HX default configuration')
        content = source.read(1024**2+1)
        if len(content) > 1024**2:
            raise ValueError('HX configuration exceeds limit')
        return content.decode('utf-8')


def prepare(root, default, value, port):
    settings(json.dumps(value), port)
    for name in ('System', 'Save', 'wineprefix', '.runtime', '.cache'):
        private_directory(root, name)
    config = root/'System/HX.ini'
    try:
        original = read_config(config, True)
    except FileNotFoundError:
        original = read_config(default, False)
    content = build_config(original, port, value['maxPlayers'])
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-hx-', dir=root/'System')
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, config)
        directory = os.open(root/'System', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
