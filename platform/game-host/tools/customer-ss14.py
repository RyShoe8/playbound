#!/usr/bin/python3 -I
"""Fixed SS14 settings/bootstrap inside the reserved UID namespace."""
import json
import os
from pathlib import Path
import re
import stat


def settings(text,port):
    if not isinstance(text,str) or len(text.encode())>16384:raise ValueError('Invalid SS14 settings')
    value=json.loads(text)
    if not isinstance(value,dict) or set(value)!={'name','softMaxPlayers','lobbyEnabled'}:raise ValueError('Undeclared SS14 setting')
    if not isinstance(value['name'],str) or not 1<=len(value['name'])<=80 or re.search(r'[\x00-\x1f\x7f]',value['name']):raise ValueError('Invalid SS14 name')
    if type(port) is not int or not 1212<=port<=1222 or type(value['softMaxPlayers']) is not int or not 2<=value['softMaxPlayers']<=64 or type(value['lobbyEnabled']) is not bool:raise ValueError('Invalid SS14 allocation')
    return value


def arguments(value,port):
    settings(json.dumps(value),port)
    return ['/game-data/Robust.Server','--cvar','net.port='+str(port),'--data-dir','/server/data','--config-file','/server/server_config.toml',
            '--cvar','log.path=/server/data/logs','--cvar','game.hostname='+value['name'],
            '--cvar','status.bind=*:'+str(port),'--cvar','game.soft_max_players='+str(value['softMaxPlayers']),
            '--cvar','game.lobbyenabled='+str(value['lobbyEnabled']).lower(),'--cvar','hub.advertise=false']


def prepare(root):
    for name in ('data','data/logs'):
        directory=root/name;directory.mkdir(mode=0o700,exist_ok=True)
        info=directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:raise ValueError('Unsafe SS14 data directory')
    config=root/'server_config.toml'
    try:
        descriptor=os.open(config,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    except FileExistsError:pass
    else:
        with os.fdopen(descriptor,'w') as output:output.write('[hub]\nadvertise = false\n');output.flush();os.fsync(output.fileno())
    info=config.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_uid!=os.getuid() or info.st_mode&0o077 or info.st_size>262144:raise ValueError('Unsafe SS14 private configuration')


if __name__=='__main__':
    if not 40000<=os.getuid()<=40255 or not Path('/game-data/Robust.Server').is_file():raise SystemExit('Reserved runtime namespace required')
    payload=json.loads(Path('/server/server.cfg').read_text())
    value=settings(json.dumps(payload['configuration']),payload['port'])
    prepare(Path('/server'))
    command=arguments(value,payload['port'])
    os.execv(command[0],command)
