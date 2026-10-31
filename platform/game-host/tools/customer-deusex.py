#!/usr/bin/python3 -I
"""Fixed Deus Ex HX layout under Wine; only reviewed assets enter this namespace.

HCC.exe is a 32-bit Windows console server, so it runs with the guarded i386
filter inside the enforced per-UID AppArmor profile, which admits writes only
under /server. The room is assembled at /server/room: every shipped file is a
read-only bind of the sealed bundle, and only what Unreal writes is private,
the System *.ini and *.log files plus Save, CoopSave and Cache.
"""
import json
import os
from pathlib import Path
import re
import stat
import tempfile

FIRST_PORT, LAST_PORT, STRIDE, MAX_PLAYERS = 7790, 7850, 3, 8
PRIVATE_DIRS = ('Save', 'CoopSave', 'Cache')
MAP = '01_NYC_UNATCOIsland'


def private_name(name):
    return name.lower().endswith(('.ini', '.log'))


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 4096:
        raise ValueError('Invalid Deus Ex contract')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'maxPlayers'}:
        raise ValueError('Undeclared Deus Ex setting')
    if type(port) is not int or not FIRST_PORT <= port <= LAST_PORT or (port - FIRST_PORT) % STRIDE:
        raise ValueError('Invalid Deus Ex allocation')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= MAX_PLAYERS:
        raise ValueError('Invalid Deus Ex slots')
    return value


def mounts(descriptor):
    """Root side, before the identity drop: read-only binds from the sealed bundle."""
    if type(descriptor) is not int or descriptor < 0:
        raise ValueError('Retained Deus Ex descriptor required')
    public = Path('/proc/self/fd')/str(descriptor)
    result = []
    def bind(relative, kind):
        source = public/relative
        info = source.lstat()
        if source.is_symlink() or not kind(info.st_mode):
            raise ValueError('Unsafe Deus Ex package binding')
        result.extend(['--ro-bind', str(source), '/server/room/'+relative])
    for name in sorted(os.listdir(public)):
        if name in ('System', 'Save', *PRIVATE_DIRS):
            continue
        bind(name, lambda mode: stat.S_ISREG(mode) or stat.S_ISDIR(mode))
    for name in sorted(os.listdir(public/'System')):
        if not private_name(name):
            bind('System/'+name, stat.S_ISREG)
    return result


def private_directory(root, relative):
    current = root
    for part in Path(relative).parts:
        current /= part
        current.mkdir(mode=0o700, exist_ok=True)
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private Deus Ex directory')
    return current


def private_write(file, content):
    try:
        info = file.lstat()
    except FileNotFoundError:
        pass
    else:
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private Deus Ex file')
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-deusex-', dir=file.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='latin-1', newline='') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_private(file):
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_size > 1024**2:
        raise ValueError('Unsafe private Deus Ex configuration')
    return file.read_text(encoding='latin-1')


def set_ini_value(source, section, key, value):
    """Same rules as the shared runtime's deusExHx.js setIniValue."""
    lines = source.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    in_section = found_section = found_key = False
    wanted = ('['+section+']').lower()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if line.startswith('[') and line.endswith(']'):
            if in_section and not found_key:
                lines.insert(index, key+'='+str(value)); found_key = True; index += 1
            in_section = line.lower() == wanted
            found_section = found_section or in_section
        elif in_section and line.lower().startswith(key.lower()+'='):
            lines[index] = key+'='+str(value); found_key = True
        index += 1
    if not found_section:
        lines += ['['+section+']', key+'='+str(value)]
    elif not found_key:
        lines.append(key+'='+str(value))
    return '\r\n'.join(lines)


def build_ini(template, port, max_players):
    ini = set_ini_value(template, 'URL', 'Port', port)
    ini = set_ini_value(ini, 'Engine.GameInfo', 'MaxPlayers', min(8, max(2, max_players)))
    # Every player installs their own retail game and HX edition; never serve
    # proprietary packages from the server to a client missing local files.
    ini = set_ini_value(ini, 'IpDrv.TcpNetDriver', 'AllowDownloads', 'False')
    return set_ini_value(ini, 'HX.HXUdpServerUplink', 'DoUplink', 'False')


def prepare(root, public, value, port):
    settings(json.dumps(value), port)
    for relative in ('room/System', 'wineprefix', *('room/'+name for name in PRIVATE_DIRS)):
        private_directory(root, relative)
    system = root/'room/System'
    for source in sorted((public/'System').iterdir()):
        if not private_name(source.name):
            continue
        info = source.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > 1024**2:
            raise ValueError('Invalid Deus Ex default')
        if not (system/source.name).exists():
            private_write(system/source.name, source.read_text(encoding='latin-1'))
    # Keep private rules across restarts; reapply only port, slots and the two
    # download/uplink safety settings, as the shared runtime does.
    config = system/'HX.ini'
    template = read_private(config) if config.exists() else (public/'System/HXDefault.ini').read_text(encoding='latin-1')
    private_write(config, build_ini(template, port, value['maxPlayers']))


def arguments():
    return ['/usr/bin/wine', 'HCC.exe', 'server', MAP, '-ini=HX.ini', '-userini=HXUser.ini', '-log=HXServer.log']


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/System/HCC.exe').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), Path('/game-data'), value, payload['port'])
    os.environ.update({'WINEPREFIX': '/server/wineprefix', 'WINEDEBUG': '-all'})
    os.chdir('/server/room/System')
    command = arguments()
    os.execv(command[0], command)
