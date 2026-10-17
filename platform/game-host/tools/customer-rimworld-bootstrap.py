#!/usr/bin/python3 -I
"""Fixed reserved-UID namespace bootstrap; no host paths or commands accepted."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile


def write_configs(root,values):
    root.mkdir(mode=0o700,exist_ok=True)
    info=root.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:raise ValueError('Unsafe RimWorld configuration directory')
    for name,changes in values.items():
        if name not in ('ServerConfig.json','BackupConfig.json','ChatConfig.json','ModConfig.json','StorytellerConfig.json','DifficultyConfig.json'):raise ValueError('Unknown RimWorld configuration')
        target=root/name;current={}
        try:
            descriptor=os.open(target,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        except FileNotFoundError:pass
        else:
            with os.fdopen(descriptor) as source:
                info=os.fstat(source.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_uid!=os.getuid() or info.st_size>262144:raise ValueError('Unsafe RimWorld configuration')
                current=json.load(source)
                if not isinstance(current,dict):raise ValueError('Invalid RimWorld configuration')
        current.update(changes)
        descriptor,temporary=tempfile.mkstemp(prefix='.pb-config-',dir=root)
        try:
            with os.fdopen(descriptor,'w') as output:
                json.dump(current,output);output.flush();os.fsync(output.fileno())
            os.replace(temporary,target)
        finally:
            if os.path.exists(temporary):os.unlink(temporary)


if __name__=='__main__':
    if not 40000<=os.getuid()<=40255 or not Path('/game-data/RTServer').is_file():raise SystemExit('Reserved runtime namespace required')
    spec=importlib.util.spec_from_file_location('contract','/rimworld-contract.py')
    contract=importlib.util.module_from_spec(spec);spec.loader.exec_module(contract)
    payload=json.loads(Path('/server/server.cfg').read_text())
    value=contract.settings(json.dumps(payload['configuration']),payload['port'])
    write_configs(Path('/server/Configs'),contract.configurations(value,payload['port']))
    fifo=Path('/server/playbound-console.fifo')
    try:os.mkfifo(fifo,0o600)
    except FileExistsError:pass
    if not stat.S_ISFIFO(fifo.lstat().st_mode) or fifo.lstat().st_uid!=os.getuid():raise SystemExit('Invalid RimWorld console')
    descriptor=os.open(fifo,os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK)
    os.set_blocking(descriptor,True);os.dup2(descriptor,0);os.close(descriptor)
    os.execv('/game-data/RTServer',['/game-data/RTServer'])
