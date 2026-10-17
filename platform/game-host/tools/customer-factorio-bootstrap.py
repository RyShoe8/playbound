#!/usr/bin/python3 -I
"""Candidate in-namespace Factorio bootstrap, never a host provisioning command.

The root supervisor must mount this reviewed file read-only and start it only
AFTER UID/cgroup/network isolation. No paths, programs or flags are caller inputs.
This candidate is not yet registered as an accepted runtime profile.
"""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import tempfile
import signal

ENGINE = '/game-data/bin/x64/factorio'
DATA = Path('/server')
CREATE_TIMEOUT = 600


def settings(text):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid Factorio configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers', 'port'}:
        raise ValueError('Undeclared Factorio setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 64 or re.search(r'[\x00-\x1f\x7f]', value['name']):
        raise ValueError('Invalid Factorio name')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64:
        raise ValueError('Invalid Factorio player limit')
    if type(value['port']) is not int or not 34197 <= value['port'] <= 34217:
        raise ValueError('Invalid Factorio port')
    return value


def world_ready(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or not 0 < info.st_size <= 2 * 1024 ** 3:
        raise ValueError('Unsafe Factorio world')
    return True


def wait_for_world(child, owner_alive, clock=time.monotonic, sleep=time.sleep):
    deadline = clock() + CREATE_TIMEOUT
    try:
        while True:
            if not owner_alive():
                raise ValueError('Factorio runtime cancelled')
            result = child.poll()
            if result is not None:
                if result != 0:
                    raise ValueError('Factorio world creation failed')
                return
            if clock() >= deadline:
                raise ValueError('Factorio world creation timed out')
            sleep(0.1)
    except BaseException:
        if child.poll() is None:
            child.kill()
        child.wait()
        raise


def create_world(world, spawn, owner_alive, clock=time.monotonic, sleep=time.sleep):
    if not owner_alive():
        raise ValueError('Factorio runtime cancelled')
    if world_ready(world):
        return False
    temporary = world.with_name('playbound-creating.zip')
    # A failed previous attempt must be reviewed/removed by the protected file
    # path. Never load or overwrite an unidentified partial world automatically.
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('Incomplete Factorio world requires recovery')
    child = spawn([ENGINE, '--config', '/server/config.ini', '--create', '/server/saves/playbound-creating.zip'])
    wait_for_world(child, owner_alive, clock, sleep)
    if not owner_alive():
        raise ValueError('Factorio runtime cancelled')
    if not world_ready(temporary):
        raise ValueError('Factorio did not create a world')
    # Bootstrap is the only game process during creation. Tenant data must be
    # quiescent before launch; a concurrent destination is an invalid state.
    if world.exists() or world.is_symlink():
        raise ValueError('Factorio world changed during creation')
    descriptor = os.open(temporary, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    # Exclusive link publication cannot replace a destination created between
    # the check and publication. The complete file is visible atomically.
    try:
        os.link(temporary, world, follow_symlinks=False)
    except FileExistsError:
        raise ValueError('Factorio world changed during creation')
    temporary.unlink()
    directory = os.open(world.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return True


def server_args(value):
    return [ENGINE, '--config', '/server/config.ini', '--start-server', '/server/saves/save.zip',
            '--server-settings', '/server/server-settings.json', '--port', str(value['port']), '--bind', '0.0.0.0']


def write_configuration(value):
    configuration = {'name': value['name'], 'description': 'Hosted by PlayBound',
                     'tags': [], 'max_players': value['maxPlayers'],
                     'visibility': {'public': False, 'lan': False},
                     'require_user_verification': True, 'allow_commands': 'admins-only',
                     'autosave_interval': 10, 'autosave_slots': 5,
                     'auto_pause': True, 'autosave_only_on_server': True}
    for name, content in [('config.ini', '[path]\nread-data=/game-data/data\nwrite-data=/server\n'),
                          ('server-settings.json', json.dumps(configuration))]:
        descriptor, filename = tempfile.mkstemp(prefix='.pb-config-', dir=DATA)
        try:
            with os.fdopen(descriptor, 'w') as output:
                output.write(content);output.flush();os.fsync(output.fileno())
            os.replace(filename, DATA / name)
        finally:
            if os.path.exists(filename):os.unlink(filename)


def main():
    # A mistaken operator invocation must never create a host-side world.
    if not 40000 <= os.getuid() <= 40255:
        raise ValueError('Factorio bootstrap requires the reserved runtime namespace')
    if not Path('/game-data/bin/x64/factorio').is_file() or not DATA.is_dir():
        raise ValueError('Missing immutable Factorio namespace mounts')
    value = settings((DATA / 'server.cfg').read_text())
    write_configuration(value)
    cancelled = False
    def stop(_signal, _frame):
        nonlocal cancelled
        cancelled = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    create_world(DATA / 'saves/save.zip', lambda args: subprocess.Popen(args, stdin=subprocess.DEVNULL), lambda: not cancelled)
    if cancelled:raise ValueError('Factorio runtime cancelled')
    signal.signal(signal.SIGTERM, signal.SIG_DFL)
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    os.execv(ENGINE, server_args(value))


if __name__ == '__main__':
    main()
