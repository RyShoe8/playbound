"""Retain a root-owned, reviewed immutable asset directory for namespace bind."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

ROOT = Path('/usr/local/libexec/playbound-isolated-xonotic-data-086')


def open_assets(root=ROOT):
    parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for component in root.parts[1:]:
            child=os.open(component,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            info=os.fstat(child)
            if info.st_uid!=0 or info.st_mode&0o022:
                os.close(child);raise ValueError('Untrusted asset directory')
            os.close(parent);parent=child
        def read_file(name,maximum):
            descriptor=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
            with os.fdopen(descriptor,'rb') as source:
                before=os.fstat(source.fileno())
                if not stat.S_ISREG(before.st_mode) or before.st_uid!=0 or before.st_nlink!=1 or before.st_mode&0o7222 or before.st_size>maximum:
                    raise ValueError('Untrusted immutable asset')
                digest=hashlib.sha256();content=b''
                while True:
                    block=source.read(1024**2)
                    if not block:break
                    digest.update(block)
                    if name=='profile.json':content+=block
                after=os.fstat(source.fileno())
                if (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('Asset changed')
                return before.st_size,digest.hexdigest(),content
        _,_,content=read_file('profile.json',32768)
        rows=json.loads(content)['files']
        if not isinstance(rows,list) or not 1<=len(rows)<=16:raise ValueError('Invalid immutable asset inventory')
        seen={'profile.json'};total=0
        for row in rows:
            name=row.get('path')
            if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}\.pk3',name) or name in seen:raise ValueError('Invalid immutable asset path')
            seen.add(name)
            size,digest,_=read_file(name,768*1024**2);total+=size
            if total>2*1024**3 or size!=row.get('bytes') or digest!=row.get('sha256'):raise ValueError('Immutable assets differ from reviewed pins')
        if set(os.listdir(parent))!=seen:raise ValueError('Unlisted immutable asset file')
        result,parent=parent,None
        return result
    finally:
        if parent is not None:os.close(parent)
