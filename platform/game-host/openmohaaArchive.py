#!/usr/bin/python3
import hashlib
import json
import os
from pathlib import Path
import resource
import stat
import sys
import zipfile


def extract(archive, destination, profile):
    root = Path(destination)
    if root.exists() or root.is_symlink(): raise ValueError('output must be new')
    root.mkdir(mode=0o700)
    seen = set()
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        if len(entries) != len(profile['files']): raise ValueError('unexpected archive inventory')
        for entry in entries:
            expected = profile['files'].get(entry.filename)
            mode = entry.external_attr >> 16
            if not expected or entry.filename in seen or entry.is_dir() or entry.file_size != expected['bytes'] or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or mode & 0o7000:
                raise ValueError('unexpected or unsafe native entry')
            seen.add(entry.filename)
            if '/' in entry.filename or '\\' in entry.filename or entry.filename in ('.', '..'): raise ValueError('unsafe native path')
            fd = os.open(root/entry.filename, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o755)
            with os.fdopen(fd, 'wb') as out, bundle.open(entry) as source:
                digest, size = hashlib.sha256(), 0
                while block := source.read(65536):
                    size += len(block)
                    if size > expected['bytes']: raise ValueError('entry exceeds review')
                    digest.update(block); out.write(block)
                if size != expected['bytes'] or digest.hexdigest() != expected['sha256']: raise ValueError('native checksum mismatch')
                out.flush(); os.fsync(out.fileno())


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3: raise ValueError('fixed archive and destination required')
        resource.setrlimit(resource.RLIMIT_AS, (128*1024**2, 128*1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (45, 45))
        resource.setrlimit(resource.RLIMIT_FSIZE, (32*1024**2, 32*1024**2))
        extract(sys.argv[1], sys.argv[2], json.loads(Path(__file__).with_name('openmohaaRelease.json').read_text()))
    except Exception:
        print('OpenMoHAA archive failed bounded native validation', file=sys.stderr)
        sys.exit(1)
