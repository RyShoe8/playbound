#!/usr/bin/python3
"""Extract only the publisher-reviewed headless engine, Legacy mod and licenses."""
import hashlib
import json
import os
from pathlib import Path
import resource
import sys
import tarfile


def extract(archive, destination, profile):
    root = Path(destination)
    if root.exists() or root.is_symlink():
        raise ValueError('output must be new')
    root.mkdir(mode=0o700)
    found, total, entries = {}, 0, 0
    with tarfile.open(archive, 'r|gz') as bundle:
        for member in bundle:
            entries += 1
            name = member.name.rstrip('/')
            total += member.size
            if entries > 10000 or member.size < 0 or member.size > 128*1024**2 or total > 512*1024**2:
                raise ValueError('archive exceeds bounds')
            if not name or name.startswith('/') or '\\' in name or any(part in ('', '.', '..') for part in name.split('/')) or any(ord(c) < 32 for c in name):
                raise ValueError('unsafe archive path')
            if not name.startswith(profile['prefix']):
                continue
            relative = name[len(profile['prefix']):]
            if not (relative == 'etlded.x86_64' or relative.startswith(('legacy/', 'licenses/'))):
                continue
            if member.isdir():
                (root/relative).mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile() or member.mode & 0o7000 or relative in found:
                raise ValueError('unsupported or duplicate managed entry')
            target = root/relative
            target.parent.mkdir(parents=True, exist_ok=True)
            digest, size = hashlib.sha256(), 0
            with bundle.extractfile(member) as source, target.open('xb') as out:
                while block := source.read(65536):
                    size += len(block)
                    if size > member.size: raise ValueError('entry exceeds bounds')
                    digest.update(block)
                    out.write(block)
                out.flush()
                os.fchmod(out.fileno(), 0o755 if member.mode & 0o111 else 0o644)
                os.fsync(out.fileno())
            if size != member.size: raise ValueError('truncated entry')
            found[relative] = (size, digest.hexdigest())
    raw = ''.join(name+'\0'+str(size)+'\0'+digest+'\n' for name, (size, digest) in sorted(found.items()))
    if len(found) != profile['fileCount'] or sum(row[0] for row in found.values()) != profile['totalBytes'] or hashlib.sha256(raw.encode()).hexdigest() != profile['treeSha256']:
        raise ValueError('reviewed package tree differs')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3: raise ValueError('fixed archive and output required')
        resource.setrlimit(resource.RLIMIT_AS, (256*1024**2, 256*1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (90, 90))
        resource.setrlimit(resource.RLIMIT_FSIZE, (128*1024**2, 128*1024**2))
        data = json.loads(Path(__file__).with_name('etlegacyReleases.json').read_text())
        extract(sys.argv[1], sys.argv[2], data['versions'][data['latest']])
    except Exception:
        print('ET Legacy archive failed bounded package validation', file=sys.stderr)
        sys.exit(1)
