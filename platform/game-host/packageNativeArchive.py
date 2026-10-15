#!/usr/bin/python3
"""Extract one reviewed native executable, never Debian maintainer scripts."""
import hashlib
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import tarfile


def extract(game, archive, destination):
    profiles = json.loads(Path(__file__).with_name('nativePackageProfiles.json').read_text())
    if game not in profiles:
        raise ValueError('unreviewed package')
    profile = profiles[game]
    with open(archive, 'rb') as source:
        if os.fstat(source.fileno()).st_size != profile['archiveBytes'] or hashlib.file_digest(source, 'sha256').hexdigest() != profile['archiveSha256']:
            raise ValueError('package checksum mismatch')
    target = Path(destination)
    count, total, found = 0, 0, False
    with subprocess.Popen(['/usr/bin/dpkg-deb', '--fsys-tarfile', archive], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env={'PATH': '/usr/bin:/bin', 'LANG': 'C'}) as reader:
        try:
            with tarfile.open(fileobj=reader.stdout, mode='r|') as payload:
                for member in payload:
                    count += 1
                    total += member.size
                    if count > 20000 or member.size < 0 or member.size > 128 * 1024**2 or total > 512 * 1024**2:
                        raise ValueError('package inventory exceeds limits')
                    name = member.name.removeprefix('./')
                    if name != profile['member']:
                        continue
                    if found or not member.isfile() or member.mode & 0o7000 or member.size != profile['binaryBytes']:
                        raise ValueError('unsafe or duplicate native file')
                    source = payload.extractfile(member)
                    digest = hashlib.sha256()
                    fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o755)
                    with os.fdopen(fd, 'wb') as output:
                        copied = 0
                        while chunk := source.read(1024 * 1024):
                            copied += len(chunk)
                            if copied > profile['binaryBytes']:
                                raise ValueError('native size mismatch')
                            digest.update(chunk)
                            output.write(chunk)
                        output.flush()
                        os.fsync(output.fileno())
                    if copied != profile['binaryBytes'] or digest.hexdigest() != profile['binarySha256']:
                        raise ValueError('native checksum mismatch')
                    found = True
            if reader.wait(timeout=10) != 0 or not found:
                raise ValueError('package extraction failed')
        finally:
            if reader.poll() is None:
                reader.kill()
                reader.wait()


if __name__ == '__main__':
    try:
        if len(sys.argv) != 4:
            raise ValueError('fixed game, archive and new destination required')
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        resource.setrlimit(resource.RLIMIT_FSIZE, (128 * 1024**2, 128 * 1024**2))
        extract(*sys.argv[1:])
    except Exception:
        print('Reviewed native package validation failed', file=sys.stderr)
        sys.exit(1)
