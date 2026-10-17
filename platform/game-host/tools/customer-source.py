#!/usr/bin/python3 -I
"""Fixed reviewed Source contracts. Wine engines are excluded."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile

PROFILES = {
    'open-fortress': {'mod':'open_fortress','first':27150,'last':27169,'cap':32},
    'counter-strike-source': {'mod': 'cstrike', 'first': 27060, 'last': 27070, 'cap': 64},
    'team-fortress-2': {'mod': 'tf', 'first': 27015, 'last': 27025, 'cap': 32},
    'counter-strike-2': {'mod': 'game/csgo', 'first': 27030, 'last': 27040, 'cap': 64},
}


def settings(text, port, game):
    if game not in PROFILES or not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid native Source contract')
    value = json.loads(text)
    profile = PROFILES[game]
    if not isinstance(value, dict) or set(value) != ({'name', 'maxPlayers', 'map', 'botFill', 'rconPassword', 'timeLimit'} if game in ('counter-strike-source','open-fortress') else {'name', 'maxPlayers', 'map', 'botFill', 'rconPassword'}):
        raise ValueError('Undeclared Source setting')
    if type(port) is not int or not profile['first'] <= port <= profile['last']:
        raise ValueError('Invalid Source allocation')
    for key, maximum in (('name', 100), ('rconPassword', 128)):
        if not isinstance(value[key], str) or len(value[key]) > maximum or re.search(r'[\x00-\x1f\x7f"\\;]', value[key]):
            raise ValueError('Invalid Source text setting')
    if not value['name'] or not isinstance(value['map'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value['map']):
        raise ValueError('Invalid Source name or map')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= profile['cap'] or type(value['botFill']) is not int or not 0 <= value['botFill'] < value['maxPlayers']:
        raise ValueError('Invalid Source slot or bot allocation')
    if game in ('counter-strike-source','open-fortress') and (type(value['timeLimit']) is not int or not 0<=value['timeLimit']<=600):
        raise ValueError('Invalid Source time limit')
    return value


def private_directory(root, relative):
    current = root
    for part in Path(relative).parts:
        current /= part
        current.mkdir(mode=0o700, exist_ok=True)
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private Source directory')
    return current


def private_write(file, content):
    try:
        info = file.lstat()
    except FileNotFoundError:
        pass
    else:
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe private Source configuration')
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-source-', dir=file.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, file)
        parent = os.open(file.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def prepare(root, value, port, game):
    settings(json.dumps(value), port, game)
    cfg = private_directory(root, 'private-cfg')
    private_directory(root, 'private-logs')
    prefix = 'tf_bot' if game in ('team-fortress-2','open-fortress') else 'bot'
    bots = (prefix+'_join_after_player 0\n'+prefix+'_quota_mode fill\n'+
            prefix+'_quota '+str(value['botFill'])+'\n')
    text = ('hostname "'+value['name']+'"\nrcon_password "'+value['rconPassword']+
            '"\nsv_lan 0\nsv_logfile 1\n'+bots)
    if game in ('counter-strike-source','open-fortress'):text+='mp_timelimit '+str(value['timeLimit'])+'\n'
    private_write(cfg/'playbound.cfg', text)
    # CS2 executes this after the shipped competitive config on map changes.
    if game == 'counter-strike-2':
        private_write(cfg/'gamemode_competitive_server.cfg', bots)


def arguments(value, port, game):
    settings(json.dumps(value), port, game)
    if game == 'open-fortress':
        return ['/game-data/srcds_linux','-game','open_fortress','-basedir','/server/runtime',
                '-norestart','-strictportbind','-nohltv','-ip','0.0.0.0','-port',str(port),
                '+clientport',str(port+1000),'+maxplayers',str(value['maxPlayers']),
                '+exec','playbound-managed.cfg','+map',value['map']]
    if game == 'counter-strike-source':
        return ['/game-data/srcds_linux','-game','cstrike','-basedir','/runtime',
                '-dedicated','-norestart','-strictportbind','-nohltv','-ip','0.0.0.0',
                '-port',str(port),'+clientport',str(port+1000),'-maxplayers',str(value['maxPlayers']),
                '+exec','playbound.cfg','+map',value['map']]
    if game == 'team-fortress-2':
        return ['/game-data/srcds_linux64', '-game', 'tf', '-basedir', '/runtime',
                '-dedicated', '-norestart', '-strictportbind', '-nohltv',
                '-ip', '0.0.0.0', '-port', str(port), '+clientport', str(port+1000),
                '+maxplayers', str(value['maxPlayers']), '+exec', 'playbound.cfg',
                '+map', value['map']]
    return ['/game-data/game/bin/linuxsteamrt64/cs2', '-dedicated', '-usercon',
            '-basedir', '/runtime/game', '+ip', '0.0.0.0', '-port', str(port),
            '-maxplayers', str(value['maxPlayers']), '+exec', 'playbound.cfg',
            '+map', value['map']]


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255:
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'], payload['game'])
    prepare(Path('/server'), value, payload['port'], payload['game'])
    command = arguments(value, payload['port'], payload['game'])
    os.chdir('/runtime/game' if payload['game'] == 'counter-strike-2' else '/runtime')
    os.execv(command[0], command)
