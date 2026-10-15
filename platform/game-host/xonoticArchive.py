#!/usr/bin/python3
"""Extract only the reviewed dedicated ELF, never maps/scripts/shared assets."""
import hashlib
import json
import os
from pathlib import Path
import resource
import stat
import sys
import zipfile

PROFILE = json.loads(Path(__file__).with_name('xonotic086.json').read_text())


def extract(archive, destination, profile=PROFILE):
    with open(archive, 'rb') as source:
        if os.fstat(source.fileno()).st_size != profile['archiveBytes'] or hashlib.file_digest(source, 'sha512').hexdigest() != profile['archiveSha512']:
            raise ValueError('Xonotic archive checksum mismatch')
        source.seek(0)
        with zipfile.ZipFile(source) as bundle:
            entries = bundle.infolist()
            if len(entries) > 100000: raise ValueError('Xonotic archive has too many entries')
            found, total = [], 0
            for entry in entries:
                name = entry.filename.rstrip('/')
                if not name or name.startswith('/') or '\\' in name or any(part in ('', '.', '..') for part in name.split('/')) or any(ord(c) < 32 or ord(c) == 127 for c in name):
                    raise ValueError('Unsafe Xonotic archive path')
                total += entry.file_size
                if entry.file_size < 0 or entry.file_size > 1024**3 or total > 8 * 1024**3:
                    raise ValueError('Xonotic archive exceeds inventory limits')
                if name == profile['member']: found.append(entry)
            if len(found) != 1: raise ValueError('Missing or duplicate Xonotic native file')
            entry = found[0]
            mode = entry.external_attr >> 16
            if entry.is_dir() or stat.S_IFMT(mode) not in (0, stat.S_IFREG) or mode & 0o7000 or entry.file_size != profile['binaryBytes']:
                raise ValueError('Unsafe Xonotic native file')
            fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o755)
            with os.fdopen(fd, 'wb') as output, bundle.open(entry) as native:
                digest, size = hashlib.sha256(), 0
                while block := native.read(65536):
                    size += len(block)
                    if size > profile['binaryBytes']: raise ValueError('Xonotic native size exceeds review')
                    digest.update(block); output.write(block)
                if size != profile['binaryBytes'] or digest.hexdigest() != profile['binarySha256']:
                    raise ValueError('Xonotic native checksum mismatch')
                output.flush(); os.fsync(output.fileno())


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3: raise ValueError('Fixed archive and destination required')
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (90, 90))
        resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024**2, 16 * 1024**2))
        extract(sys.argv[1], sys.argv[2])
    except Exception:
        print('Xonotic archive failed bounded native-file validation', file=sys.stderr)
        sys.exit(1)
