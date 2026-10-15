#!/usr/bin/python3
"""Fixed root-owned file promotion. No arbitrary destination, command or bytes."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid

ROOT = Path('/opt/playbound-host/games')
PROFILES = json.loads(Path(__file__).with_name('nativePackageProfiles.json').read_text())


def promote(game, operation, root=ROOT, profiles=PROFILES):
    if os.geteuid() != 0 or game not in profiles or not re.fullmatch(r'[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}', operation):
        raise ValueError('invalid promotion request')
    profile = profiles[game]
    directory = root / ('.pb-update-' + game + '-' + operation)
    # Open each directory without following links, retaining descriptors across
    # concurrent renames. The caller supplies only a game and operation UUID.
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    descriptors = [descriptor]
    temporary = None
    try:
        for component in directory.parts[1:]:
            descriptor = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            descriptors.append(descriptor)
        source = os.open(profile['binary'], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor)
        try:
            before = os.fstat(source)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size != profile['binaryBytes']:
                raise ValueError('unsafe native source')
            digest = hashlib.sha256()
            temporary = '.root-native-' + str(uuid.uuid4())
            output = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o755, dir_fd=descriptor)
            try:
                size = 0
                while chunk := os.read(source, 1024 * 1024):
                    size += len(chunk)
                    if size > profile['binaryBytes']:
                        raise ValueError('native source grew')
                    digest.update(chunk)
                    offset = 0
                    while offset < len(chunk):
                        written = os.write(output, chunk[offset:])
                        if not written:
                            raise ValueError('native write failed')
                        offset += written
                after = os.fstat(source)
                if size != profile['binaryBytes'] or digest.hexdigest() != profile['binarySha256'] or (before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise ValueError('native source differs from reviewed package')
                os.fchmod(output, 0o755)
                os.fchown(output, 0, 0)
                os.fsync(output)
            finally:
                os.close(output)
            os.rename(temporary, profile['binary'], src_dir_fd=descriptor, dst_dir_fd=descriptor)
            temporary = None
            os.fsync(descriptor)
        finally:
            os.close(source)
    finally:
        if temporary:
            os.unlink(temporary, dir_fd=descriptor)
        for item in reversed(descriptors):
            os.close(item)


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ValueError('fixed game and operation required')
        promote(*sys.argv[1:])
        print(json.dumps({'ok': True}))
    except Exception:
        print('Reviewed native promotion refused', file=sys.stderr)
        sys.exit(1)
