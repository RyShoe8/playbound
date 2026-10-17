#!/usr/bin/python3 -I
"""Candidate Core Keeper private-data/display bootstrap; not enrolled yet."""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile


def identity_mounts(root, uid):
    """Root-supervisor-only pinned private files for the immutable bundle mounts.

    Never mount a re-opened customer-controlled path after validating it. Keep
    these descriptors until bubblewrap has consumed the root-built command.
    """
    if os.geteuid() != 0 or type(uid) is not int or not 40000 <= uid <= 40255:
        raise ValueError('Root supervisor and reserved identity required')
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    result = []
    try:
        info = os.fstat(directory)
        if info.st_uid != uid or stat.S_IMODE(info.st_mode) != 0o700:
            raise ValueError('Unsafe private Core Keeper workspace')
        for name in ('GameInfo.txt', 'GameID.txt'):
            descriptor = None
            try:
                try:
                    descriptor = os.open(name, os.O_RDONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
                except FileExistsError:
                    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
                else:
                    os.fchown(descriptor, uid, uid)
                info = os.fstat(descriptor)
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_gid != uid
                        or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600
                        or info.st_size > 16384):
                    raise ValueError('Unsafe private Core Keeper identity mount')
                result.append((descriptor, name))
                descriptor = None
            finally:
                if descriptor is not None:
                    os.close(descriptor)
        return result
    except BaseException:
        for descriptor, _ in result:
            os.close(descriptor)
        raise
    finally:
        os.close(directory)


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
    current = root
    for part in ('.steam', 'sdk64'):
        current /= part
        current.mkdir(mode=0o700, exist_ok=True)
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe Core Keeper Steam directory')
    link = current/'steamclient.so'
    expected = '/game-data/linux64/steamclient.so'
    try:
        info = link.lstat()
    except FileNotFoundError:
        link.symlink_to(expected)
    else:
        if not stat.S_ISLNK(info.st_mode) or info.st_uid != os.getuid() or os.readlink(link) != expected:
            raise ValueError('Unreviewed Core Keeper Steam library binding')
    # Fixed private output files back the read-only bundle's empty mountpoints.
    for name in ('GameInfo.txt', 'GameID.txt'):
        file = root/name
        try:
            descriptor = os.open(file, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            info = file.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 16384:
                raise ValueError('Unsafe Core Keeper identity output')
        else:
            os.close(descriptor)
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
    def launch(display_environment):
        environment = {'PATH': '/usr/bin:/bin', 'HOME': '/server', 'LANG': 'C.UTF-8',
                       'LD_LIBRARY_PATH': '/game-data:/game-data/linux64',
                       **display_environment}
        return subprocess.Popen(arguments(value, port), cwd='/game-data',
                                env=environment, close_fds=True, umask=0o077,
                                stdin=subprocess.PIPE)
    return display_helper.supervise_game(launch, display_helper.start)


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/CoreKeeperServer').is_file():
        raise SystemExit('Reserved runtime namespace required')
    import importlib.util
    spec = importlib.util.spec_from_file_location('display_helper', '/display-helper.py')
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    # No file preparation or engine launch before the enforced-label guard.
    helper.verify_current()
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), value, payload['port'])
    raise SystemExit(supervise(value, payload['port'], helper))
