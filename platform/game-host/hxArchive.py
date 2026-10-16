"""Extract only the pinned public HX distribution into isolated worker System."""
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

def extract(archive, system):
    archive, system = Path(archive), Path(system)
    stage = system.parent
    if not re.fullmatch(r'\.pb-update-deus-ex-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}', stage.name):
        raise ValueError('HX staging path requires review')
    if stage.resolve() != stage.absolute() or system.resolve() != system.absolute() or system.name != 'System' or not system.is_dir():
        raise ValueError('HX System must be an isolated real directory')
    if archive.parent != stage or archive.name != '.hx-release.zip' or archive.is_symlink() or archive.stat().st_nlink != 1:
        raise ValueError('HX archive path requires review')
    data = archive.read_bytes()
    if len(data) != 2495362 or hashlib.sha256(data).hexdigest() != '95fe3b1fcae3a834601b4fcdf5a6ca393aab1452f6165e82f345bd77769c3d5a':
        raise ValueError('HX archive checksum mismatch')
    allowed = {'HCC.exe', 'HCC.ini', 'HX.dll', 'HX.exe', 'HX.int', 'HX.u', 'HXDefault.ini', 'HXDefUser.ini'}
    with zipfile.ZipFile(archive) as source:
        seen, pending = set(), []
        for entry in source.infolist():
            name = PurePosixPath(entry.filename)
            mode = entry.external_attr >> 16
            if entry.filename in seen or '\\' in entry.filename or name.is_absolute() or '..' in name.parts or entry.flag_bits & 1 or stat.S_ISLNK(mode):
                raise ValueError('HX archive member requires review')
            seen.add(entry.filename)
            if name.parts[:1] == ('System',) and not entry.is_dir():
                if len(name.parts) != 2 or name.name not in allowed or entry.file_size > 32 * 1024**2:
                    raise ValueError('HX unexpected System member')
                target = system / name.name
                if target.is_symlink() or target.resolve() != target.absolute() or not target.is_file() or target.stat().st_nlink != 1:
                    raise ValueError('HX staged destination requires review')
                pending.append((target, source.read(entry)))
        if {target.name for target, _ in pending} != allowed:
            raise ValueError('HX archive is incomplete')
        for target, content in pending:
            temporary = target.with_name('.hx-extract-' + target.name)
            try:
                with open(temporary, 'xb') as output:
                    output.write(content)
                    output.flush()
                    os.fsync(output.fileno())
                os.chmod(temporary, 0o644)
                os.replace(temporary, target)
            finally:
                if temporary.exists():
                    temporary.unlink()

if __name__ == '__main__':
    extract(*sys.argv[1:])
