"""Bounded regular-file extraction for checksum-verified source archives."""
from pathlib import Path
import shutil
import tarfile

def extract_reviewed_source(archive, target, prefix, *, max_files=50000, max_bytes=512 * 1024**2, max_entry=128 * 1024**2):
    target.mkdir()
    count = total = 0
    seen = set()
    with tarfile.open(archive, 'r:gz') as reader:
        for item in reader:
            count += 1; total += item.size
            parts = Path(item.name).parts
            if count > max_files or item.size < 0 or item.size > max_entry or total > max_bytes or not parts or parts[0] != prefix or any(p in ['..', ''] for p in parts) or item.name.startswith('/'):
                raise ValueError('Reviewed source inventory is unsafe')
            relative = Path(*parts[1:]) if len(parts) > 1 else Path('.')
            if relative in seen or item.mode & 0o7000:
                raise ValueError('Reviewed source contains duplicate or privileged files')
            seen.add(relative)
            destination = target / relative
            if item.isdir(): destination.mkdir(parents=True, exist_ok=True)
            elif item.isfile():
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open('xb') as output:
                    shutil.copyfileobj(reader.extractfile(item), output, length=1024 * 1024)
            else: raise ValueError('Reviewed source links and special files refused')
