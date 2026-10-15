#!/usr/bin/python3
"""Bounded universal ZIP reader: matching amd64 native ZIP and DPK package set."""
import hashlib
import io
import json
import os
from pathlib import Path
import resource
import stat
import sys
import zipfile


def inventory(bundle, limit):
    entries = bundle.infolist()
    if len(entries) > 2000: raise ValueError('archive has too many entries')
    seen, total = set(), 0
    for entry in entries:
        name = entry.filename.rstrip('/')
        mode = entry.external_attr >> 16
        if not name or name.startswith('/') or '\\' in name or any(part in ('', '.', '..') for part in name.split('/')) or any(ord(c) < 32 or ord(c) == 127 for c in name): raise ValueError('unsafe path')
        if name in seen or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR) or mode & 0o7000: raise ValueError('duplicate or special archive entry')
        seen.add(name); total += entry.file_size
        if entry.file_size < 0 or entry.file_size > 256*1024**2 or total > limit: raise ValueError('archive exceeds bounds')
    return entries


def write_entry(bundle, entry, relative, root, files, found):
    expected = files.get(relative)
    if not expected or relative in found or entry.file_size != expected['bytes']: raise ValueError('unexpected managed file')
    target = root/relative
    target.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW, 0o755 if expected['executable'] else 0o644)
    with os.fdopen(fd, 'wb') as out, bundle.open(entry) as source:
        digest, size = hashlib.sha256(), 0
        while block := source.read(65536):
            size += len(block)
            if size > expected['bytes']: raise ValueError('managed file exceeds review')
            digest.update(block); out.write(block)
        if size != expected['bytes'] or digest.hexdigest() != expected['sha256']: raise ValueError('managed checksum mismatch')
        out.flush(); os.fsync(out.fileno())
    found.add(relative)


def extract(archive, destination, profile):
    root = Path(destination)
    if root.exists() or root.is_symlink(): raise ValueError('output must be new')
    root.mkdir(mode=0o700)
    files, found = profile['files'], set()
    with zipfile.ZipFile(archive) as bundle:
        entries = inventory(bundle, 2*1024**3)
        native_name = profile['prefix']+profile['nativeZip']
        native_entry = next((entry for entry in entries if entry.filename == native_name), None)
        if not native_entry or native_entry.file_size > 32*1024**2: raise ValueError('missing or oversized native zip')
        with zipfile.ZipFile(io.BytesIO(bundle.read(native_entry))) as native:
            for entry in inventory(native, 128*1024**2):
                if not entry.is_dir(): write_entry(native, entry, entry.filename, root, files, found)
        for entry in entries:
            if entry.filename.startswith(profile['prefix']+'pkg/') and not entry.is_dir():
                write_entry(bundle, entry, entry.filename[len(profile['prefix']):], root, files, found)
    if found != set(files): raise ValueError('incomplete native and game package set')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3: raise ValueError('fixed archive and output required')
        resource.setrlimit(resource.RLIMIT_AS, (256*1024**2, 256*1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
        resource.setrlimit(resource.RLIMIT_FSIZE, (256*1024**2, 256*1024**2))
        data = json.loads(Path(__file__).with_name('unvanquishedReleases.json').read_text())
        extract(sys.argv[1], sys.argv[2], data['versions'][data['latest']])
    except Exception:
        print('Unvanquished archive failed bounded package validation', file=sys.stderr)
        sys.exit(1)
