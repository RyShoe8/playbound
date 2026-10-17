#!/usr/bin/python3 -I
"""Candidate Core Keeper private-data/display bootstrap; not enrolled yet."""
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import tempfile
import time


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid Core Keeper configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers'}:
        raise ValueError('Undeclared Core Keeper setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 80 or re.search(r'[\x00-\x1f\x7f]', value['name']):
        raise ValueError('Invalid Core Keeper name')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64 or type(port) is not int or not 1300 <= port <= 1320 or (port-1300) % 2:
        raise ValueError('Invalid Core Keeper allocation')
    return value


def prepare(root, value, port):
    settings(json.dumps(value), port)
    directory = root/'data'
    directory.mkdir(mode=0o700, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Unsafe Core Keeper data directory')
    config = directory/'ServerConfig.json'
    try:
        descriptor = os.open(config, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        existing = {}
    else:
        with os.fdopen(descriptor, 'rb') as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 262144:
                raise ValueError('Unsafe Core Keeper configuration file')
            content = source.read(262145)
            if len(content) > 262144:
                raise ValueError('Core Keeper configuration exceeds limit')
            existing = json.loads(content)
        if not isinstance(existing, dict):
            raise ValueError('Invalid Core Keeper configuration object')
    # Identity, seed and existing world selection belong to the saved instance.
    # The requested name applies to a fresh world, not a silently renamed save.
    for key, default in {'gameId': '', 'world': 0, 'worldName': value['name'],
                         'worldSeed': 0, 'maxNumberPacketsSentPerFrame': 1}.items():
        existing.setdefault(key, default)
    existing['maxNumberPlayers'] = value['maxPlayers']
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-corekeeper-', dir=directory)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as target:
            json.dump(existing, target)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, config)
        parent = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def arguments(value, port):
    settings(json.dumps(value), port)
    # Keep GPU initialization: -nographics stalls this game's world generation.
    return ['/game-data/CoreKeeperServer', '-batchmode', '-ip', '0.0.0.0',
            '-port', str(port), '-maxplayers', str(value['maxPlayers']),
            '-datapath', '/server/data', '-logfile', '/server/data/server.log']


def supervise(value, port, display_helper):
    settings(json.dumps(value), port)
    game = None
    display = None
    stopping = False
    previous = {}
    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True
    try:
        for number in (signal.SIGTERM, signal.SIGINT):
            previous[number] = signal.signal(number, stop)
        display = display_helper.start()  # refuses a missing/wrong enforced IPC label
        if stopping:
            return 143
        environment = {'PATH': '/usr/bin:/bin', 'HOME': '/server', 'LANG': 'C.UTF-8',
                       'LD_LIBRARY_PATH': '/game-data:/game-data/linux64',
                       **display.environment}
        game = subprocess.Popen(arguments(value, port), cwd='/game-data', env=environment,
                                close_fds=True)
        while game.poll() is None:
            if stopping or display.process.poll() is not None:
                game.terminate()
                try:
                    game.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    game.kill()
                    game.wait(timeout=2)
                return 143 if stopping else 1
            time.sleep(0.1)
        return game.returncode if game.returncode >= 0 else 1
    finally:
        try:
            if game is not None and game.poll() is None:
                game.kill()
                game.wait(timeout=2)
        finally:
            try:
                if display is not None:
                    display.close()
            finally:
                for number, handler in previous.items():
                    signal.signal(number, handler)


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/CoreKeeperServer').is_file():
        raise SystemExit('Reserved runtime namespace required')
    import importlib.machinery
    helper = importlib.machinery.SourceFileLoader('display_helper', '/display-helper.py').load_module()
    # No file preparation or engine launch before the enforced-label guard.
    helper.verify_current()
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), value, payload['port'])
    raise SystemExit(supervise(value, payload['port'], helper))
