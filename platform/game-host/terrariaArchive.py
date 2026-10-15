#!/usr/bin/python3
"""Read the reviewed Terraria ZIP; extract only its fixed Linux server tree."""
import os
from pathlib import Path
import resource
import stat
import sys
import zipfile


def extract(archive, destination):
    root = Path(destination)
    root.mkdir(mode=0o700)
    seen, total, extracted = set(), 0, set()
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            name = item.filename.rstrip("/")
            parts = name.split("/")
            mode = item.external_attr >> 16
            if name in seen or len(seen) >= 5000 or len(name) > 500 or len(parts) > 16:
                raise ValueError("duplicate or oversized archive inventory")
            seen.add(name)
            if any(p in ("", ".", "..") for p in parts) or "\\" in name or ":" in name or any(ord(c) < 32 or ord(c) == 127 for c in name):
                raise ValueError("unsafe archive path")
            if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR) or mode & 0o7000 or item.flag_bits & 1:
                raise ValueError("links, special files or encrypted content forbidden")
            total += item.file_size
            if item.file_size < 0 or item.file_size > 64 * 1024**2 or total > 512 * 1024**2:
                raise ValueError("expanded package exceeds limits")
            if not name.startswith("1458/Linux/"):
                continue
            relative = parts[2:]
            if any(p.startswith(".") for p in relative):
                raise ValueError("hidden Linux package entry")
            target = root.joinpath(*relative)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True, mode=0o755)
                continue
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            permissions = 0o755 if relative == ["TerrariaServer.bin.x86_64"] else 0o644
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, permissions)
            with package.open(item) as source, os.fdopen(fd, "wb") as output:
                copied = 0
                while chunk := source.read(1024 * 1024):
                    copied += len(chunk)
                    if copied > item.file_size:
                        raise ValueError("entry exceeds declared length")
                    output.write(chunk)
                if copied != item.file_size:
                    raise ValueError("truncated ZIP entry")
                output.flush()
                os.fsync(output.fileno())
            extracted.add("/".join(relative))
    if not {"TerrariaServer.bin.x86_64", "TerrariaServer.exe", "mscorlib.dll"} <= extracted:
        raise ValueError("incomplete Linux server package")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("archive and new destination required")
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024**2, 256 * 1024**2))
        resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
        resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024**2, 64 * 1024**2))
        extract(sys.argv[1], sys.argv[2])
    except Exception:
        print("Terraria package failed bounded Linux-file validation", file=sys.stderr)
        sys.exit(1)
