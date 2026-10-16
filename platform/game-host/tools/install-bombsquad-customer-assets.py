#!/usr/bin/python3 -I
"""Direct-root publication of fixed reviewed BombSquad and Python dependencies.
Group-writable source files are never executed: pinned bytes are normalized in
private root staging and reverified by the immutable publisher before release.
"""
import hashlib
import importlib.machinery
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile


def normalized_source(source, destination, manifest):
    rows=manifest.get('files')
    if not isinstance(rows,list) or not 1<=len(rows)<=2048:raise ValueError('Invalid dependency inventory')
    seen=set();total=0
    for row in rows:
        name=row.get('path')
        if not isinstance(name,str) or not re.fullmatch(r'(?:bin/python3\.14|bombsquad_server|dist/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}|lib/(?:libpython3\.14\.so\.1\.0|python3\.14/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}))',name) or any(x in ('.','..') for x in name.split('/')) or name in seen:raise ValueError('Invalid pinned dependency path')
        seen.add(name)
        if type(row.get('bytes')) is not int or not 0<=row['bytes']<=256*1024**2 or not re.fullmatch(r'[a-f0-9]{64}',str(row.get('sha256'))):raise ValueError('Invalid dependency pin')
        total+=row['bytes']
    if total>2*1024**3:raise ValueError('Dependency size limit exceeded')
    for row in rows:
        directory=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
        try:
            for part in (source/row['path']).parts[1:-1]:
                child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
                os.close(directory);directory=child
            descriptor=os.open(Path(row['path']).name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
        finally:os.close(directory)
        with os.fdopen(descriptor,'rb') as original:
            before=os.fstat(original.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_size!=row['bytes']:raise ValueError('Unsafe dependency source')
            target=destination/row['path'];target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            digest=hashlib.sha256();remaining=row['bytes']
            with target.open('xb') as output:
                while remaining:
                    block=original.read(min(1024**2,remaining))
                    if not block:raise ValueError('Truncated dependency')
                    digest.update(block);output.write(block);remaining-=len(block)
                output.flush();os.fchmod(output.fileno(),0o444);os.fsync(output.fileno())
            after=os.fstat(original.fileno())
            if original.read(1) or digest.hexdigest()!=row['sha256'] or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('Dependency changed or differs from reviewed pin')


if __name__=='__main__':
    if len(sys.argv)!=1 or os.getuid()!=0 or os.geteuid()!=0 or os.environ.get('SUDO_USER'):raise SystemExit('Direct root operator required; no arguments accepted')
    here=Path(__file__).resolve().parent
    helper=here/'install-xonotic-customer-assets.py';info=helper.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1 or info.st_mode&0o022:raise SystemExit('Untrusted publisher')
    module=importlib.machinery.SourceFileLoader('publisher',str(helper)).load_module()
    for game,profile,source,destination in [
        ('bombsquad','customerBombsquadAssets.json','/opt/playbound-host/games/bombsquad/runtime','/usr/local/libexec/playbound-isolated-bombsquad-data-v1'),
        ('bombsquad-python','customerBombsquadPythonAssets.json','/opt/playbound-host/python314','/usr/local/libexec/playbound-isolated-bombsquad-python-v1')]:
        file=here/profile
        if not file.is_file():file=here.parent/profile
        manifest=json.loads(file.read_text())
        if module.shutil.disk_usage('/usr/local/libexec').free<2*sum(row['bytes'] for row in manifest['files'])+2*1024**3:raise SystemExit('Insufficient publication headroom')
        with tempfile.TemporaryDirectory(prefix='.pb-bombsquad-review-',dir='/usr/local/libexec') as temporary:
            root=Path(temporary);normalized_source(Path(source),root,manifest)
            print(json.dumps(dict(module.promote(root,Path(destination),manifest,game),game=game)))
