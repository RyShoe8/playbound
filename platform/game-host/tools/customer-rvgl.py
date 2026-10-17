"""RVGL private layout candidate. Not installed or enrolled as a runtime."""
import os
import json
from pathlib import Path
import stat
import subprocess

PUBLIC_DIRECTORIES = ('cars', 'cups', 'gallery', 'gfx', 'icons', 'levels', 'lib',
                      'licenses', 'models', 'packs', 'redbook', 'shaders', 'strings', 'wavs')
PRIVATE_DIRECTORIES = ('profiles', 'cache', 'replays', 'times', 'edit')


def configuration(text):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid RVGL configuration')
    value = json.loads(text)
    if (not isinstance(value, dict) or set(value) != {'configuration','port'}
            or value['configuration'] != {}):
        raise ValueError('RVGL candidate accepts only its fixed lobby configuration')
    arguments(value['port'])
    return value['port']


def mounts(descriptor):
    if type(descriptor) is not int or descriptor < 0:
        raise ValueError('Retained RVGL asset descriptor required')
    public = Path('/proc/self/fd')/str(descriptor)
    result = []
    for name in ('rvgl.64', 'gamecontrollerdb.txt', *PUBLIC_DIRECTORIES):
        source = public/name
        info = source.lstat()
        expected = stat.S_ISDIR if name in PUBLIC_DIRECTORIES else stat.S_ISREG
        if not expected(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o222:
            raise ValueError('Unsafe RVGL package binding')
        result.extend(['--ro-bind', str(source), '/server/runtime/'+name])
    # Publication flattens the single reviewed upstream alias into a pinned
    # regular file. The entire library directory stays read-only.
    alias = public/'lib/libunistring.so.2'
    info = alias.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o222:
        raise ValueError('Unsafe RVGL library alias')
    return result


def prepare(root):
    # Root is the per-UID namespace's private data directory. Never copy a
    # shared PlayBound profile, record, replay or cache into another identity.
    for relative in ('runtime', *('runtime/'+name for name in PRIVATE_DIRECTORIES)):
        directory = root/relative
        directory.mkdir(mode=0o700, exist_ok=True)
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe RVGL private directory')


def arguments(port):
    if type(port) is not int or not 2310 <= port <= 2330:
        raise ValueError('Invalid RVGL allocation')
    return ['/server/runtime/rvgl.64', '-lobby', '-profile', 'PlayBound',
            '-serverport', str(port), '-nosound', '-window', '640', '480']


def supervise(port, display_helper):
    command = arguments(port)
    def launch(display_environment):
        environment = {'PATH': '/usr/bin:/bin', 'HOME': '/server', 'LANG': 'C.UTF-8',
                       'ALSOFT_DRIVERS': 'null', 'SDL_AUDIODRIVER': 'dummy',
                       'LD_LIBRARY_PATH': '/server/runtime/lib:/server/runtime/lib/lib64',
                       **display_environment}
        return subprocess.Popen(command, cwd='/server/runtime', env=environment,
                                close_fds=True, stdin=subprocess.DEVNULL)
    return display_helper.supervise_game(launch, display_helper.start)


if __name__ == '__main__':
    import importlib.util
    if not 40000 <= os.getuid() <= 40255:
        raise SystemExit('Reserved runtime namespace required')
    spec = importlib.util.spec_from_file_location('private_display', '/display-helper.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    helper.verify_current()
    port = configuration(Path('/server/server.cfg').read_text())
    prepare(Path('/server'))
    raise SystemExit(supervise(port, helper))
