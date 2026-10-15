#!/usr/bin/python3
"""Extract an authenticated Factorio package without trusting tar paths/links."""
import os
from pathlib import Path
import resource
import sys
import tarfile


def extract(archive, destination):
    root = Path(destination)
    root.mkdir(mode=0o700)  # Must be new; never extract over an installation.
    seen, total = set(), 0
    with tarfile.open(archive, "r|xz") as bundle:
        for member in bundle:
            name = member.name.rstrip("/")
            if name in seen or len(seen) >= 30000 or len(name) > 500:
                raise ValueError("duplicate or oversized archive inventory")
            seen.add(name)
            parts = name.split("/")
            if parts[0] != "factorio" or any(p in ("", ".", "..") or p.startswith(".") for p in parts) or "\\" in name or ":" in name or any(ord(c) < 32 or ord(c) == 127 for c in name) or len(parts) > 32:
                raise ValueError("unsafe archive path")
            if not (member.isdir() or member.isfile()) or member.mode & 0o7000:
                raise ValueError("links, special files and special permissions forbidden")
            if member.size < 0 or member.size > 256 * 1024**2:
                raise ValueError("oversized archive entry")
            total += member.size
            if total > 2 * 1024**3:
                raise ValueError("oversized expanded archive")
            if len(parts) == 1:
                if not member.isdir():
                    raise ValueError("package root is not a directory")
                continue
            target = root.joinpath(*parts[1:])
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o755)
                continue
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            source = bundle.extractfile(member)
            if source is None:
                raise ValueError("missing archive content")
            mode = 0o755 if parts[1:] == ["bin", "x64", "factorio"] else 0o644
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
            with os.fdopen(fd, "wb") as output:
                copied = 0
                while chunk := source.read(1024 * 1024):
                    copied += len(chunk)
                    if copied > member.size:
                        raise ValueError("entry exceeds declared length")
                    output.write(chunk)
                if copied != member.size:
                    raise ValueError("truncated archive entry")
                output.flush()
                os.fsync(output.fileno())
    if not (root / "bin/x64/factorio").is_file() or not (root / "data/base/info.json").is_file():
        raise ValueError("incomplete headless package")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("archive and new output directory required")
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (90, 90))
        resource.setrlimit(resource.RLIMIT_FSIZE, (256 * 1024**2, 256 * 1024**2))
        extract(sys.argv[1], sys.argv[2])
    except Exception:
        print("Factorio package failed bounded archive validation", file=sys.stderr)
        sys.exit(1)
