#!/usr/bin/python3
"""Bounded package extraction for fixed paired engine/assets profiles."""
import hashlib,json,os,resource,stat,sys,tarfile,zipfile,subprocess,tempfile
from pathlib import Path

def selected(key,name):
    if key=='bombsquad':return name=='bombsquad_server' or name.startswith('dist/')
    if key=='veloren':return name=='veloren-server-cli' or name.startswith('assets/')
    if key=='warzone-2100':return name in ('warzone2100','crashpad_handler_warzone2100') or name.startswith('data/')
    if key=='trackmania':return name=='TrackmaniaServer' or name.startswith('Packs/')
    raise ValueError('unsupported paired game')

def extract(archive,destination,key,profile):
    if profile['format']=='deb':
        if key!='warzone-2100':raise ValueError('unsupported native package')
        members=subprocess.check_output(['/usr/bin/ar','t',str(archive)],timeout=10).decode().splitlines()
        matches=[name for name in members if name in ('data.tar.xz','data.tar.zst','data.tar.gz')]
        if len(matches)!=1:raise ValueError('ambiguous native package')
        with tempfile.TemporaryFile(dir=Path(archive).parent) as payload:
            subprocess.run(['/usr/bin/ar','p',str(archive),matches[0]],stdout=payload,check=True,timeout=60)
            if payload.tell()>1024**3:raise ValueError('oversized native payload')
            payload.seek(0)
            return extract(payload,destination,key,{**profile,'format':'tar','prefix':'./usr/'})
    root=Path(destination)
    if root.exists() or root.is_symlink():raise ValueError('output must be new')
    root.mkdir(mode=0o700);found=set();rows={};total=0
    def write(name,size,executable,source):
        nonlocal total
        if not selected(key,name):return
        if name.startswith('/') or '\\' in name or any(p in ('','.','..') for p in name.split('/')) or any(ord(c)<32 for c in name):raise ValueError('unsafe path')
        if name in found or len(found)>50000 or size<0 or size>(512 if key=='trackmania' else 256)*1024**2:raise ValueError('duplicate or oversized member')
        total+=size
        if total>3*1024**3:raise ValueError('oversized package')
        target=root/name;target.parent.mkdir(parents=True,exist_ok=True)
        fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o755 if executable else 0o644)
        digest=hashlib.sha256();written=0
        with os.fdopen(fd,'wb') as out:
            if key=='bombsquad' and name=='dist/ba_data/python/efro/dataclassio/_base.py':
                data=source.read(size+1)
                if len(data)!=size:raise ValueError('truncated source')
                data=data.replace(b'from typing import TYPE_CHECKING, get_args',b'from typing import TYPE_CHECKING, Any, get_args')
                out.write(data);digest.update(data);written=len(data)
            else:
                while block:=source.read(65536):
                    written+=len(block)
                    if written>size:raise ValueError('oversized member')
                    out.write(block);digest.update(block)
                if written!=size:raise ValueError('truncated member')
            out.flush();os.fsync(out.fileno())
        found.add(name);rows[name]=(digest.hexdigest(),written)
    if profile['format']=='zip':
        with zipfile.ZipFile(archive) as bundle:
            if len(bundle.infolist())>60000:raise ValueError('too many entries')
            for entry in bundle.infolist():
                name=entry.filename
                if not selected(key,name) or entry.is_dir():continue
                mode=entry.external_attr>>16
                if stat.S_IFMT(mode) not in (0,stat.S_IFREG) or mode&0o7000:raise ValueError('special file')
                with bundle.open(entry) as source:write(name,entry.file_size,bool(mode&0o111),source)
    elif profile['format']=='tar':
        with (tarfile.open(fileobj=archive) if hasattr(archive,'read') else tarfile.open(archive)) as bundle:
            for i,entry in enumerate(bundle):
                if i>60000:raise ValueError('too many entries')
                if not entry.name.startswith(profile['prefix']):continue
                name=entry.name[len(profile['prefix']):]
                if key=='warzone-2100':
                    name=name[4:] if name in ('bin/warzone2100','bin/crashpad_handler_warzone2100') else 'data/'+name[len('share/warzone2100/'):] if name.startswith('share/warzone2100/') else ''
                if not selected(key,name) or entry.isdir():continue
                if not entry.isfile() or entry.mode&0o7000:raise ValueError('special file')
                with bundle.extractfile(entry) as source:write(name,entry.size,bool(entry.mode&0o111),source)
    else:raise ValueError('unsupported archive')
    digest=hashlib.sha256()
    for name,(value,size) in sorted(rows.items()):digest.update((name+'\0'+value+'\n').encode())
    if digest.hexdigest()!=profile['treeSha256'] or len(rows)!=profile['fileCount'] or sum(row[1] for row in rows.values())!=profile['totalBytes']:raise ValueError('package differs from review')

if __name__=='__main__':
    try:
        if len(sys.argv)!=4:raise ValueError('fixed key archive output required')
        resource.setrlimit(resource.RLIMIT_AS,(512*1024**2,512*1024**2));resource.setrlimit(resource.RLIMIT_CPU,(300,300));resource.setrlimit(resource.RLIMIT_FSIZE,(1024**3,1024**3))
        data=json.loads(Path(__file__).with_name('pairedRuntimeProfiles.json').read_text())[sys.argv[1]]
        profile=next(row for row in data['versions'] if row['buildId']==data['latest'])
        extract(sys.argv[2],sys.argv[3],sys.argv[1],profile)
    except Exception:
        print('Paired runtime archive failed bounded validation',file=sys.stderr);sys.exit(1)
