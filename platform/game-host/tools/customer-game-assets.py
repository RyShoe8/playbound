"""Seal the fixed, reviewed Hurry Curry data set; never mount shared state.

Only root's asset manifest selects bytes. Requests cannot choose a source,
destination, checksum or extra file. Unlisted installation files stay hidden.
"""
import fcntl
import hashlib
import importlib.machinery
import json
import os
from pathlib import Path
import re
import stat

PROFILE = Path('/usr/local/libexec/playbound-customer-hurry-assets.json')
SOURCE = Path('/opt/playbound-host/games/hurry-curry/data')


def seal_assets(source=SOURCE, profile_path=PROFILE):
    engine_file = Path('/usr/local/libexec/playbound-customer-native-engine')
    info = engine_file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022:
        raise ValueError('Untrusted descriptor helper')
    engines = importlib.machinery.SourceFileLoader('pb_asset_descriptors', str(engine_file)).load_module()
    with os.fdopen(engines.open_regular(profile_path), 'rb') as manifest:
        info = os.fstat(manifest.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022 or info.st_size > 32768:
            raise ValueError('Untrusted game asset manifest')
        rows = json.load(manifest)['files']
    if not isinstance(rows, list) or not 1 <= len(rows) <= 128:
        raise ValueError('Invalid asset inventory')
    seen, total, result = set(), 0, []
    try:
        for row in rows:
            relative = row.get('path')
            if not isinstance(relative, str) or not re.fullmatch(r'[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.yaml', relative) or relative in seen:
                raise ValueError('Invalid asset path')
            seen.add(relative)
            size = row.get('bytes')
            if type(size) is not int or not 0 <= size <= 1024**2 or not re.fullmatch(r'[a-f0-9]{64}', str(row.get('sha256'))):
                raise ValueError('Invalid asset pin')
            total += size
            if total > 8*1024**2:
                raise ValueError('Asset budget exceeded')
            with os.fdopen(engines.open_regular(source / relative), 'rb') as asset:
                before = os.fstat(asset.fileno())
                if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_mode & 0o7022 or before.st_size != size:
                    raise ValueError('Unsafe game asset')
                data = asset.read(size+1)
                after = os.fstat(asset.fileno())
                if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns) != (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or len(data) != size or hashlib.sha256(data).hexdigest() != row['sha256']:
                    raise ValueError('Game asset differs from its reviewed pin')
            descriptor = os.memfd_create('pb-game-data', os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
            result.append((descriptor, '/game-data/'+relative))
            view = memoryview(data)
            while view:
                written = os.write(descriptor, view)
                if not written: raise ValueError('Asset descriptor copy failed')
                view = view[written:]
            os.lseek(descriptor, 0, os.SEEK_SET)
            os.fchmod(descriptor, 0o444)
            fcntl.fcntl(descriptor, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
        return result
    except BaseException:
        for descriptor, _ in result: os.close(descriptor)
        raise
