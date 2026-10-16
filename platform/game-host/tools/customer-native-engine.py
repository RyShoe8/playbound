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
    'openarena': ('openarena-server', '/usr/lib/ioquake3/ioq3ded'),
    'battle-for-wesnoth': ('wesnothd', '/usr/games/wesnothd-1.18'),
    'supertuxkart': ('supertuxkart', '/usr/games/supertuxkart'),
    '0-ad': ('pyrogenesis', '/usr/games/pyrogenesis'),
    'flightgear': ('fgms', '/engine-native'),
    'hurry-curry': ('hurrycurry-server', '/engine-native'),
}

def sealed_engine_for(game):
    if game in ('ysoccer','mindustry'):
        return sealed_java_engine(game=game), '/engine.jar'
    if game == 'hurry-curry':
        root=Path('/usr/local/libexec/playbound-isolated-hurry')
        descriptor=sealed_engine(root/'hurrycurry-server',root/'profile.json',game)
        if descriptor is None: raise ValueError('Reviewed isolated Hurry Curry engine is not installed')
        return descriptor, '/engine-native'
    if game == 'flightgear':
        root=Path('/usr/local/libexec/playbound-isolated-flightgear')
        descriptor=sealed_engine(root/'fgms',root/'profile.json',game)
        if descriptor is None: raise ValueError('Reviewed isolated FlightGear engine is not installed')
        return descriptor, '/engine-native'
    if game == 'supertuxkart':
        # The stock engine probes bind-zero sockets during startup, which
        # conflicts with the reviewed port fence. Never silently fall back.
        root=Path('/usr/local/libexec/playbound-isolated-stk')
        descriptor=sealed_engine(root/'supertuxkart',root/'profile.json',game)
        if descriptor is None: raise ValueError('Reviewed isolated SuperTuxKart engine is not installed')
        return descriptor, '/usr/games/supertuxkart'
    if game not in ENGINES:
        raise ValueError('Unsupported reviewed native engine')
    binary, target = ENGINES[game]
    return sealed_engine(Path('/opt/playbound-host/games') / ('0ad' if game == '0-ad' else game) / binary, PROFILE, game), target


def sealed_java_engine(engine=Path('/opt/playbound-host/games/ysoccer/ysoccer-server.jar'), profile_path=Path('/usr/local/libexec/playbound-customer-java-profiles.json'), game='ysoccer'):
    if game not in ('ysoccer','mindustry'): raise ValueError('Unsupported isolated Java engine')
    if game == 'mindustry': engine=Path('/opt/playbound-host/games/mindustry/server-release.jar')
    profile_fd = open_regular(profile_path)
    with os.fdopen(profile_fd,'rb') as source:
        info=os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1 or info.st_mode&0o022 or info.st_size>32768:
            raise ValueError('Untrusted Java engine profiles')
        profile=json.load(source)[game]
    if profile['jar']!=('ysoccer-server.jar' if game=='ysoccer' else 'server-release.jar') or profile['java']!='/usr/bin/java':
        raise ValueError('Java runtime contract changed')
    source_fd=open_regular(engine)
    destination=None
    try:
        before=os.fstat(source_fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_mode&0o7022 or not 0<before.st_size<=128*1024**2:
            raise ValueError('Unsafe Java engine file')
        destination=os.memfd_create('playbound-'+game+'-reviewed',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
        digest=hashlib.sha256()
        remaining=before.st_size
        while remaining:
            block=os.read(source_fd,min(65536,remaining))
            if not block: raise ValueError('Incomplete Java engine')
            digest.update(block)
            view=memoryview(block)
            while view:
                written=os.write(destination,view)
                if not written: raise ValueError('Java engine copy failed')
                view=view[written:]
            remaining-=len(block)
        after=os.fstat(source_fd)
        if os.read(source_fd,1) or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or not any(row['bytes']==before.st_size and row['sha256']==digest.hexdigest() for row in profile['versions']):
            raise ValueError('Java engine differs from reviewed releases')
        os.lseek(destination,0,os.SEEK_SET)
        if os.read(destination,4)!=b'PK\x03\x04': raise ValueError('Invalid Java archive')
        os.lseek(destination,0,os.SEEK_SET)
        os.fchmod(destination,0o444)
        fcntl.fcntl(destination,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
        result,destination=destination,None
        return result
    finally:
        os.close(source_fd)
        if destination is not None: os.close(destination)



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
        profiles = json.load(source)
        profile = profiles['0ad' if game == '0-ad' else game]
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
