#!/usr/bin/python3 -I
"""Fixed TES3MP namespace bootstrap. Published scripts never supply player saves."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid TES3MP configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers', 'password', 'gameMode'}:
        raise ValueError('Undeclared TES3MP setting')
    for key, maximum in (('name', 100), ('password', 128), ('gameMode', 64)):
        if not isinstance(value[key], str) or len(value[key]) > maximum or re.search(r'[\x00-\x1f\x7f]', value[key]):
            raise ValueError('Invalid TES3MP text setting')
    if not value['name'] or not re.fullmatch(r'[A-Za-z0-9 _-]{1,64}', value['gameMode']):
        raise ValueError('Invalid TES3MP name or mode')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64 or type(port) is not int or not 25565 <= port <= 25585:
        raise ValueError('Invalid TES3MP allocation')
    return value


def directory(root, relative):
    current = root
    for part in Path(relative).parts:
        if part in ('..', '.') or part.startswith('/'):
            raise ValueError('Invalid TES3MP relative path')
        current /= part
        current.mkdir(mode=0o700, exist_ok=True)
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private TES3MP directory')
    return current


def write(file, content, preserve=False):
    try:
        info = file.lstat()
    except FileNotFoundError:
        pass
    else:
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private TES3MP file')
        if preserve:
            return
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-tes3mp-', dir=file.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(content)
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


def prepare(root, public, admin_hook, value, port):
    settings(json.dumps(value), port)
    for relative in ('.config/openmw', 'server/scripts/custom', 'server/lib',
                     'server/data/player', 'server/data/world', 'server/data/cell',
                     'server/data/map', 'server/data/custom', 'server/data/recordstore'):
        directory(root, relative)
    scripts = public/'server/scripts'
    for parent, dirs, files in os.walk(scripts, followlinks=False):
        relative = Path(parent).relative_to(scripts)
        for child in dirs:
            if (Path(parent)/child).is_symlink():
                raise ValueError('Linked published TES3MP script directory')
        target = directory(root, str(Path('server/scripts')/relative))
        for name in files:
            source = Path(parent)/name
            info = source.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_size > 1024**2:
                raise ValueError('Invalid published TES3MP script')
            content = source.read_bytes()
            if relative == Path('.') and name == 'config.lua':
                content, count = re.subn(rb'^config\.gameMode\s*=.*$',
                    ('config.gameMode = '+json.dumps(value['gameMode'])).encode(), content, flags=re.M)
                if count != 1:
                    raise ValueError('Unreviewed TES3MP mode configuration')
            if relative == Path('.') and name == 'customScripts.lua':
                content += b'\nrequire("custom/playboundAdmin")\n'
            write(target/name, content)
    # This hook is supplied only by the root-installed repository dependency.
    hook = admin_hook.read_bytes()
    if not 1 <= len(hook) <= 262144:
        raise ValueError('Invalid reviewed TES3MP admin hook')
    write(root/'server/scripts/custom/playboundAdmin.lua', hook)
    write(root/'server/data/requiredDataFiles.json',
          (public/'server/data/requiredDataFiles.json').read_bytes(), preserve=True)
    text = ('[General]\nlocalAddress = 0.0.0.0\nport = '+str(port)+
            '\nmaximumPlayers = '+str(value['maxPlayers'])+'\nhostname = '+value['name']+
            '\nlogLevel = 1\npassword = '+value['password']+
            '\n\n[Plugins]\nhome = /server/server\nplugins = serverCore.lua\n\n'
            '[MasterServer]\nenabled = false\naddress = master.tes3mp.com\nport = 25561\nrate = 10000\n')
    write(root/'.config/openmw/tes3mp-server.cfg', text.encode())


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/tes3mp-server.x86_64').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), Path('/game-data'), Path('/morrowind-admin.lua'), value, payload['port'])
    os.chdir('/server')
    os.execv('/game-data/tes3mp-server.x86_64',
             ['/game-data/tes3mp-server.x86_64', '--resources', '/game-data/resources'])
