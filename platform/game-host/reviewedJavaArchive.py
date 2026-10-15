#!/usr/bin/python3
"""Validate a pinned Java entry point, or extract one fixed reviewed JAR."""
import hashlib,json,os,resource,stat,struct,sys,zipfile
from pathlib import Path

def inspect(filename, main):
    with zipfile.ZipFile(filename) as archive:
        names=archive.namelist()
        if len(names)>50000 or len(set(names))!=len(names):raise ValueError('ambiguous JAR')
        manifest=archive.getinfo('META-INF/MANIFEST.MF')
        entry=archive.getinfo(main.replace('.','/')+'.class')
        if manifest.file_size>65536 or entry.file_size>4*1024**2:raise ValueError('oversized metadata')
        text=archive.read(manifest).decode('utf8').replace('\r','')
        if text.splitlines().count('Main-Class: '+main)!=1:raise ValueError('wrong server entry point')
        data=archive.read(entry)
        if len(data)<8 or data[:4]!=b'\xca\xfe\xba\xbe':raise ValueError('invalid class')
        return struct.unpack('>H',data[6:8])[0]-44

def extract(filename,destination,key,version):
    if key=='ysoccer':raise ValueError('YSoccer is already a JAR')
    with zipfile.ZipFile(filename) as archive:
        rows=archive.infolist()
        if len(rows)>1000:raise ValueError('too many archive entries')
        names=set()
        for row in rows:
            parts=row.filename.rstrip('/').split('/')
            if row.filename.startswith('/') or '\\' in row.filename or any(p in ('','.','..') for p in parts) or row.filename in names:raise ValueError('unsafe archive path')
            if stat.S_ISLNK(row.external_attr>>16):raise ValueError('archive link')
            names.add(row.filename)
        matches=[row for row in rows if row.filename=='bin/game-headless.jar']
        if len(matches)!=1 or matches[0].file_size!=version['bytes']:raise ValueError('wrong dedicated JAR')
        data=archive.read(matches[0])
        if hashlib.sha256(data).hexdigest()!=version['sha256']:raise ValueError('JAR checksum mismatch')
        with open(destination,'xb') as output:output.write(data)
        os.chmod(destination,0o644)

if __name__=='__main__':
    resource.setrlimit(resource.RLIMIT_AS,(512*1024**2,512*1024**2))
    resource.setrlimit(resource.RLIMIT_CPU,(60,60))
    if len(sys.argv)==4 and sys.argv[1]=='inspect':print(json.dumps({'java':inspect(sys.argv[2],sys.argv[3])}))
    elif len(sys.argv)==5 and sys.argv[1]=='extract':
        key=sys.argv[2];profiles=json.loads(Path(__file__).with_name('reviewedJavaProfiles.json').read_text());profile=profiles[key]
        version=next(row for row in profile['versions'] if row['buildId']==profile['latest'])
        extract(sys.argv[3],sys.argv[4],key,version)
    else:raise ValueError('unsupported operation')
