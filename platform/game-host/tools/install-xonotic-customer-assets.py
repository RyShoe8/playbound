#!/usr/bin/python3 -I
"""Operator-only atomic publication of the fixed reviewed Xonotic assets."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile


def promote(source, destination, manifest, game='xonotic'):
    if game not in ('xonotic','wolfenstein-enemy-territory','medal-of-honor-allied-assault','freeciv','warzone-2100'): raise ValueError('Unsupported asset publication')
    pattern=r'[A-Za-z0-9_-]{1,100}\.pk3' if game=='xonotic' else r'(?:etmain|legacy)/[A-Za-z0-9_.-]{1,100}\.(?:pk3|so)' if game=='wolfenstein-enemy-territory' else r'(?:main/[A-Za-z0-9_.-]{1,100}\.pk3|game\.so)'
    if game=='freeciv': pattern=r'(?:lib|share/freeciv)/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}'
    if game=='warzone-2100':pattern=r'data/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}'
    rows = manifest.get('files')
    if not isinstance(rows,list) or not 1 <= len(rows) <= (1024 if game in ('freeciv','warzone-2100') else 16):
        raise ValueError('Invalid Xonotic asset inventory')
    seen,total = set(),0
    for row in rows:
        if not isinstance(row,dict) or not re.fullmatch(pattern,str(row.get('path'))) or row['path'] in seen or any(part in ('.','..') for part in row['path'].split('/')):
            raise ValueError('Invalid Xonotic asset path')
        seen.add(row['path'])
        if type(row.get('bytes')) is not int or not 1 <= row['bytes'] <= 768*1024**2 or not re.fullmatch(r'[a-f0-9]{64}',str(row.get('sha256'))):
            raise ValueError('Invalid Xonotic asset pin')
        total += row['bytes']
    if total > 2*1024**3: raise ValueError('Asset size limit exceeded')
    info=destination.parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:
        raise ValueError('Untrusted asset publication parent')
    if destination.exists() or destination.is_symlink():
        raise ValueError('Existing asset publication requires explicit operator version review')
    if shutil.disk_usage(destination.parent).free < total+2*1024**3:
        raise ValueError('Insufficient disk space for isolated game assets')
    # Retain no-follow descriptors all the way from the filesystem root.
    def open_file(path):
        directory=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
        try:
            for part in path.parts[1:-1]:
                child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
                os.close(directory);directory=child
            return os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
        finally:os.close(directory)
    temporary=Path(tempfile.mkdtemp(prefix='.pb-xonotic-assets-',dir=destination.parent))
    try:
        os.chmod(temporary,0o755)
        for row in rows:
            with os.fdopen(open_file(source/row['path']),'rb') as original:
                before=os.fstat(original.fileno())
                if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_mode&0o7022 or before.st_size!=row['bytes']:
                    raise ValueError('Unsafe Xonotic asset source')
                digest=hashlib.sha256();remaining=row['bytes']
                target=temporary/row['path']
                target.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
                with target.open('xb') as output:
                    while remaining:
                        block=original.read(min(1024**2,remaining))
                        if not block:raise ValueError('Incomplete Xonotic asset')
                        digest.update(block);output.write(block);remaining-=len(block)
                    output.flush();os.fchmod(output.fileno(),0o444);os.fsync(output.fileno())
                after=os.fstat(original.fileno())
                if original.read(1) or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or digest.hexdigest()!=row['sha256']:
                    raise ValueError('Xonotic assets differ from reviewed pins')
        record=temporary/'profile.json'
        with record.open('x') as output:
            json.dump(manifest,output);output.flush();os.fchmod(output.fileno(),0o444);os.fsync(output.fileno())
        for directory,_,_ in os.walk(temporary,topdown=False):os.chmod(directory,0o555)
        os.rename(temporary,destination)
        directory=os.open(destination.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(directory)
        finally:os.close(directory)
        return {'files':len(rows),'bytes':total,'changedProcesses':0}
    finally:
        if temporary.exists():shutil.rmtree(temporary)


if __name__=='__main__':
    if len(sys.argv)!=1 or os.getuid()!=0 or os.geteuid()!=0 or os.environ.get('SUDO_USER'):
        raise SystemExit('Direct root operator required; no arguments accepted')
    here=Path(__file__).resolve().parent
    profile=here.parent/'customerXonoticAssets.json'
    if not profile.is_file():profile=here/'customerXonoticAssets.json'
    print(json.dumps(promote(Path('/opt/playbound-host/games/xonotic/data'),
        Path('/usr/local/libexec/playbound-isolated-xonotic-data-086'),json.loads(profile.read_text()))))
