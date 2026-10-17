#!/usr/bin/python3 -I
"""Fixed Open Fortress SDK layout; only reviewed assets enter this namespace."""
import json
import os
from pathlib import Path
import re
import stat

SDK_ALIASES = frozenset(('datacache', 'dedicated', 'engine', 'materialsystem',
                        'replay', 'scenefilecache', 'shaderapiempty',
                        'soundemittersystem', 'studiorender', 'vphysics'))
MUTABLE = frozenset(('cfg', 'download', 'downloadlists', 'custom', 'logs', 'replay', 'cache'))


def mounts(descriptor):
    if type(descriptor) is not int or descriptor < 0:
        raise ValueError('Retained Open Fortress descriptor required')
    public = Path('/proc/self/fd')/str(descriptor)
    result = []
    def bind(relative, target):
        source = public/relative
        info = source.lstat()
        if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)) or source.is_symlink():
            raise ValueError('Unsafe Open Fortress package binding')
        result.extend(['--ro-bind', str(source), '/server/runtime/'+target])
    for name in ('hl2', 'platform'):
        bind(name, name)
    for name in sorted(os.listdir(public/'bin')):
        stem = name[:-3] if name.endswith('.so') else ''
        bind('bin/'+(stem+'_srv.so' if stem in SDK_ALIASES else name), 'bin/'+name)
    mod = public/'open_fortress'
    for name in sorted(os.listdir(mod)):
        if name in MUTABLE or name in ('modelsounds.cache', 'bin', 'maps', 'gameinfo.txt') or re.fullmatch(r'console.*\.log', name):
            continue
        bind('open_fortress/'+name, 'open_fortress/'+name)
    for name in sorted(os.listdir(mod/'bin')):
        bind('open_fortress/bin/'+('server.so' if name == 'server_srv.so' else name),
             'open_fortress/bin/'+name)
    for name in sorted(os.listdir(mod/'maps')):
        if name != 'graphs':
            bind('open_fortress/maps/'+name, 'open_fortress/maps/'+name)
    return result


def private_directory(root, relative):
    current = root
    for part in Path(relative).parts:
        current /= part
        current.mkdir(mode=0o700, exist_ok=True)
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private Open Fortress directory')
    return current


def prepare(root, public, hook, value, port):
    # The imported module is an immutable root-installed dependency, not a
    # private file or game plugin. It owns all Source text/slot validation.
    hook.settings(json.dumps(value), port, 'open-fortress')
    for relative in ('runtime/bin', 'runtime/open_fortress/bin',
                     'runtime/open_fortress/maps/graphs', '.steam/sdk32'):
        private_directory(root, relative)
    for name in MUTABLE:
        private_directory(root, 'runtime/open_fortress/'+name)
    cfg = root/'runtime/open_fortress/cfg'
    # Defaults come only from the retained reviewed SDK/mod package. Preserve
    # customer choices; refuse links rather than following an old shared tree.
    for parent, dirs, files in os.walk(public/'defaults/cfg', followlinks=False):
        relative = Path(parent).relative_to(public/'defaults/cfg')
        target = private_directory(root, str(Path('runtime/open_fortress/cfg')/relative))
        for name in dirs:
            if (Path(parent)/name).is_symlink():
                raise ValueError('Linked Open Fortress default directory')
        for name in files:
            source = Path(parent)/name
            info = source.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_size > 1024**2:
                raise ValueError('Invalid Open Fortress default')
            destination = target/name
            if destination.exists() or destination.is_symlink():
                existing = destination.lstat()
                if not stat.S_ISREG(existing.st_mode) or existing.st_nlink != 1 or existing.st_uid != os.getuid() or existing.st_mode & 0o077:
                    raise ValueError('Unsafe Open Fortress private default')
            else:
                hook.private_write(destination, source.read_text(encoding='utf-8'))
    hook.prepare(root, value, port, 'open-fortress')
    generated = (root/'private-cfg/playbound.cfg').read_text()
    hook.private_write(cfg/'playbound-managed.cfg', generated)
    template = public/'open_fortress/gameinfo.txt'
    if template.stat().st_size > 262144:
        raise ValueError('Open Fortress gameinfo exceeds limit')
    content = template.read_text(encoding='utf-8')
    content = content.replace('/opt/playbound-host/games/team-fortress-2/', '/tf2/')
    if '/opt/' in content or '/var/lib/' in content:
        raise ValueError('Unreviewed Open Fortress host reference')
    hook.private_write(root/'runtime/open_fortress/gameinfo.txt', content)


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/srcds_linux').is_file():
        raise SystemExit('Reserved runtime namespace required')
    import importlib.machinery
    hook = importlib.machinery.SourceFileLoader('source_contract', '/source-contract.py').load_module()
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = hook.settings(json.dumps(payload['configuration']), payload['port'], 'open-fortress')
    prepare(Path('/server'), Path('/game-data'), hook, value, payload['port'])
    command = hook.arguments(value, payload['port'], 'open-fortress')
    os.chdir('/server/runtime')
    os.execv(command[0], command)
