#!/usr/bin/python3 -I
"""Fixed GoldenEye: Source layout under Wine; only reviewed assets enter this namespace.

srcds.exe is a 32-bit Windows engine, so it runs with the guarded i386 filter
inside the enforced per-UID AppArmor profile. The profile admits writes only
under /server, so the whole runtime is assembled at /server/runtime: every
shipped entry is a read-only bind of the sealed bundle, and only the folders
Source writes to are private. Two of those are easy to miss and each one
hangs the engine behind an invisible error dialog when read-only:
maps/graphs (node graphs written on map load) and the Python root
(python.log). Python caches deeper in the tree are skipped silently.
"""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile

FIRST_PORT, LAST_PORT, MAX_PLAYERS = 27120, 27139, 32
TOP_FILES = ('srcds.exe', 'steam.dll', 'steamclient.dll', 'tier0_s.dll', 'vstdlib_s.dll')
TOP_DIRS = ('bin', 'hl2', 'platform', 'sourcetest')
MUTABLE = ('cfg', 'logs', 'download', 'downloads', 'DownloadLists', 'cache', 'custom')
SKIPPED = frozenset((*MUTABLE, 'maps', 'python', 'modelsounds.cache'))
PYTHON_PRIVATE = frozenset(('python.log', 'gphashes.txt', '__pycache__'))


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid GoldenEye contract')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers', 'map', 'timeLimit', 'rconPassword'}:
        raise ValueError('Undeclared GoldenEye setting')
    if type(port) is not int or not FIRST_PORT <= port <= LAST_PORT:
        raise ValueError('Invalid GoldenEye allocation')
    for key, maximum in (('name', 100), ('rconPassword', 128)):
        if not isinstance(value[key], str) or len(value[key]) > maximum or re.search(r'[\x00-\x1f\x7f"\\;]', value[key]):
            raise ValueError('Invalid GoldenEye text setting')
    if not value['name'] or not isinstance(value['map'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value['map']):
        raise ValueError('Invalid GoldenEye name or map')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= MAX_PLAYERS:
        raise ValueError('Invalid GoldenEye slots')
    if type(value['timeLimit']) is not int or not 0 <= value['timeLimit'] <= 600:
        raise ValueError('Invalid GoldenEye time limit')
    return value


def display_for(uid):
    # The per-UID AppArmor profile admits exactly this abstract X socket.
    if type(uid) is not int or not 40000 <= uid <= 40255:
        raise ValueError('Reserved runtime UID required')
    return 1000 + uid - 40000


def mounts(descriptor):
    """Root side, before the identity drop: read-only binds from the sealed bundle."""
    if type(descriptor) is not int or descriptor < 0:
        raise ValueError('Retained GoldenEye descriptor required')
    public = Path('/proc/self/fd')/str(descriptor)
    result = []
    def bind(relative, kind):
        source = public/relative
        info = source.lstat()
        if source.is_symlink() or not kind(info.st_mode):
            raise ValueError('Unsafe GoldenEye package binding')
        result.extend(['--ro-bind', str(source), '/server/runtime/'+relative])
    for name in TOP_FILES:
        bind(name, stat.S_ISREG)
    for name in TOP_DIRS:
        bind(name, stat.S_ISDIR)
    mod = public/'gesource'
    for name in sorted(os.listdir(mod)):
        if name in SKIPPED or re.fullmatch(r'console.*\.log', name):
            continue
        bind('gesource/'+name, lambda mode: stat.S_ISREG(mode) or stat.S_ISDIR(mode))
    for name in sorted(os.listdir(mod/'maps')):
        if name != 'graphs':
            bind('gesource/maps/'+name, stat.S_ISREG)
    for name in sorted(os.listdir(mod/'python')):
        if name not in PYTHON_PRIVATE:
            bind('gesource/python/'+name, lambda mode: stat.S_ISREG(mode) or stat.S_ISDIR(mode))
    return result


def private_directory(root, relative):
    current = root
    for part in Path(relative).parts:
        current /= part
        current.mkdir(mode=0o700, exist_ok=True)
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private GoldenEye directory')
    return current


def private_write(file, content):
    try:
        info = file.lstat()
    except FileNotFoundError:
        pass
    else:
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private GoldenEye file')
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-goldeneye-', dir=file.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, file)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def prepare(root, public, value, port):
    settings(json.dumps(value), port)
    for relative in ('runtime/gesource/maps/graphs', 'runtime/gesource/python', 'wineprefix'):
        private_directory(root, relative)
    for name in MUTABLE:
        private_directory(root, 'runtime/gesource/'+name)
    # Defaults come only from the reviewed bundle; a customer's own edits stay.
    for source in sorted((public/'defaults/cfg').iterdir()):
        info = source.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_size > 1024**2:
            raise ValueError('Invalid GoldenEye default')
        destination = root/'runtime/gesource/cfg'/source.name
        if not destination.exists():
            private_write(destination, source.read_text(encoding='utf-8'))
    private_write(root/'runtime/gesource/cfg/pb-managed.cfg',
                  'hostname "'+value['name']+'"\nrcon_password "'+value['rconPassword']+'"\n')


def arguments(value, port):
    settings(json.dumps(value), port)
    # The bind policy admits the game port and port+1000 only, so the client
    # port is pinned and SourceTV stays off, as for the native Source engines.
    return ['/usr/bin/wine', 'srcds.exe', '-console', '-game', 'gesource', '-strictportbind', '-norestart', '-nohltv',
            '-ip', '0.0.0.0', '-port', str(port), '+clientport', str(port+1000), '+map', value['map'], '-maxplayers', str(value['maxPlayers']),
            '+mp_timelimit', str(value['timeLimit']), '+exec', 'pb-managed.cfg']


if __name__ == '__main__':
    uid = os.getuid()
    if not 40000 <= uid <= 40255 or not Path('/game-data/srcds.exe').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), Path('/game-data'), value, payload['port'])
    display = display_for(uid)
    # Xvfb is a child of the namespace init; bwrap's --die-with-parent and the
    # PID namespace end it with the engine.
    subprocess.Popen(['/usr/bin/Xvfb', ':'+str(display), '-nolisten', 'tcp', '-screen', '0', '640x480x16'],
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.environ.update({'DISPLAY': ':'+str(display), 'WINEPREFIX': '/server/wineprefix', 'WINEDEBUG': '-all',
                       'PYTHONDONTWRITEBYTECODE': '1'})
    for _ in range(50):
        if Path('/tmp/.X11-unix/X'+str(display)).exists():
            break
        __import__('time').sleep(0.1)
    os.chdir('/server/runtime')
    command = arguments(value, payload['port'])
    os.execv(command[0], command)
