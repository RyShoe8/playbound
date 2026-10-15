#!/usr/bin/python3
"""Read a bounded AssaultCube archive; write only its two native executables."""
import os
from pathlib import Path
import resource
import sys
import tarfile

NAMES = {"linux_64_client", "linux_64_server"}

def extract(archive, destination):
    root = Path(destination)
    if root.exists() or root.is_symlink():
        raise ValueError("output must be a new directory")
    root.mkdir(mode=0o700)
    found, count, total = set(), 0, 0
    with tarfile.open(archive, "r|bz2") as bundle:
        for member in bundle:
            count += 1
            total += member.size
            if count > 100000 or member.size < 0 or member.size > 512 * 1024**2 or total > 2 * 1024**3:
                raise ValueError("archive exceeds extraction limits")
            name = member.name
            if name.startswith("./"):
                name = name[2:]
            name = name.rstrip("/")
            if name in ("", ".") and member.isdir():
                continue
            if name.startswith("/") or "\\" in name or any(ord(c) < 32 or ord(c) == 127 for c in name) or any(p in ("", ".", "..") for p in name.split("/")):
                raise ValueError("unsafe archive path")
            if name == "bin_unix":
                if not member.isdir():
                    raise ValueError("binary parent is not a directory")
                continue
            if not name.startswith("bin_unix/"):
                continue
            filename = name.removeprefix("bin_unix/")
            if filename not in NAMES or filename in found or not member.isfile() or member.mode & 0o7000 or member.size < 1 or member.size > 16 * 1024**2:
                raise ValueError("unexpected, duplicate or unsafe binary")
            source = bundle.extractfile(member)
            if source is None:
                raise ValueError("missing binary contents")
            fd = os.open(root / filename, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o755)
            with os.fdopen(fd, "wb") as output:
                copied = 0
                while chunk := source.read(1024 * 1024):
                    copied += len(chunk)
                    if copied > member.size:
                        raise ValueError("binary exceeds declared size")
                    output.write(chunk)
                if copied != member.size:
                    raise ValueError("truncated binary")
                output.flush()
                os.fsync(output.fileno())
            found.add(filename)
    if found != NAMES:
        raise ValueError("native package is incomplete")

if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("fixed archive and output paths required")
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024**2, 16 * 1024**2))
        extract(sys.argv[1], sys.argv[2])
    except Exception:
        print("AssaultCube archive failed bounded native-file validation", file=sys.stderr)
        sys.exit(1)
