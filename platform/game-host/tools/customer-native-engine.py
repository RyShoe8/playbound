"""Fixed reviewed native engine selection for the root UID supervisor.

Copy reviewed bytes into a sealed descriptor before dropping privileges.
The agent cannot switch a pathname between verification and the namespace bind.
No executable path, digest or profile is accepted from the runtime request.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat

ENGINE = Path('/opt/playbound-host/games/teeworlds/teeworlds-server')
PROFILE = Path('/usr/local/libexec/playbound-package-native/nativePackageProfiles.json')
ENGINES = {
    'teeworlds': ('teeworlds-server', '/usr/games/teeworlds-server'),
    'bzflag': ('bzfs', '/usr/games/bzfs'),
    'hedgewars': ('hedgewars-server', '/usr/lib/hedgewars/bin/hedgewars-server'),
    'openttd': ('openttd', '/usr/games/openttd'),
    'luanti': ('minetestserver', '/usr/games/minetestserver'),
}

def sealed_engine_for(game):
    if game not in ENGINES:
        raise ValueError('Unsupported reviewed native engine')
    binary, target = ENGINES[game]
    return sealed_engine(Path('/opt/playbound-host/games') / game / binary, PROFILE, game), target



def open_regular(path):
    """Retain no-follow directory descriptors, including writable agent parents."""
    directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        return os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    finally:
        os.close(directory)


def sealed_engine(engine=ENGINE, profile_path=PROFILE, game='teeworlds'):
    if game not in ENGINES:
        raise ValueError('Unsupported reviewed native engine')
    # Only an absent installation uses the unchanged system-package path.
    # A partial, linked or modified managed installation must fail closed.
    try:
        engine.parent.lstat()
    except FileNotFoundError:
        return None
    profile_fd = open_regular(profile_path)
    with os.fdopen(profile_fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > 32768:
            raise ValueError('Untrusted engine profile')
        profile = json.load(source)[game]
    source_fd = open_regular(engine)
    destination = None
    try:
        before = os.fstat(source_fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or before.st_nlink != 1 or before.st_mode & 0o7022 or not before.st_mode & 0o111 or before.st_size != profile['binaryBytes']:
            raise ValueError('Untrusted managed engine')
        destination = os.memfd_create('playbound-' + game + '-reviewed', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
        digest = hashlib.sha256()
        remaining = before.st_size
        while remaining:
            block = os.read(source_fd, min(65536, remaining))
            if not block: raise ValueError('Incomplete managed engine')
            digest.update(block)
            view = memoryview(block)
            while view:
                written = os.write(destination, view)
                if not written: raise ValueError('Engine copy failed')
                view = view[written:]
            remaining -= len(block)
        after = os.fstat(source_fd)
        if os.read(source_fd, 1) or (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) or digest.hexdigest() != profile['binarySha256']:
            raise ValueError('Managed engine differs from its reviewed build')
        os.fchmod(destination, 0o555)
        os.lseek(destination, 0, os.SEEK_SET)
        fcntl.fcntl(destination, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
        result, destination = destination, None
        return result
    finally:
        os.close(source_fd)
        if destination is not None: os.close(destination)
