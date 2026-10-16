"""Retain a root-owned, reviewed immutable asset directory for namespace bind."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

ROOT = Path('/usr/local/libexec/playbound-isolated-xonotic-data-086')


def open_assets(root=None, game='xonotic'):
    if game not in ('xonotic','wolfenstein-enemy-territory','medal-of-honor-allied-assault'):raise ValueError('Unsupported immutable asset family')
    if root is None:root=ROOT if game=='xonotic' else Path('/usr/local/libexec/playbound-isolated-etlegacy-data-285') if game=='wolfenstein-enemy-territory' else Path('/usr/local/libexec/playbound-isolated-openmohaa-data-v1')
    pattern=r'[A-Za-z0-9_-]{1,100}\.pk3' if game=='xonotic' else r'(?:etmain|legacy)/[A-Za-z0-9_.-]{1,100}\.(?:pk3|so)' if game=='wolfenstein-enemy-territory' else r'(?:main/[A-Za-z0-9_.-]{1,100}\.pk3|game\.so)'
    parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for component in root.parts[1:]:
            child=os.open(component,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            info=os.fstat(child)
            if info.st_uid!=0 or info.st_mode&0o022:
                os.close(child);raise ValueError('Untrusted asset directory')
            os.close(parent);parent=child
        def read_file(name,maximum):
            directory=os.dup(parent)
            try:
                parts=name.split('/')
                for part in parts[:-1]:
                    child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
                    info=os.fstat(child)
                    if info.st_uid!=0 or info.st_mode&0o222:
                        os.close(child);raise ValueError('Untrusted immutable asset subdirectory')
                    os.close(directory);directory=child
                descriptor=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
            finally:os.close(directory)
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
            if not isinstance(name,str) or not re.fullmatch(pattern,name) or name in seen:raise ValueError('Invalid immutable asset path')
            seen.add(name)
            size,digest,_=read_file(name,768*1024**2);total+=size
            if total>2*1024**3 or size!=row.get('bytes') or digest!=row.get('sha256'):raise ValueError('Immutable assets differ from reviewed pins')
        expected_top={name.split('/')[0] for name in seen}
        if set(os.listdir(parent))!=expected_top:raise ValueError('Unlisted immutable asset file')
        for folder in expected_top-{'profile.json'}:
            if '/' not in next((name for name in seen if name.startswith(folder+'/')), ''):continue
            descriptor=os.open(folder,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            try:
                if set(os.listdir(descriptor))!={name.split('/')[1] for name in seen if name.startswith(folder+'/')}:raise ValueError('Unlisted immutable asset subdirectory entry')
            finally:os.close(descriptor)
        result,parent=parent,None
        return result
    finally:
        if parent is not None:os.close(parent)
