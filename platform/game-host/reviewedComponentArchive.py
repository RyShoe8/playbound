#!/usr/bin/python3
"""Read one checksum-pinned engine; never extract package paths or save data."""
import hashlib
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import tarfile


def extract(archive, destination, profile):
    if Path(destination).exists() or Path(destination).is_symlink():
        raise ValueError('output must be new')
    member = profile['member']
    if member.startswith('/') or '\\' in member or any(p in ('', '.', '..') for p in member.split('/')):
        raise ValueError('invalid reviewed member')
    if profile['format'] == 'tar':
        with tarfile.open(archive) as bundle:
            matches = []
            for i, entry in enumerate(bundle):
                if i > 10000: raise ValueError('too many archive entries')
                if entry.name == member: matches.append(entry)
            if len(matches) != 1 or not matches[0].isfile() or matches[0].size != profile['bytes']:
                raise ValueError('missing, duplicate or special engine')
            with bundle.extractfile(matches[0]) as source:
                data = source.read(profile['bytes'] + 1)
    elif profile['format'] == '7z':
        # Archive bytes have already been pinned. No paths are ever written by 7z.
        listing = subprocess.run(['/usr/bin/7z', 'l', '-slt', str(archive)], check=True, timeout=30, stdout=subprocess.PIPE).stdout
        if len(listing) > 1024*1024 or listing.decode().splitlines().count('Path = '+member) != 1:
            raise ValueError('duplicate or missing engine')
        child = subprocess.Popen(['/usr/bin/7z', 'x', '-so', str(archive), member], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            data = child.stdout.read(profile['bytes'] + 1)
            if len(data) > profile['bytes']: raise ValueError('oversized engine')
            if child.wait(timeout=30) != 0: raise ValueError('7z failed')
        finally:
            if child.poll() is None: child.kill()
            child.wait(); child.stdout.close()
    else: raise ValueError('unsupported archive')
    if len(data) != profile['bytes'] or hashlib.sha256(data).hexdigest() != profile['sha256']:
        raise ValueError('engine checksum mismatch')
    fd = os.open(destination, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o755)
    with os.fdopen(fd, 'wb') as out:
        out.write(data); out.flush(); os.fsync(out.fileno())


if __name__ == '__main__':
    try:
        if len(sys.argv) != 4: raise ValueError('fixed key, archive and output required')
        resource.setrlimit(resource.RLIMIT_AS, (256*1024**2, 256*1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
        resource.setrlimit(resource.RLIMIT_FSIZE, (32*1024**2, 32*1024**2))
        profiles = json.loads(Path(__file__).with_name('reviewedComponentProfiles.json').read_text())
        extract(sys.argv[2], sys.argv[3], profiles[sys.argv[1]])
    except Exception:
        print('Reviewed component archive failed bounded validation', file=sys.stderr)
        sys.exit(1)
