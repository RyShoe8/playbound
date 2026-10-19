#!/usr/bin/python3 -I
"""Fixed reviewed native identity handoff. No executable, path, environment or signal
is supplied by the caller. The unprivileged gate owns the cgroup first.
"""
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import signal
import stat
import subprocess
import sys
import time

ROOT = Path('/var/lib/playbound-customer-runtime')
LEGACY_ROOT = Path('/var/lib/playbound-host/customer-sandboxes')
ENV = {'PATH': '/usr/bin:/usr/games', 'LANG': 'C.UTF-8'}
PROFILE = 'teeworlds-unix-v1'
GAME = 'teeworlds'
NATIVE_GAMES = {
    'teeworlds': ('customer-sandboxes', 8303, 8323),
    'bzflag': ('bzflag-servers', 5155, 5174),
    'hedgewars': ('hedgewars-servers', 46631, 46650),
    'openttd': ('openttd-servers',3979,3999),
    'luanti': ('luanti-servers',30000,30020),
    'openarena': ('openarena-servers',27960,27980),
    'battle-for-wesnoth': ('wesnoth-servers',15000,15020),
    'supertuxkart': ('supertuxkart-servers',2759,2779),
    '0-ad': ('0ad-servers',20595,20595),
    'ysoccer': ('ysoccer-servers',54555,54575),
    'flightgear': ('flightgear-servers',5000,5010),
    'mindustry': ('mindustry',6567,6587),
    'hurry-curry': ('hurry-curry-servers',27032,27052),
    'assaultcube': ('assaultcube-servers',28763,28781),
    'xonotic': ('xonotic-servers',26000,26020),
    'wolfenstein-enemy-territory': ('et',27950,27959),
    'medal-of-honor-allied-assault': ('openmohaa',12203,12222),
    'freedoom': ('freedoom-servers',10666,10686),
    'freeciv': ('freeciv-servers',5556,5576),
    'warzone-2100': ('warzone-2100-servers',2100,2120),
    'hypersomnia': ('hypersomnia',8412,8432),
    'terraria': ('terraria-servers',7870,7890),
    'factorio': ('factorio-servers',34197,34217),
    'unvanquished': ('unvanquished',27965,27975),
    'openra': ('openra-servers',1234,1250),
    'openhv': ('openhv-servers',1255,1270),
    'earth-2140-trilogy': ('earth-2140-servers',1275,1290),
    'rimworld-together': ('rimworld-together-servers',25590,25610),
    'space-station-14': ('space-station-14-servers',1212,1222),
    'triplea': ('triplea-servers',3303,3323),
    'necesse': ('necesse-servers',14160,14180),
    'veloren': ('veloren-servers',14004,14004),
    'barotrauma': ('barotrauma-servers',27220,27238),
    'morrowind': ('morrowind-servers',25565,25585),
    'bombsquad': ('bombsquad-servers',43210,43230),
    'counter-strike-source': ('counter-strike-source-servers',27060,27070),
    'open-fortress': ('open-fortress-servers',27150,27169),
    'battlefield-1942-anthology': ('battlefield-1942-anthology-servers',14567,14586),
    'unturned': ('unturned-servers',27075,27099),
    'trackmania': ('trackmania-servers',23520,23538),
    'team-fortress-2': ('team-fortress-2-servers',27015,27025),
    'counter-strike-2': ('counter-strike-2-servers',27030,27040),
    'dont-starve-together': ('dont-starve-together-servers',11020,11041),
    'core-keeper': ('core-keeper-servers',1300,1320),
    're-volt-rvgl': ('rvgl-servers',2310,2330),
}

def select_game(game):
    global GAME, PROFILE, LEGACY_ROOT
    if game not in NATIVE_GAMES:
        raise ValueError('Unsupported native identity profile')
    GAME, PROFILE = game, game + '-unix-v1'
    LEGACY_ROOT = Path('/var/lib/playbound-host') / NATIVE_GAMES[game][0]

def journal_game(server_id):
    file = ROOT / server_id / 'control' / 'migration.json'
    for parent, mode in [(ROOT, 0o711), (ROOT / server_id, 0o711), (file.parent, 0o700)]:
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode:
            raise ValueError('Unsafe native profile journal parent')
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd) as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError('Unsafe native profile journal')
        value = json.load(source)
    if value.get('serverId') != server_id:
        raise ValueError('Native profile journal identity mismatch')
    game = value.get('gameSlug', 'teeworlds')
    if game not in NATIVE_GAMES:
        raise ValueError('Unsupported native journal game')
    return game



def trusted_module(name, filename):
    file = Path('/usr/local/libexec') / filename
    info = file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
        raise ValueError('Untrusted runtime dependency')
    loader = importlib.machinery.SourceFileLoader(name, str(file))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def request(args):
    if len(args) == 2 and args[0] == 'migration' and re.fullmatch(r'[a-f0-9]{24}', args[1]):
        return 'migration', args[1], None, None, None
    if len(args) == 8 and args[0] == 'run-native':
        game = args[4]
        if game not in NATIVE_GAMES or game == 'teeworlds': raise ValueError('Unsupported native runtime')
        select_game(game)
        result = request(['run', *args[1:4], *args[5:]])
        return result
    if len(args) not in (4, 7) or args[0] not in ('run', 'stop', 'status') or not re.fullmatch(r'[a-f0-9]{24}', args[1]) or not re.fullmatch(r'[1-9][0-9]{0,9}', args[2]) or int(args[2]) <= 1 or not re.fullmatch(r'[a-f0-9-]{36}:[0-9]+', args[3]):
        raise ValueError('Invalid runtime identity')
    action, server_id, raw_pid, identity = args[:4]
    if (action == 'run') != (len(args) == 7):
        raise ValueError('Invalid runtime operation')
    extra = None
    if action == 'run':
        if not all(re.fullmatch(r'[1-9][0-9]{0,4}', value) for value in args[4:]):
            raise ValueError('Invalid runtime allocation')
        port, cpu, memory = map(int, args[4:])
        if not NATIVE_GAMES[GAME][1] <= port <= NATIVE_GAMES[GAME][2] or not 250 <= cpu <= 6000 or not 256 <= memory <= 8192:
            raise ValueError('Unsupported runtime allocation')
        if GAME == 'dont-starve-together' and (port-11020)%3:raise ValueError('Invalid DST port triple')
        if GAME == 'core-keeper' and (port-1300)%2:raise ValueError('Invalid Core Keeper port pair')
        if GAME == 'trackmania' and (port-23520)%2:raise ValueError('Invalid Trackmania port pair')
        if GAME == 'unturned' and (port-27075)%3:raise ValueError('Invalid Unturned port triple')
        if GAME == 'barotrauma' and (port-27220)%2:raise ValueError('Invalid Barotrauma port pair')
        if GAME == 'assaultcube' and port % 2 != 1: raise ValueError('Invalid AssaultCube port pair')
        if GAME == 'flightgear' and port % 2: raise ValueError('Invalid FlightGear port stride')
        if GAME == 'supertuxkart' and (port % 2 != 1 or port > 2777): raise ValueError('Invalid SuperTuxKart port pair')
        extra = port, cpu, memory
    return action, server_id, int(raw_pid), identity, extra


def config_bytes(text, port):
    if GAME != 'teeworlds':
        if not isinstance(text,str) or len(text.encode()) > 16384: raise ValueError('Invalid native configuration')
        values = json.loads(text)
        if GAME == 're-volt-rvgl':
            if values != {}: raise ValueError('RVGL settings are not verified')
            return json.dumps({'configuration':{},'port':port}).encode()
        if GAME == 'core-keeper':
            value = trusted_module('pb_corekeeper', 'playbound-customer-corekeeper').settings(text, port)
            return json.dumps({'configuration': value, 'port': port}).encode()
        if GAME in ('ysoccer','flightgear','triplea'):
            if values != {}: raise ValueError('Undeclared YSoccer setting')
            return text.encode()
        if GAME=='dont-starve-together':
            value=trusted_module('pb_dst','playbound-customer-dst').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME in ('team-fortress-2','counter-strike-2','counter-strike-source','open-fortress'):
            value=trusted_module('pb_source','playbound-customer-source').settings(text,port,GAME)
            return json.dumps({'configuration':value,'port':port,'game':GAME}).encode()
        if GAME=='trackmania':
            value=trusted_module('pb_trackmania','playbound-customer-trackmania').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME=='unturned':
            value=trusted_module('pb_unturned','playbound-customer-unturned').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME=='battlefield-1942-anthology':
            value=trusted_module('pb_battlefield','playbound-customer-battlefield').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME=='bombsquad':
            value=trusted_module('pb_bombsquad','playbound-customer-bombsquad').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME=='morrowind':
            value=trusted_module('pb_morrowind','playbound-customer-morrowind').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME=='barotrauma':
            value=trusted_module('pb_barotrauma','playbound-customer-barotrauma').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME=='veloren':
            return json.dumps(trusted_module('pb_veloren','playbound-customer-veloren').settings(text,port)).encode()
        if GAME=='necesse':
            if not isinstance(values,dict) or set(values)!={'maxPlayers'} or type(values['maxPlayers']) is not int or not 2<=values['maxPlayers']<=64:raise ValueError('Invalid Necesse settings')
            return text.encode()
        if GAME=='space-station-14':
            value=trusted_module('pb_ss14','playbound-customer-ss14').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME=='rimworld-together':
            value=trusted_module('pb_rimworld','playbound-customer-rimworld').settings(text,port)
            return json.dumps({'configuration':value,'port':port}).encode()
        if GAME in ('openra','openhv','earth-2140-trilogy'):
            return json.dumps(trusted_module('pb_openra','playbound-customer-openra').settings(text,GAME)).encode()
        if GAME == 'unvanquished':
            if not isinstance(values,dict) or set(values)!={'name','maxPlayers','botFill','map'} or not isinstance(values['name'],str) or not 1<=len(values['name'])<=100 or re.search(r'[\x00-\x1f\x7f]',values['name']) or not isinstance(values['map'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',values['map']):raise ValueError('Invalid Unvanquished text setting')
            if type(values['maxPlayers']) is not int or not 2<=values['maxPlayers']<=64 or type(values['botFill']) is not int or not 0<=values['botFill']<=32:raise ValueError('Invalid Unvanquished limits')
            return text.encode()
        if GAME == 'factorio':
            module=trusted_module('pb_factorio','playbound-customer-factorio-bootstrap')
            values=module.settings(text)
            if values['port']!=port:raise ValueError('Factorio allocated port differs')
            return text.encode()
        if GAME == 'terraria':
            if not isinstance(values,dict) or set(values)!={'name','maxPlayers'} or not isinstance(values['name'],str) or not 1<=len(values['name'])<=48 or re.search(r'[\x00-\x1f\x7f]',values['name']) or type(values['maxPlayers']) is not int or not 2<=values['maxPlayers']<=64:raise ValueError('Invalid Terraria settings')
            return text.encode()
        if GAME == 'hypersomnia':
            if not isinstance(values,dict) or set(values)!={'name','maxPlayers'} or not isinstance(values['name'],str) or not 1<=len(values['name'])<=40 or re.search(r'[\x00-\x1f\x7f]',values['name']) or type(values['maxPlayers']) is not int or not 2<=values['maxPlayers']<=64:raise ValueError('Invalid Hypersomnia settings')
            return json.dumps({'self_update':{'update_on_launch':False},'server_start':{'port':port,'slots':values['maxPlayers']},'server':{'server_name':values['name'],'daily_autoupdate':False,'sync_all_external_arenas_on_startup':False,'arena':'de_cyberaqua'},'num_ranked_servers':0,'num_casual_servers':1}).encode()
        if GAME == 'warzone-2100':
            keys={'name','map','maxPlayers','techLevel','bases','powerLevel','alliances','scavengers','openSpectatorSlots'}
            if not isinstance(values,dict) or set(values)!=keys or not isinstance(values['name'],str) or not 1<=len(values['name'])<=40 or re.search(r'[\x00-\x1f\x7f]',values['name']) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',str(values['map'])):raise ValueError('Invalid Warzone text settings')
            for key,low,high in [('maxPlayers',2,8),('techLevel',1,3),('bases',0,2),('powerLevel',0,2),('alliances',0,2),('scavengers',0,2),('openSpectatorSlots',0,10)]:
                if type(values[key]) is not int or not low<=values[key]<=high:raise ValueError('Invalid Warzone number')
            challenge={k:v for k,v in values.items()};challenge.update({'spectatorHost':True,'blindMode':'none'})
            return json.dumps({'locked':{'alliances':True,'scavengers':True,'bases':True},'challenge':challenge}).encode()
        if GAME == 'freeciv':
            if not isinstance(values,dict) or set(values)!={'maxPlayers'} or type(values['maxPlayers']) is not int or not 2<=values['maxPlayers']<=64:raise ValueError('Invalid Freeciv typed settings')
            return ('set maxplayers '+str(values['maxPlayers'])+'\n').encode()
        if GAME == 'freedoom':
            if not isinstance(values,dict) or set(values)!={'name','maxPlayers','map','mode','skill','fragLimit','timeLimit'} or not isinstance(values['name'],str) or not 1<=len(values['name'])<=100 or re.search(r'[\x00-\x1f\x7f"\\;]',values['name']) or not re.fullmatch(r'MAP(?:0[1-9]|[12][0-9]|3[0-2])',str(values['map'])) or values['mode'] not in ('coop','deathmatch','teamplay','ctf','duel','lastmanstanding'):
                raise ValueError('Invalid Zandronum text settings')
            for key,minimum,maximum in [('maxPlayers',2,64),('skill',1,5),('fragLimit',0,100000),('timeLimit',0,100000)]:
                if type(values[key]) is not int or not minimum<=values[key]<=maximum:raise ValueError('Invalid Zandronum number')
            return ('sv_hostname "'+values['name']+'"\nsv_maxplayers '+str(values['maxPlayers'])+'\nsv_maxclients '+str(values['maxPlayers'])+'\nsv_updatemaster false\nsv_broadcast false\nfraglimit '+str(values['fragLimit'])+'\ntimelimit '+str(values['timeLimit'])+'\n'+('' if values['mode']=='coop' else values['mode']+' 1\n')).encode()
        if GAME == 'medal-of-honor-allied-assault':
            if not isinstance(values,dict) or set(values)!={'name','maxPlayers','bots','map'} or not isinstance(values['name'],str) or not 1<=len(values['name'])<=48 or re.search(r'[\x00-\x1f\x7f"\\;]',values['name']) or type(values['maxPlayers']) is not int or not 2<=values['maxPlayers']<=64 or type(values['bots']) is not int or not 0<=values['bots']<=values['maxPlayers'] or not re.fullmatch(r'dm/mohdm[1-7]',str(values['map'])):
                raise ValueError('Invalid OpenMoHAA typed settings')
            return ('set sv_hostname "'+values['name']+'"\nset sv_maxclients '+str(values['maxPlayers'])+'\nset sv_gamespy 0\nset g_gametype 1\nset sv_maxbots '+str(values['bots'])+'\nset sv_minPlayers '+str(values['bots'])+'\n').encode()
        if GAME == 'wolfenstein-enemy-territory':
            if not isinstance(values,dict) or set(values)!={'name','maxPlayers','rconPassword'} or not isinstance(values['name'],str) or not 1<=len(values['name'])<=100 or re.search(r'[\x00-\x1f\x7f"\\;]',values['name']) or type(values['maxPlayers']) is not int or not 2<=values['maxPlayers']<=64 or not re.fullmatch(r'[A-Za-z0-9_-]{24,64}',str(values['rconPassword'])):
                raise ValueError('Invalid ET typed settings')
            return ('set sv_hostname "'+values['name']+'"\nset sv_maxclients '+str(values['maxPlayers'])+'\nset rconpassword "'+values['rconPassword']+'"\nset sv_master1 ""\nset sv_pure 0\nset omnibot_enable 0\nset g_warmup 10\nset g_antilag 0\n').encode()
        if GAME == 'xonotic':
            if not isinstance(values,dict) or set(values)!={'name','maxPlayers','map','gameType','rconPassword','bots','fragLimit','timeLimit'}:
                raise ValueError('Undeclared Xonotic setting')
            if not isinstance(values['name'],str) or not 1<=len(values['name'])<=100 or re.search(r'[\x00-\x1f\x7f"\\;]',values['name']) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',str(values['map'])) or not re.fullmatch(r'[A-Za-z0-9_-]{24,64}',str(values['rconPassword'])) or values['gameType'] not in ('dm','tdm','ctf','ca','duel','lms','kh','dom','as','race','cts','nb','ft','ka','inv'):
                raise ValueError('Invalid Xonotic text setting')
            for key,minimum,maximum in [('maxPlayers',2,64),('bots',0,64),('fragLimit',-1,100000),('timeLimit',-1,100000)]:
                if type(values[key]) is not int or not minimum<=values[key]<=maximum:raise ValueError('Invalid Xonotic number')
            if values['bots']>values['maxPlayers']:raise ValueError('Invalid Xonotic bot limit')
            return ('hostname "'+values['name']+'"\nsv_public 0\nrcon_secure 0\nrcon_password "'+values['rconPassword']+'"\nmaxplayers '+str(values['maxPlayers'])+'\ngametype '+values['gameType']+'\nbot_join_empty 1\nminplayers '+str(values['bots'])+'\nfraglimit_override '+str(values['fragLimit'])+'\ntimelimit_override '+str(values['timeLimit'])+'\n').encode()
        if GAME in ('hurry-curry','assaultcube'):
            if not isinstance(values,dict) or set(values) != {'name','maxPlayers'} or not isinstance(values['name'],str) or not 1 <= len(values['name']) <= 40 or re.search(r'[\x00-\x1f\x7f]',values['name']) or type(values['maxPlayers']) is not int or not 2 <= values['maxPlayers'] <= 64:
                raise ValueError('Invalid game typed settings')
            return b'' if GAME == 'assaultcube' else text.encode()
        if GAME == 'mindustry':
            if not isinstance(values,dict) or set(values) != {'name','maxPlayers'} or not isinstance(values['name'],str) or not re.fullmatch(r"[A-Za-z0-9 ._'\-]{1,80}",values['name']) or type(values['maxPlayers']) is not int or not 2 <= values['maxPlayers'] <= 64:
                raise ValueError('Invalid Mindustry typed settings')
            return text.encode()
        if GAME == '0-ad':
            if not isinstance(values,dict) or set(values) != {'map','maxPlayers'} or not isinstance(values['map'],str) or not re.fullmatch(r'(?:random|scenarios|skirmishes)/[A-Za-z0-9_-]{1,64}',values['map']) or type(values['maxPlayers']) is not int or not 2 <= values['maxPlayers'] <= 8:
                raise ValueError('Invalid 0 A.D. typed settings')
            return text.encode()
        if GAME == 'supertuxkart':
            if not isinstance(values,dict) or set(values) != {'name','maxPlayers','mode','difficulty'} or not isinstance(values['name'],str) or not 1 <= len(values['name']) <= 100 or re.search(r'[\x00-\x1f\x7f]',values['name']):
                raise ValueError('Invalid SuperTuxKart settings')
            for key,minimum,maximum in [('maxPlayers',2,12),('mode',0,8),('difficulty',0,3)]:
                if type(values[key]) is not int or not minimum <= values[key] <= maximum: raise ValueError('Invalid SuperTuxKart allocation')
            if values['mode'] not in (0,1,3,4,6,7,8): raise ValueError('Unsupported SuperTuxKart mode')
            return text.encode()
        if GAME == 'battle-for-wesnoth':
            if values != {}: raise ValueError('Undeclared Wesnoth setting')
            return b'versions_accepted="1.18.*"\n'
        if GAME == 'openarena':
            if not isinstance(values,dict) or set(values) != {'maxPlayers','botPlayers','name','rconPassword'}:
                raise ValueError('Undeclared OpenArena setting')
            if type(values['maxPlayers']) is not int or not 2 <= values['maxPlayers'] <= 64 or type(values['botPlayers']) is not int or not 0 <= values['botPlayers'] <= values['maxPlayers']:
                raise ValueError('Invalid OpenArena player limit')
            if not isinstance(values['name'],str) or not 1 <= len(values['name']) <= 100 or re.search(r'[\x00-\x1f\x7f"\\;]',values['name']) or not isinstance(values['rconPassword'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{24,64}',values['rconPassword']):
                raise ValueError('Invalid OpenArena text setting')
            return ('set sv_hostname "' + values['name'] + '"\nset rconpassword "' + values['rconPassword'] + '"\nset sv_maxclients ' + str(values['maxPlayers']) + '\nset sv_master1 ""\nset bot_enable 1\nset bot_minplayers ' + str(values['botPlayers']) + '\n').encode()
        if not isinstance(values,dict) or set(values) != ({'maxPlayers','scoreLimit'} if GAME == 'bzflag' else {'maxPlayers'} if GAME in ('openttd','luanti') else set()):
            raise ValueError('Undeclared native settings')
        for key, maximum in [('maxPlayers',200),('scoreLimit',100)]:
            if key in values and (type(values[key]) is not int or not (2 if key == 'maxPlayers' else 0) <= values[key] <= maximum):
                raise ValueError('Invalid native setting number')
        if GAME in ('openttd','luanti'):
            if values['maxPlayers'] > 64: raise ValueError('Native player limit exceeded')
            if GAME == 'openttd':
                return ('[network]\nmax_clients = ' + str(values['maxPlayers']) + '\n').encode()
            # Root-generated configuration cannot grant a mod HTTP or insecure
            # Lua access. This is defense in depth, not a fix for engine CVEs.
            return ('server_announce = false\nsecure.enable_security = true\nsecure.trusted_mods =\nsecure.http_mods =\nmax_users = ' + str(values['maxPlayers']) + '\n').encode()
        return text.encode()
    if not isinstance(text, str) or len(text.encode('utf-8')) > 16384 or any(char in text for char in '\0\r;'):
        raise ValueError('Invalid Teeworlds configuration')
    values = {}
    numeric = {'sv_port': (port, port), 'sv_register': (0, 0), 'sv_max_clients': (2, 64), 'sv_spectator_slots': (0, 64), 'sv_scorelimit': (0, 100000), 'sv_timelimit': (0, 100000)}
    for line in text.splitlines():
        if not line.strip(): continue
        key, separator, value = line.partition(' ')
        if not separator or key in values or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError('Invalid configuration line')
        if key in numeric:
            lo, hi = numeric[key]
            if not re.fullmatch(r'[0-9]+', value) or not lo <= int(value) <= hi: raise ValueError('Invalid configuration number')
        elif key in ('sv_name', 'sv_motd'):
            if not 1 <= len(value) <= 128 or '"' in value or '\\' in value: raise ValueError('Invalid configuration text')
        elif key == 'sv_map':
            if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', value): raise ValueError('Invalid map')
        elif key == 'sv_gametype':
            if value not in ('dm', 'tdm', 'ctf'): raise ValueError('Invalid game mode')
        else:
            raise ValueError('Undeclared configuration key')
        values[key] = value
    if values.get('sv_port') != str(port) or values.get('sv_register') != '0' or 'sv_max_clients' not in values:
        raise ValueError('Missing private server configuration')
    return text.encode('utf-8')


def directory(file, uid=0, mode=0o711):
    try:
        file.mkdir(mode=mode)
        os.chown(file, uid, uid)
    except FileExistsError:
        pass
    info = file.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or stat.S_IMODE(info.st_mode) != mode:
        raise ValueError('Unsafe runtime directory')


def workspace(server_id, uid):
    for file in [Path('/'), Path('/var'), Path('/var/lib')]:
        info = file.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('Unsafe runtime ancestor')
    directory(ROOT)
    root = ROOT / server_id
    directory(root)
    directory(root / 'control', mode=0o700)
    directory(root / 'data', uid=uid, mode=0o700)
    return root


def binding_write(root, value):
    temporary = root / 'control' / ('binding-' + str(os.getpid()) + '.tmp')
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as handle:
            json.dump(value, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, root / 'control' / 'current.json')
        directory_fd = os.open(root / 'control', os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        temporary.unlink(missing_ok=True)


def binding_read(server_id, pid, identity):
    # All ancestors must remain root-owned, including the non-writable public
    # traversal directories. No caller path is ever opened.
    for file, mode in [(ROOT, 0o711), (ROOT / server_id, 0o711), (ROOT / server_id / 'control', 0o700)]:
        info = file.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode: raise ValueError('Unsafe runtime binding')
    fd = os.open(ROOT / server_id / 'control' / 'current.json', os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 4096: raise ValueError('Unsafe runtime binding')
        value = json.load(handle)
    if value.get('serverId') != server_id or value.get('gatePid') != pid or value.get('gateIdentity') != identity or value.get('profile') != PROFILE:
        raise ValueError('Runtime binding identity mismatch')
    return value


def scope_path(server_id, pid):
    return Path('/sys/fs/cgroup/system.slice') / f'playbound-customer-{server_id}-{pid}.scope'


def verify_scope(resources, server_id, pid, identity, cpu, memory):
    uid = pwd.getpwnam('playbound').pw_uid
    resources.verify_process(pid, identity, uid)
    scope = scope_path(server_id, pid)
    if (Path('/proc') / str(pid) / 'cgroup').read_text().strip() != '0::/system.slice/' + scope.name: raise ValueError('Gate is not placed')
    quota, period = (scope / 'cpu.max').read_text().split()
    if quota == 'max' or int(quota) * 1000 != cpu * int(period) or (scope / 'memory.max').read_text().strip() != str(memory * 1024 ** 2) or (scope / 'memory.swap.max').read_text().strip() != '0' or (scope / 'pids.max').read_text().strip() != '128' or (scope / 'memory.oom.group').read_text().strip() != '1': raise ValueError('Runtime allocation differs')
    return scope


def identity_database(uid,gid):
    if type(uid) is not int or type(gid) is not int or uid!=gid or not 40000<=uid<=40255:
        raise ValueError('Invalid private runtime account')
    descriptor=os.memfd_create('pb-runtime-account',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
    try:
        os.write(descriptor,('playbound-runtime:x:'+str(uid)+':'+str(gid)+':Private game runtime:/server:/usr/sbin/nologin\n').encode())
        os.lseek(descriptor,0,os.SEEK_SET)
        fcntl.fcntl(descriptor,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
        return descriptor
    except BaseException:
        os.close(descriptor);raise


DOTNET_GC_GAMES=('barotrauma','space-station-14','rimworld-together','openra','openhv','earth-2140-trilogy')

def barotrauma_binds(asset_directory,data):
    # The game derives its base directory from its own location and writes there, so /game-data becomes the private runtime directory with the read-only bundle overlaid entry by entry.
    result=['--bind',str(data/'runtime'),'/game-data']
    for name in sorted(os.listdir(asset_directory)):
        if name in ('serversettings.xml',):continue
        if not re.fullmatch(r'[A-Za-z0-9_+.-]{1,100}',name):raise ValueError('Unsafe Barotrauma asset entry')
        result+=['--ro-bind','/proc/self/fd/'+str(asset_directory)+'/'+name,'/game-data/'+name]
    return result


def command(data, fd, port, memory, engine_fd=None, native_settings=None, seccomp_fd=None, dns_fd=None, assets=(), asset_directory=None, identity_fd=None, python_directory=None, dependency_directory=None, identity_files=()):
    if GAME == 're-volt-rvgl' and (asset_directory is None or seccomp_fd is not None):
        raise ValueError('Pinned RVGL assets and private display handoff required')
    if GAME == 'core-keeper':
        if (seccomp_fd is not None or asset_directory is None
                or len(identity_files) != 2
                or {name for _, name in identity_files} != {'GameID.txt', 'GameInfo.txt'}
                or any(type(descriptor) is not int or descriptor < 3 for descriptor, _ in identity_files)):
            raise ValueError('Pinned Core Keeper assets and identity mounts required')
    target = {'teeworlds':'/usr/games/teeworlds-server','bzflag':'/usr/games/bzfs','hedgewars':'/usr/lib/hedgewars/bin/hedgewars-server','openttd':'/usr/games/openttd','luanti':'/usr/games/minetestserver','openarena':'/usr/lib/ioquake3/ioq3ded','battle-for-wesnoth':'/usr/games/wesnothd-1.18','supertuxkart':'/usr/games/supertuxkart','0-ad':'/usr/games/pyrogenesis','ysoccer':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','flightgear':'/engine-native','mindustry':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','hurry-curry':'/engine-native','assaultcube':'/engine-native','xonotic':'/engine-native','wolfenstein-enemy-territory':'/engine-native','medal-of-honor-allied-assault':'/engine-native','freedoom':'/game-data/zandronum-server','freeciv':'/engine-native','warzone-2100':'/engine-native','hypersomnia':'/engine-native','terraria':'/game-data/TerrariaServer.bin.x86_64','factorio':'/usr/bin/python3','unvanquished':'/game-data/daemonded','openra':'/game-data/OpenRA.Server','openhv':'/game-data/OpenHV.Server','earth-2140-trilogy':'/game-data/OpenE2140','rimworld-together':'/usr/bin/python3','space-station-14':'/usr/bin/python3','triplea':'/game-data/jre/temurin-25/bin/java','necesse':'/game-data/jre/bin/java','veloren':'/usr/bin/python3','barotrauma':'/usr/bin/python3','morrowind':'/usr/bin/python3','bombsquad':'/usr/bin/python3','counter-strike-source':'/usr/bin/python3','open-fortress':'/usr/bin/python3','battlefield-1942-anthology':'/usr/bin/python3','unturned':'/usr/bin/python3','trackmania':'/usr/bin/python3','team-fortress-2':'/usr/bin/python3','counter-strike-2':'/usr/bin/python3','dont-starve-together':'/usr/bin/python3','core-keeper':'/usr/bin/python3','re-volt-rvgl':'/usr/bin/python3'}[GAME]
    settings = native_settings or {}
    game_args = ['-f','server.cfg','sv_port '+str(port)] if GAME == 'teeworlds' else ['-p',str(port)] if GAME == 'hedgewars' else [] if GAME in ('openttd','luanti','openarena','battle-for-wesnoth','supertuxkart','0-ad','ysoccer','flightgear','mindustry','hurry-curry','assaultcube','xonotic','wolfenstein-enemy-territory','medal-of-honor-allied-assault','freedoom','freeciv','warzone-2100','hypersomnia','terraria','factorio','unvanquished','openra','openhv','earth-2140-trilogy','rimworld-together','space-station-14','triplea','necesse','veloren','barotrauma','dont-starve-together','morrowind','team-fortress-2','counter-strike-2','trackmania','unturned','bombsquad','counter-strike-source','open-fortress','battlefield-1942-anthology','core-keeper','re-volt-rvgl') else ['-p',str(port),'-offa','-q','-j','+r','+s',str(settings['scoreLimit']),'-mp',str(settings['maxPlayers'])]
    if GAME == 'openarena': game_args = ['+set','com_basegame','baseoa','+set','fs_basepath','/usr/lib/openarena-server','+set','fs_homepath','/server','+set','com_legacyprotocol','71','+set','com_protocol','71','+set','dedicated','1','+set','net_port',str(port),'+exec','playbound.cfg','+map','oa_dm1']
    if GAME == 'flightgear': game_args = ['-p',str(port),'-a',str(port+1),'-b','0','-d']
    if GAME in ('openra','openhv','earth-2140-trilogy'):target,game_args=trusted_module('pb_openra','playbound-customer-openra').arguments(settings,port)
    if GAME=='unvanquished':game_args=['-homepath','/server','-pakpath','/game-data/pkg','-set','net_port',str(port),'-set','sv_hostname',settings['name'],'-set','sv_maxclients',str(settings['maxPlayers']),'-set','g_bot_defaultFill',str(settings['botFill']),'+map',settings['map']]
    if GAME=='re-volt-rvgl':game_args=['-I','/rvgl-bootstrap.py']
    if GAME=='core-keeper':game_args=['-I','/corekeeper-bootstrap.py']
    if GAME=='dont-starve-together':game_args=['-I','/dst-bootstrap.py']
    if GAME in ('team-fortress-2','counter-strike-2','counter-strike-source','open-fortress'):game_args=['-I','/source-bootstrap.py']
    if GAME=='trackmania':game_args=['-I','/trackmania-bootstrap.py']
    if GAME=='unturned':game_args=['-I','/unturned-bootstrap.py']
    if GAME=='open-fortress':game_args=['-I','/openfortress-bootstrap.py']
    if GAME=='battlefield-1942-anthology':game_args=['-I','/battlefield-bootstrap.py']
    if GAME=='bombsquad':game_args=['-I','/bombsquad-bootstrap.py']
    if GAME=='morrowind':game_args=['-I','/morrowind-bootstrap.py']
    if GAME=='barotrauma':game_args=['-I','/barotrauma-bootstrap.py']
    if GAME=='veloren':game_args=['-I','/veloren-bootstrap.py']
    if GAME=='necesse':game_args=['-Xms64m','-Xmx512M','-XX:MaxMetaspaceSize=128m','-XX:ReservedCodeCacheSize=64m','-XX:CompressedClassSpaceSize=64m','-XX:+UseSerialGC','-XX:+DisableAttachMechanism','-XX:+PerfDisableSharedMem','-Duser.home=/server','-jar','/game-data/Server.jar','-nogui','-world','PlayBound','-port',str(port),'-slots',str(settings['maxPlayers']),'-datadir','/server','-pausewhenempty','0']
    if GAME=='triplea':game_args=['-server','-Xms64m','-Xmx512M','-XX:MaxMetaspaceSize=128m','-XX:ReservedCodeCacheSize=64m','-XX:CompressedClassSpaceSize=64m','-XX:+UseSerialGC','-XX:+DisableAttachMechanism','-Djava.awt.headless=true','-Duser.home=/server','-XX:+PerfDisableSharedMem','-XX:ActiveProcessorCount=1','-jar','/game-data/games/triplea/bin/game-headless.jar','-Ptriplea.server=true','-Ptriplea.server.password=']
    if GAME=='space-station-14':game_args=['-I','/ss14-bootstrap.py']
    if GAME=='rimworld-together':game_args=['-I','/rimworld-bootstrap.py']
    if GAME=='factorio':game_args=['-I','/bootstrap.py']
    if GAME=='terraria':game_args=['-port',str(port),'-maxplayers',str(settings['maxPlayers']),'-world','/server/Worlds/world.wld','-autocreate','2','-worldname',settings['name'],'-noupnp']
    if GAME == 'hypersomnia':game_args=['--appimage-extract-and-run','--no-update-on-launch','--dedicated-server','--server-port',str(port),'--appdata-dir','/server']
    if GAME == 'warzone-2100': game_args=['--datadir=/game-data/data','--configdir=/server','--autohost=playbound.json','--gameport='+str(port),'--startplayers=1','--headless','--nosound']
    if GAME == 'freeciv': game_args = ['-p',str(port),'--read','/server/server.cfg','--saves','/server/saves']
    if GAME == 'freedoom': game_args = ['-host','-port',str(port),'-iwad','/game-data/freedoom2.wad','-config','/server/zandronum.ini','-exec','/server/server.cfg','-skill',str(settings['skill']),'+map',settings['map']]
    if GAME == 'medal-of-honor-allied-assault': game_args = ['+set','fs_basepath','/game-data','+set','fs_homepath','/server','+set','net_port',str(port),'+set','dedicated','1','+exec','playbound.cfg','+map',settings['map']]
    if GAME == 'wolfenstein-enemy-territory': game_args = ['+set','fs_basepath','/game-data','+set','fs_homepath','/server','+set','fs_game','legacy','+set','dedicated','1','+set','net_port',str(port),'+exec','playbound.cfg','+map','oasis']
    if GAME == 'xonotic': game_args = ['-xonotic','-basedir','/game-data','-userdir','/server','+port',str(port),'+exec','server.cfg','+map',settings['map']]
    if GAME == 'assaultcube': game_args = ['-c'+str(settings['maxPlayers']),'-n'+settings['name'],'-f'+str(port),'-m','-H/server/logs/','-W/server/demos/','-A/server/server.cfg','-r/server/server.cfg','-X/server/server.cfg','-B/server/server.cfg','-G/server/server.cfg','-K/server/server.cfg','-g/server/server.cfg','-U/server/vita']
    if GAME == 'hurry-curry': game_args = ['--listen','0.0.0.0:'+str(port),'--server-name',settings['name'],'--max-players',str(settings['maxPlayers']),'--data-dir','/game-data']
    if GAME == 'mindustry': game_args = ['-Xms64m','-Xmx768m','-XX:MaxMetaspaceSize=128m','-XX:ReservedCodeCacheSize=64m','-XX:CompressedClassSpaceSize=64m','-XX:+UseSerialGC','-XX:ActiveProcessorCount=1','-XX:+PerfDisableSharedMem','-Dorg.jline.terminal.dumb=true','-jar','/engine.jar','config name '+settings['name']+',config port '+str(port)+',playerlimit '+str(settings['maxPlayers'])+',host']
    if GAME == 'ysoccer': game_args = ['-Xms64m','-Xmx512m','-XX:MaxMetaspaceSize=128m','-XX:ReservedCodeCacheSize=64m','-XX:CompressedClassSpaceSize=64m','-XX:+UseSerialGC','-XX:ActiveProcessorCount=1','-XX:+PerfDisableSharedMem','-jar','/engine.jar',str(port),str(port)]
    if GAME == '0-ad': game_args = ['-autostart='+settings['map'],'-autostart-host','-autostart-host-players='+str(settings['maxPlayers']),'-autostart-playername=PlayBound Server','-autostart-seed=-1','-autostart-nonvisual','-quickstart','-nosound']
    if GAME == 'supertuxkart': game_args = ['--lan-server='+settings['name'],'--port='+str(port),'--no-graphics','--max-players='+str(settings['maxPlayers']),'--mode='+str(settings['mode']),'--difficulty='+str(settings['difficulty'])]
    if GAME == 'battle-for-wesnoth': game_args = ['-c','/server/server.cfg','-p',str(port)]
    if GAME == 'openttd': game_args = ['-D','0.0.0.0:'+str(port),'-c','/server/server.cfg']
    if GAME == 'luanti': game_args = ['--port',str(port),'--world','/server/world','--gameid','minetest','--config','/server/server.cfg','--logfile','/server/minetest.log']
    return ['/usr/bin/prlimit', '--as=' + str(max(16 * 1024 ** 3 if GAME == 'core-keeper' else 1024 ** 3, memory * 2 * 1024 ** 2)), '--nofile=1024', '--core=0', '--', '/usr/bin/bwrap',
            *(['--seccomp', str(seccomp_fd)] if seccomp_fd is not None else []),
            '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-cgroup', '--disable-userns', '--cap-drop', 'ALL', '--die-with-parent',
            '--ro-bind', '/usr', '/usr', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--symlink', 'usr/bin', '/bin',
            *(['--perms', '0555', '--ro-bind-data', str(engine_fd), '/engine.jar' if GAME in ('ysoccer','mindustry') else '/python/bin/python3.14' if GAME=='bombsquad' else target] if engine_fd is not None else []),
            *(['--ro-bind','/proc/self/fd/'+str(asset_directory),'/game-data/data' if GAME=='xonotic' else '/game-data'] if asset_directory is not None else []),
            *[part for descriptor,target in assets for part in ['--perms','0444','--ro-bind-data',str(descriptor),target]],
            *(['--ro-bind','/usr/local/libexec/playbound-customer-factorio-bootstrap','/bootstrap.py'] if GAME=='factorio' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-rimworld-bootstrap','/rimworld-bootstrap.py','--ro-bind','/usr/local/libexec/playbound-customer-rimworld','/rimworld-contract.py'] if GAME=='rimworld-together' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-ss14','/ss14-bootstrap.py'] if GAME=='space-station-14' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-dst','/dst-bootstrap.py'] if GAME=='dont-starve-together' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-source','/source-bootstrap.py'] if GAME in ('team-fortress-2','counter-strike-2','counter-strike-source','open-fortress') else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-trackmania','/trackmania-bootstrap.py'] if GAME=='trackmania' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-unturned','/unturned-bootstrap.py'] if GAME=='unturned' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-openfortress','/openfortress-bootstrap.py','--ro-bind','/usr/local/libexec/playbound-customer-source','/source-contract.py','--ro-bind','/proc/self/fd/'+str(dependency_directory),'/tf2'] if GAME=='open-fortress' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-battlefield','/battlefield-bootstrap.py'] if GAME=='battlefield-1942-anthology' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-bombsquad','/bombsquad-bootstrap.py','--ro-bind','/proc/self/fd/'+str(python_directory)+'/lib','/python/lib'] if GAME=='bombsquad' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-morrowind','/morrowind-bootstrap.py','--ro-bind','/usr/local/libexec/playbound-customer-morrowind-admin.lua','/morrowind-admin.lua'] if GAME=='morrowind' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-barotrauma','/barotrauma-bootstrap.py'] if GAME=='barotrauma' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-veloren','/veloren-bootstrap.py'] if GAME=='veloren' else []),
            *(['--ro-bind','/usr/local/libexec/playbound-customer-corekeeper','/corekeeper-bootstrap.py','--ro-bind','/usr/local/libexec/playbound-customer-display','/display-helper.py'] if GAME=='core-keeper' else []),
            *[part for descriptor, name in identity_files for part in ('--bind','/proc/self/fd/'+str(descriptor),'/game-data/'+name)],
            *(['--ro-bind','/usr/local/libexec/playbound-customer-rvgl','/rvgl-bootstrap.py','--ro-bind','/usr/local/libexec/playbound-customer-display','/display-helper.py'] if GAME=='re-volt-rvgl' else []),
            '--proc', '/proc', '--dev', '/dev', '--size', '1073741824' if GAME in ('openra','openhv','earth-2140-trilogy') and settings['family']!='openra' else '268435456' if GAME in ('hypersomnia','rimworld-together') else '67108864', '--tmpfs', '/tmp', '--bind', str(data), '/server', '--ro-bind-data', str(fd), '/server/baseoa/playbound.cfg' if GAME == 'openarena' else '/server/data/server.cfg' if GAME == 'xonotic' else '/server/legacy/playbound.cfg' if GAME == 'wolfenstein-enemy-territory' else '/server/main/playbound.cfg' if GAME=='medal-of-honor-allied-assault' else '/server/autohost/playbound.json' if GAME=='warzone-2100' else '/server/user/conf.d/50-playbound.json' if GAME=='hypersomnia' else '/server/server.cfg',
            *([*barotrauma_binds(asset_directory,data),'--ro-bind','/proc/self/fd/'+str(asset_directory)+'/linux64/steamclient.so','/server/.steam/sdk64/steamclient.so'] if GAME=='barotrauma' else []),
            *(['--ro-bind','/proc/self/fd/'+str(asset_directory),'/runtime','--bind',str(data/'private-cfg'),'/runtime/'+('tf' if GAME=='team-fortress-2' else 'cstrike' if GAME=='counter-strike-source' else 'game/csgo')+'/cfg','--bind',str(data/'private-logs'),'/runtime/'+('tf' if GAME=='team-fortress-2' else 'cstrike' if GAME=='counter-strike-source' else 'game/csgo')+'/logs'] if GAME in ('team-fortress-2','counter-strike-2','counter-strike-source') else []),
            *(['--ro-bind','/proc/self/fd/'+str(asset_directory)+'/linux64/steamclient.so','/server/.steam/sdk64/steamclient.so'] if GAME=='team-fortress-2' else []),
            *(['--ro-bind','/proc/self/fd/'+str(asset_directory)+'/Packs','/server/runtime/Packs'] if GAME=='trackmania' else []),
            *(['--ro-bind','/proc/self/fd/'+str(asset_directory),'/runtime','--bind',str(data),'/runtime/Servers/PlayBound','--bind',str(data),'/game-data/Servers/PlayBound','--ro-bind','/proc/self/fd/'+str(asset_directory)+'/linux64/steamclient.so','/server/.steam/sdk64/steamclient.so'] if GAME=='unturned' else []),
            *(trusted_module('pb_rvgl','playbound-customer-rvgl').mounts(asset_directory) if GAME=='re-volt-rvgl' else []),
            *(trusted_module('pb_openfortress','playbound-customer-openfortress').mounts(asset_directory) if GAME=='open-fortress' else []),
            *(['--ro-bind','/proc/self/fd/'+str(asset_directory)+'/bin/steamclient.so','/server/.steam/sdk32/steamclient.so'] if GAME=='open-fortress' else []),
            *[part for filename in ['/etc/protocols','/etc/services','/etc/hosts','/etc/resolv.conf','/etc/ssl/certs'] if Path(filename).exists() for part in ['--ro-bind',filename,filename]],
            *(['--ro-bind','/etc/java-21-openjdk','/etc/java-21-openjdk'] if GAME == 'mindustry' else []),
            *(['--ro-bind-data', str(dns_fd), '/etc/resolv.conf'] if dns_fd is not None else []),
            *(['--perms','0444','--ro-bind-data', str(identity_fd), '/etc/passwd'] if identity_fd is not None else []),
            '--clearenv', '--setenv', 'PATH', '/usr/bin:/usr/games', '--setenv', 'HOME', '/server', '--setenv', 'XDG_DATA_HOME', '/server', '--setenv', 'XDG_CONFIG_HOME', '/server', '--setenv', 'LANG', 'C.UTF-8', '--chdir', '/server/runtime' if GAME=='barotrauma' else '/game-data' if GAME in ('assaultcube','medal-of-honor-allied-assault','freedoom','unvanquished','openra','openhv','earth-2140-trilogy','space-station-14','necesse') else '/server',
            *(['--setenv','LD_LIBRARY_PATH','/game-data/bin64/lib64:/game-data/linux64'] if GAME=='dont-starve-together' else []),
            *(['--setenv','LD_LIBRARY_PATH','/game-data/bin'] if GAME=='counter-strike-source' else []),
            *(['--setenv','LD_LIBRARY_PATH','/server/runtime/bin'] if GAME=='open-fortress' else []),
            *(['--setenv','LD_LIBRARY_PATH','/game-data/bin/linux64:/game-data/linux64'] if GAME=='team-fortress-2' else []),
            *(['--setenv','LD_LIBRARY_PATH','/game-data/game/bin/linuxsteamrt64:/game-data/game/csgo/bin/linuxsteamrt64'] if GAME=='counter-strike-2' else []),
            *(['--setenv','LD_LIBRARY_PATH','/game-data:/game-data/linux64'] if GAME=='unturned' else []),
            *(['--setenv','LD_LIBRARY_PATH','/python/lib','--setenv','PYTHONDONTWRITEBYTECODE','1','--setenv','BA_DEVICE_NAME',settings['name']] if GAME=='bombsquad' else []),
            *(['--setenv','LD_LIBRARY_PATH','/game-data/lib'] if GAME=='morrowind' else []),
            *(['--setenv','DOTNET_EnableDiagnostics','0','--setenv','LD_LIBRARY_PATH','/game-data:/game-data/linux64'] if GAME=='barotrauma' else []),
            *(['--setenv','VELOREN_USERDATA','/server/userdata','--setenv','VELOREN_ASSETS','/game-data/assets','--setenv','SDL_VIDEODRIVER','dummy','--setenv','SDL_AUDIODRIVER','dummy'] if GAME=='veloren' else []),
            *(['--setenv','JAVA_HOME','/game-data/jre'] if GAME=='necesse' else []),
            *(['--setenv','JAVA_HOME','/game-data/jre/temurin-25','--setenv','BOT_COMMENT','automated_host','--setenv','BOT_NAME','Bot_PB_'+str(port),'--setenv','BOT_PORT',str(port),'--setenv','BOT_LOBBY_URI','https://prod.triplea-game.org','--setenv','MAPS_FOLDER','/server/downloadedMaps'] if GAME=='triplea' else []),
            *(['--setenv','DOTNET_ROOT','/usr/lib/dotnet','--setenv','DOTNET_EnableDiagnostics','0'] if GAME=='space-station-14' else []),
            *(['--setenv','DOTNET_EnableDiagnostics','0','--setenv','DOTNET_BUNDLE_EXTRACT_BASE_DIR','/tmp/dotnet'] if GAME=='rimworld-together' else []),
            *(['--setenv','DOTNET_EnableDiagnostics','0'] if GAME in ('openra','openhv','earth-2140-trilogy') else []),
            *(['--setenv','DOTNET_GCHeapHardLimit',format(memory*1024**2//4,'x'),'--setenv','DOTNET_GCRegionRange',format(memory*1024**2//2,'x')] if GAME in DOTNET_GC_GAMES else []),
            *(['--setenv','MONO_IOMAP','all','--setenv','LD_LIBRARY_PATH','/game-data/lib64'] if GAME=='terraria' else []),
            *(['--setenv','LD_LIBRARY_PATH','/game-data/lib:/game-data/lib/x86_64-linux-gnu','--setenv','FREECIV_DATA_PATH','/game-data/share/freeciv'] if GAME=='freeciv' else []),
            *(['--setenv', 'PLAYBOUND_STK_DISCOVERY_PORT', str(port+1)] if GAME == 'supertuxkart' else []),
            '--', target, *game_args]


def verify_supervisor_scope(scope):
    if Path('/proc/self/cgroup').read_text().strip() != '0::/system.slice/' + scope.name:
        raise ValueError('Supervisor did not inherit the fenced scope')


def private_display_handoff(arguments, uid, entry_fd, source_fd):
    """Internal root-built command; identity is dropped by Popen before exec."""
    policy = trusted_module('pb_display_policy', 'playbound-customer-display-policy')
    label = policy.verify_enforced(uid)
    entry = trusted_module('pb_display_entry', 'playbound-customer-display-entry')
    entry.verify_source(entry_fd)
    entry.verify_source(source_fd)
    position = arguments.index('/usr/bin/bwrap')
    if '--seccomp' in arguments[:arguments.index('--', position)]:
        raise ValueError('Display filter must be constructed after identity drop')
    return ['/usr/bin/aa-exec', '-p', label, '--', *arguments[:position],
            '/usr/bin/python3', '-I', '/proc/self/fd/'+str(entry_fd), str(source_fd),
            *arguments[position+1:]]


def legacy_control_commands(binding):
    """Reconstruct only reviewed graceful commands from an existing binding.

    No caller-selected argv or executable is accepted. This is a read-only
    recovery path; the root-owned persistent binding is never rewritten.
    """
    profile = binding['profile']
    fixed = {
        'core-keeper-unix-v1': ['/usr/bin/python3','-I','/corekeeper-bootstrap.py'],
        'veloren-unix-v1': ['/usr/bin/python3','-I','/veloren-bootstrap.py'],
        'factorio-unix-v1': ['/usr/bin/python3','-I','/bootstrap.py'],
    }
    if profile in fixed:
        commands = [fixed[profile]]
        if profile == 'veloren-unix-v1': commands.append(['/game-data/veloren-server-cli'])
        if profile == 'factorio-unix-v1':
            port = binding.get('socketBindPort')
            if type(port) is not int or not 34197 <= port <= 34217:
                raise ValueError('Legacy Factorio port is missing')
            commands.append(trusted_module('pb_factorio','playbound-customer-factorio-bootstrap').server_args({'port':port}))
        return commands
    # Terraria runs the engine directly with typed, positional settings. Read
    # its original wrapper argv, never an arbitrary descendant's suggested argv.
    if profile != 'terraria-unix-v1':
        raise ValueError('Legacy graceful profile requires re-enrollment')
    wrapper = binding['gamePid']
    if game_identity(wrapper) != binding['gameIdentity']:
        raise ValueError('Sandbox wrapper identity changed')
    with (Path('/proc')/str(wrapper)/'cmdline').open('rb') as source:
        raw = source.read(16385)
    if len(raw) > 16384 or not raw.endswith(b'\0'):
        raise ValueError('Invalid legacy wrapper command')
    args = [part.decode('utf-8') for part in raw[:-1].split(b'\0')]
    if not args or args[0] != '/usr/bin/bwrap':
        raise ValueError('Legacy wrapper is not bubblewrap')
    command = args[args.index('--')+1:]
    if (len(command) != 12 or command[0] != '/game-data/TerrariaServer.bin.x86_64'
            or command[1:2] != ['-port'] or command[3:4] != ['-maxplayers']
            or command[5:10] != ['-world','/server/Worlds/world.wld','-autocreate','2','-worldname']
            or command[11] != '-noupnp'):
        raise ValueError('Unrecognized legacy Terraria command')
    port, slots, name = command[2], command[4], command[10]
    if (not re.fullmatch(r'[0-9]+',port) or not 7870 <= int(port) <= 7890
            or int(port) != binding.get('socketBindPort')
            or not re.fullmatch(r'[0-9]+',slots) or not 2 <= int(slots) <= 64
            or not 1 <= len(name) <= 64 or re.search(r'[\x00-\x1f\x7f]',name)):
        raise ValueError('Invalid legacy Terraria settings')
    if game_identity(wrapper) != binding['gameIdentity']:
        raise ValueError('Sandbox wrapper identity changed')
    return [command]


def stop_runtime(server_id, pid, identity):
    binding=binding_read(server_id, pid, identity)
    try:
        if game_identity(pid) != identity: raise ValueError('Gate PID was reused')
    except FileNotFoundError:
        pass  # The root binding still identifies an orphaned scope.
    scope = scope_path(server_id, pid)
    graceful_profiles = {
        'terraria-unix-v1': (signal.SIGINT, 8),
        'factorio-unix-v1': (signal.SIGINT, 8),
        'veloren-unix-v1': (signal.SIGTERM, 8),
        # Display supervisors allow 10s for the engine, 2s to reap a killed
        # engine, then up to 5s for Xvfb. Do not cut that cleanup short at 8s.
        # This does not enroll either game in the independent runtime allowlist.
        'core-keeper-unix-v1': (signal.SIGTERM, 20),
        're-volt-rvgl-unix-v1': (signal.SIGTERM, 20),
    }
    if isinstance(binding,dict) and binding.get('profile') in graceful_profiles and scope.exists():
        stop_signal, stop_timeout = graceful_profiles[binding['profile']]
        if 'controlPid' not in binding and 'controlIdentity' not in binding:
            commands = legacy_control_commands(binding)
            game_pid, control_identity = scoped_command_identity(
                binding['gamePid'], binding['gameIdentity'], binding['uid'],
                scope, commands[0], commands[1:])
        elif 'controlPid' not in binding or 'controlIdentity' not in binding:
            raise ValueError('Incomplete graceful control identity')
        else:
            game_pid, control_identity = binding['controlPid'], binding['controlIdentity']
        try:
            descriptor=os.pidfd_open(game_pid)
        except ProcessLookupError:descriptor=None
        if descriptor is not None:
            try:
                if game_identity(game_pid)!=control_identity or (Path('/proc')/str(game_pid)).stat().st_uid!=binding['uid'] or (Path('/proc')/str(game_pid)/'cgroup').read_text().strip()!='0::/system.slice/'+scope.name:raise ValueError('Graceful stop identity changed')
                signal.pidfd_send_signal(descriptor,stop_signal)
            except (FileNotFoundError,ProcessLookupError):pass
            finally:os.close(descriptor)
            deadline=time.monotonic()+stop_timeout
            while time.monotonic()<deadline:
                try:
                    if 'populated 0' in (scope/'cgroup.events').read_text().splitlines():return {'stopped':True,'graceful':True}
                except FileNotFoundError:return {'stopped':True,'graceful':True}
                time.sleep(.05)
    # A root-owned binding authorizes this exact scope even after the gate exits.
    # The agent cannot create or replace bindings, cgroups or their controls.
    if scope.exists():
        (scope / 'cgroup.kill').write_text('1')
    deadline = time.monotonic() + 2
    while scope.exists():
        try:
            if 'populated 0' in (scope / 'cgroup.events').read_text().splitlines(): break
        except FileNotFoundError:
            break
        if time.monotonic() >= deadline: raise ValueError('Runtime scope did not empty')
        time.sleep(0.02)
    return {'stopped': True}


def game_identity(pid):
    text = (Path('/proc') / str(pid) / 'stat').read_text()
    return Path('/proc/sys/kernel/random/boot_id').read_text().strip() + ':' + text[text.rfind(')') + 2:].split()[19]


def scoped_command_identity(wrapper_pid, wrapper_identity, uid, scope, expected_command, additional_commands=()):
    """Find only the root-built command below its exact live sandbox wrapper.

    expected_command is internal root-built argv, never a request field. Keep
    wrapper liveness separate from the command which must receive graceful stop.
    """
    commands = [expected_command,*additional_commands]
    if any(not command or not all(isinstance(value,str) for value in command) for command in commands):
        raise ValueError('Trusted supervisor command required')
    encoded_commands = [[part.encode() for part in command] for command in commands]
    expected_group = '0::/system.slice/'+scope.name
    deadline = time.monotonic()+10
    while time.monotonic() < deadline:
        if game_identity(wrapper_pid) != wrapper_identity:
            raise ValueError('Sandbox wrapper identity changed')
        pending = [wrapper_pid]
        seen = set()
        while pending:
            current = pending.pop(0)
            if current in seen:
                continue
            seen.add(current)
            if len(seen) > 128:
                raise ValueError('Sandbox process tree exceeds task policy')
            directory = Path('/proc')/str(current)
            try:
                identity = game_identity(current)
                if directory.stat().st_uid != uid or (directory/'cgroup').read_text().strip() != expected_group:
                    raise ValueError('Sandbox process identity or scope changed')
                with (directory/'cmdline').open('rb') as source:
                    raw = source.read(16385)
                if current != wrapper_pid and len(raw) <= 16384 and raw.rstrip(b'\0').split(b'\0') in encoded_commands:
                    if game_identity(current) != identity:
                        raise ValueError('Supervisor PID was reused')
                    return current, identity
                children = (directory/'task'/str(current)/'children').read_text().split()
                if len(children) > 128:
                    raise ValueError('Sandbox process tree exceeds task policy')
                pending.extend(int(value) for value in children)
            except (FileNotFoundError,ProcessLookupError):
                continue
        time.sleep(.05)
    raise ValueError('Sandbox supervisor did not appear')


def runtime_status(resources, server_id, pid, identity):
    value = binding_read(server_id, pid, identity)
    try:
        resources.verify_process(pid, identity, pwd.getpwnam('playbound').pw_uid)
        resources.verify_process(value['gamePid'], value['gameIdentity'], value['uid'])
        expected = '0::/system.slice/' + scope_path(server_id, pid).name
        if (Path('/proc') / str(value['gamePid']) / 'cgroup').read_text().strip() != expected: raise ValueError('Game scope changed')
        # Legacy bindings remain readable until explicit adoption. A binding
        # which declares a control identity must prove both halves are live;
        # the surviving sandbox wrapper alone is not a healthy controller.
        if 'controlPid' in value or 'controlIdentity' in value:
            control_pid = value['controlPid']
            control_identity = value['controlIdentity']
            if type(control_pid) is not int or control_pid <= 0 or not isinstance(control_identity, str) or not control_identity:
                raise ValueError('Invalid control identity')
            resources.verify_process(control_pid, control_identity, value['uid'])
            if (Path('/proc') / str(control_pid) / 'cgroup').read_text().strip() != expected:
                raise ValueError('Control scope changed')
        network_profile = migration_network_profile(server_id, value['uid'])
        if value.get('networkProfile') != network_profile:
            raise ValueError('Runtime network profile changed')
        if network_profile:
            network = trusted_module('pb_network', 'playbound-customer-network-check')
            network.attached_filters(scope_path(server_id, pid))
        if value.get('hostNetworkGuard') != 'host-egress-v1': raise ValueError('Native host guard is missing')
        guard = trusted_module('pb_host_guard', 'playbound-customer-host-network')
        guard.verify(value['uid'])
        binder = trusted_module('pb_bind', 'playbound-customer-bind-policy')
        if binder.program_ids(scope_path(server_id,pid)) != value.get('bindPrograms'): raise ValueError('Native bind program identities changed')
        value['running'] = True
    except Exception:
        value['running'] = False
    return value


def migration_ready(server_id, uid, allow_pending=False):
    """Incomplete or rolled-back data transactions must never launch a game."""
    root = ROOT / server_id
    for directory, mode in [(ROOT, 0o711), (root, 0o711), (root / 'control', 0o700)]:
        try:
            info = directory.lstat()
        except FileNotFoundError:
            return False
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != mode:
            raise ValueError('Unsafe migration parent')
    file = root / 'control' / 'migration.json'
    try:
        fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return False
    with os.fdopen(fd) as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError('Unsafe migration journal')
        value = json.load(handle)
    if not allow_pending and value.get('profileTransition', {}).get('state') == 'pending':
        raise ValueError('Runtime enrollment transition is incomplete')
    data = (root / 'data').lstat()
    if value.get('gameSlug', 'teeworlds') != GAME or value.get('version') != 1 or value.get('serverId') != server_id or value.get('phase') != 'active' or value.get('uid') != uid or not stat.S_ISDIR(data.st_mode) or data.st_uid != uid or value.get('activationInode') != [data.st_dev, data.st_ino]:
        raise ValueError('Customer migration is not ready')
    source = LEGACY_ROOT / (server_id[-16:] if GAME=='wolfenstein-enemy-territory' else 'pb-'+server_id[-8:] if GAME=='medal-of-honor-allied-assault' else 'pb-'+server_id)
    seal = source.lstat()
    if not stat.S_ISDIR(seal.st_mode) or seal.st_uid != 0 or stat.S_IMODE(seal.st_mode) != 0o700 or value.get('sealedSourceInode') != [seal.st_dev, seal.st_ino]:
        raise ValueError('Legacy migration seal changed')
    return True


def migration_network_profile(server_id, uid):
    if not migration_ready(server_id, uid):
        return None
    fd = os.open(ROOT / server_id / 'control' / 'migration.json', os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as handle:
        value = json.load(handle)
    profile = value.get('networkProfile')
    if profile not in (None, 'public-game-v1'):
        raise ValueError('Unsupported customer network profile')
    return profile


def run_runtime(identities, resources, server_id, pid, identity, extra, text):
    port, cpu, memory = extra
    config = config_bytes(text, port)
    resources.verify_caller(pid, pwd.getpwnam('playbound').pw_uid)
    scope = verify_scope(resources, server_id, pid, identity, cpu, memory)
    if GAME == 're-volt-rvgl':
        fresh = trusted_module('pb_fresh_rvgl', 'playbound-customer-fresh-rvgl')
        if fresh.fresh_candidate(server_id):
            fresh.initialize(server_id, sys.modules[__name__], identities)
    if journal_game(server_id) != GAME: raise ValueError('Runtime game differs from activated data')
    account = identities.ensure_identity(server_id)
    if not migration_ready(server_id, account['uid']): raise ValueError('Customer data migration is required')
    root = workspace(server_id, account['uid'])
    lock = os.open(root / 'control' / 'runtime.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        identities.secure_stat(os.fstat(lock))
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if not migration_ready(server_id, account['uid']): raise ValueError('Customer data migration is required')
        fd = os.memfd_create('pb-server-config', os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
        child = None
        engine_fd = None
        assets = []
        asset_directory = None
        python_directory = None
        dependency_directory = None
        identity_fd = None
        seccomp_fd = None
        dns_fd = None
        host_guard = None
        guard_installed = False
        identity_files = []
        display_entry_fd = None
        display_source_fd = None
        try:
            if GAME == 'core-keeper':
                corekeeper = trusted_module('pb_corekeeper', 'playbound-customer-corekeeper')
                trusted_module('pb_display', 'playbound-customer-display')
                identity_files = corekeeper.identity_mounts(root/'data', account['uid'])
            if GAME == 're-volt-rvgl':
                rvgl = trusted_module('pb_rvgl','playbound-customer-rvgl')
                trusted_module('pb_display','playbound-customer-display')
                for name in ('runtime', *('runtime/'+name for name in rvgl.PRIVATE_DIRECTORIES)):
                    directory(root/'data'/name,uid=account['uid'],mode=0o700)
            if GAME=='dont-starve-together':trusted_module('pb_dst','playbound-customer-dst')
            if GAME in ('team-fortress-2','counter-strike-2','counter-strike-source','open-fortress'):
                trusted_module('pb_source','playbound-customer-source')
                for name in ('private-cfg','private-logs','.steam','.steam/sdk64'):
                    directory(root/'data'/name,uid=account['uid'],mode=0o700)
            if GAME=='trackmania':
                trusted_module('pb_trackmania','playbound-customer-trackmania')
                directory(root/'data'/'runtime',uid=account['uid'],mode=0o700)
            if GAME=='unturned':
                trusted_module('pb_unturned','playbound-customer-unturned')
                for name in ('.steam','.steam/sdk64'):
                    directory(root/'data'/name,uid=account['uid'],mode=0o700)
            if GAME=='open-fortress':
                trusted_module('pb_openfortress','playbound-customer-openfortress')
                for name in ('runtime','runtime/bin','runtime/open_fortress','runtime/open_fortress/bin','runtime/open_fortress/maps','runtime/open_fortress/maps/graphs','.steam/sdk32'):
                    directory(root/'data'/name,uid=account['uid'],mode=0o700)
            if GAME=='battlefield-1942-anthology':trusted_module('pb_battlefield','playbound-customer-battlefield')
            if GAME=='bombsquad':trusted_module('pb_bombsquad','playbound-customer-bombsquad')
            if GAME=='morrowind':
                trusted_module('pb_morrowind','playbound-customer-morrowind')
                hook=Path('/usr/local/libexec/playbound-customer-morrowind-admin.lua').lstat()
                if not stat.S_ISREG(hook.st_mode) or hook.st_uid!=0 or hook.st_nlink!=1 or hook.st_mode&0o022 or not 1<=hook.st_size<=262144:raise ValueError('Untrusted TES3MP admin hook')
            if GAME=='barotrauma':
                trusted_module('pb_barotrauma','playbound-customer-barotrauma')
                for name in ('runtime','runtime/Data','runtime/Data/Multiplayer','runtime/Data/Saves','runtime/ServerLogs','.steam','.steam/sdk64'):
                    directory(root/'data'/name,uid=account['uid'],mode=0o700)
            if GAME=='veloren':trusted_module('pb_veloren','playbound-customer-veloren')
            if GAME=='triplea':directory(root/'data'/'downloadedMaps',uid=account['uid'],mode=0o700)
            if GAME=='space-station-14':trusted_module('pb_ss14','playbound-customer-ss14')
            if GAME=='rimworld-together':
                trusted_module('pb_rimworld','playbound-customer-rimworld')
                trusted_module('pb_rimworld_bootstrap','playbound-customer-rimworld-bootstrap')
            if GAME=='factorio':
                trusted_module('pb_factorio','playbound-customer-factorio-bootstrap')
                directory(root/'data'/'saves',uid=account['uid'],mode=0o700)
            if GAME=='terraria':directory(root/'data'/'Worlds',uid=account['uid'],mode=0o700)
            if GAME == 'hypersomnia':
                for name in ('user','user/conf.d'):directory(root/'data'/name,uid=account['uid'],mode=0o700)
            if GAME == 'warzone-2100':
                directory(root/'data'/'autohost',uid=account['uid'],mode=0o700)
            if GAME == 'freeciv':
                directory(root/'data'/'saves',uid=account['uid'],mode=0o700)
            if GAME == 'freedoom':
                identity_fd=identity_database(account['uid'],account['gid'])
                for name in ('.config','.config/zandronum','saves'):
                    directory(root/'data'/name,uid=account['uid'],mode=0o700)
            if GAME == 'assaultcube':
                for name in ('logs','demos'):
                    directory(root/'data'/name,uid=account['uid'],mode=0o700)
            os.write(fd, config)
            os.lseek(fd, 0, os.SEEK_SET)
            fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
            verify_scope(resources, server_id, pid, identity, cpu, memory)
            verify_supervisor_scope(scope)
            network_profile = migration_network_profile(server_id, account['uid'])
            if network_profile:
                network = trusted_module('pb_network', 'playbound-customer-network-check')
                network.apply_current_scope()
            migration = trusted_module('pb_migration', 'playbound-customer-data-migration')
            migration.quiescent(account['uid'])
            host_guard = trusted_module('pb_host_guard', 'playbound-customer-host-network')
            host_guard.install(account['uid'])
            guard_installed = True
            binder = trusted_module('pb_bind', 'playbound-customer-bind-policy')
            bind_programs = binder.apply_current(port,stk_discovery=True) if GAME == 'supertuxkart' else binder.apply_current(port,flightgear_status=True) if GAME == 'flightgear' else binder.apply_current(port,assaultcube_query=True) if GAME == 'assaultcube' else binder.apply_current(port,auxiliary_profile=GAME) if GAME in ('veloren','barotrauma','dont-starve-together','team-fortress-2','trackmania','unturned','counter-strike-source','open-fortress','core-keeper') else binder.apply_current(port)
            dns_fd = os.memfd_create('pb-public-dns',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
            os.write(dns_fd,b'nameserver 1.1.1.1\nnameserver 1.0.0.1\noptions timeout:2 attempts:2\n')
            os.lseek(dns_fd,0,os.SEEK_SET)
            fcntl.fcntl(dns_fd,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
            for binary in ['/usr/bin/prlimit', '/usr/bin/bwrap', {'teeworlds':'/usr/games/teeworlds-server','bzflag':'/usr/games/bzfs','hedgewars':'/usr/lib/hedgewars/bin/hedgewars-server','openttd':'/usr/games/openttd','luanti':'/usr/games/minetestserver','openarena':'/usr/lib/ioquake3/ioq3ded','battle-for-wesnoth':'/usr/games/wesnothd-1.18','supertuxkart':'/usr/games/supertuxkart','0-ad':'/usr/games/pyrogenesis','ysoccer':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','flightgear':'/usr/local/libexec/playbound-isolated-flightgear/fgms','mindustry':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','hurry-curry':'/usr/local/libexec/playbound-isolated-hurry/hurrycurry-server','assaultcube':'/usr/local/libexec/playbound-isolated-assaultcube/linux_64_server','xonotic':'/usr/local/libexec/playbound-isolated-xonotic/xonotic-linux64-dedicated','wolfenstein-enemy-territory':'/usr/local/libexec/playbound-isolated-etlegacy/etlded.x86_64','medal-of-honor-allied-assault':'/usr/local/libexec/playbound-isolated-openmohaa/omohaaded','freedoom':'/usr/local/libexec/playbound-isolated-freedoom/zandronum-server','freeciv':'/usr/local/libexec/playbound-isolated-freeciv/freeciv-server','warzone-2100':'/usr/local/libexec/playbound-isolated-warzone/warzone2100','hypersomnia':'/usr/local/libexec/playbound-isolated-hypersomnia/Hypersomnia-Headless.AppImage','terraria':'/usr/local/libexec/playbound-isolated-terraria-data-1458/TerrariaServer.bin.x86_64','factorio':'/usr/bin/python3','unvanquished':'/usr/local/libexec/playbound-isolated-unvanquished-data-0562/daemonded','openra':'/usr/bin/bwrap','openhv':'/usr/bin/bwrap','earth-2140-trilogy':'/usr/bin/bwrap','rimworld-together':'/usr/bin/python3','space-station-14':'/usr/bin/python3','triplea':'/usr/bin/bwrap','necesse':'/usr/bin/bwrap','veloren':'/usr/bin/python3','barotrauma':'/usr/bin/python3','morrowind':'/usr/bin/python3','bombsquad':'/usr/bin/python3','counter-strike-source':'/usr/bin/python3','open-fortress':'/usr/bin/python3','battlefield-1942-anthology':'/usr/bin/python3','unturned':'/usr/bin/python3','trackmania':'/usr/bin/python3','team-fortress-2':'/usr/bin/python3','counter-strike-2':'/usr/bin/python3','dont-starve-together':'/usr/bin/python3','core-keeper':'/usr/bin/python3','re-volt-rvgl':'/usr/bin/python3'}[GAME]]:
                info = Path(binary).stat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('Untrusted runtime executable')
            engines = trusted_module('pb_native_engine', 'playbound-customer-native-engine')
            engine_fd, _target = engines.sealed_engine_for(GAME)
            if GAME in ('openra','openhv','earth-2140-trilogy'):
                asset_directory=trusted_module('pb_assets','playbound-customer-xonotic-assets').open_assets(game=json.loads(text)['family'])
            if GAME in ('xonotic','wolfenstein-enemy-territory','medal-of-honor-allied-assault','freeciv','warzone-2100','terraria','factorio','unvanquished','rimworld-together','space-station-14','triplea','necesse','veloren','barotrauma','dont-starve-together','morrowind','team-fortress-2','counter-strike-2','trackmania','unturned','bombsquad','counter-strike-source','open-fortress','battlefield-1942-anthology','core-keeper','re-volt-rvgl'): asset_directory = trusted_module('pb_assets','playbound-customer-xonotic-assets').open_assets(game=GAME)
            if GAME=='open-fortress':dependency_directory=trusted_module('pb_assets','playbound-customer-xonotic-assets').open_assets(game='team-fortress-2')
            if GAME=='bombsquad':python_directory=trusted_module('pb_assets','playbound-customer-xonotic-assets').open_assets(game='bombsquad-python')
            if GAME in ('hurry-curry','assaultcube','freedoom'): assets = trusted_module('pb_assets','playbound-customer-game-assets').seal_assets(game=GAME)
            syscalls = trusted_module('pb_syscalls', 'playbound-customer-seccomp')
            if GAME in ('core-keeper','re-volt-rvgl'):
                display_entry_fd = os.open('/usr/local/libexec/playbound-customer-display-entry', os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
                display_source_fd = os.open('/usr/local/libexec/playbound-customer-seccomp', os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
            else:
                seccomp_fd = syscalls.sealed_filter(legacy_x86=True) if GAME in ('counter-strike-source','open-fortress','battlefield-1942-anthology') else syscalls.sealed_filter(seqpacket_pairs=GAME=='unvanquished')
            inherited = tuple(descriptor for descriptor in (fd,engine_fd,seccomp_fd,dns_fd,display_entry_fd,display_source_fd) if descriptor is not None)
            inherited += tuple(descriptor for descriptor, _ in identity_files)
            inherited += tuple(descriptor for descriptor,_ in assets)
            if asset_directory is not None: inherited += (asset_directory,)
            if identity_fd is not None: inherited += (identity_fd,)
            if python_directory is not None: inherited += (python_directory,)
            if dependency_directory is not None: inherited += (dependency_directory,)
            arguments = command(root / 'data', fd, port, memory, engine_fd, json.loads(text) if GAME != 'teeworlds' else None, seccomp_fd, dns_fd, assets, asset_directory, identity_fd, python_directory, dependency_directory, identity_files)
            delimiter = arguments.index('--',arguments.index('/usr/bin/bwrap'))
            expected_command = arguments[delimiter+1:]
            if GAME in ('core-keeper','re-volt-rvgl'):
                arguments = private_display_handoff(arguments, account['uid'], display_entry_fd, display_source_fd)
            child = subprocess.Popen(arguments, user=account['uid'], group=account['gid'], extra_groups=[], env=ENV, cwd='/', stdin=subprocess.PIPE if GAME in ('terraria','rimworld-together') else subprocess.DEVNULL, pass_fds=inherited)
            wrapper_identity = game_identity(child.pid)
            control = {}
            if GAME in ('core-keeper','re-volt-rvgl','veloren','factorio','terraria'):
                # These bootstraps exec the engine in place. Either exact argv
                # may be observed; the host PID/start identity is unchanged.
                alternatives = []
                if GAME == 'veloren': alternatives = [['/game-data/veloren-server-cli']]
                if GAME == 'factorio':
                    alternatives = [trusted_module('pb_factorio','playbound-customer-factorio-bootstrap').server_args(json.loads(text))]
                control_pid, control_identity = scoped_command_identity(child.pid,wrapper_identity,account['uid'],scope,expected_command,alternatives)
                control = {'controlPid':control_pid,'controlIdentity':control_identity}
            binding_write(root, {'profile': PROFILE, 'serverId': server_id, 'gatePid': pid, 'gateIdentity': identity, 'uid': account['uid'], 'gid': account['gid'], 'gamePid': child.pid, 'gameIdentity': wrapper_identity, **control, 'networkProfile': network_profile, 'hostNetworkGuard': 'host-egress-v1', 'socketBindPort': port, 'bindPrograms': bind_programs})
            while child.poll() is None:
                try:
                    resources.verify_process(pid, identity, pwd.getpwnam('playbound').pw_uid)
                except Exception:
                    # Kill the complete fenced tree if its unprivileged owner
                    # disappeared, including this supervisor. Never orphan a game.
                    (scope / 'cgroup.kill').write_text('1')
                    raise ValueError('Runtime gate disappeared')
                time.sleep(0.1)
            return child.returncode if child.returncode >= 0 else 1
        finally:
            for descriptor, _ in identity_files: os.close(descriptor)
            if display_entry_fd is not None: os.close(display_entry_fd)
            if display_source_fd is not None: os.close(display_source_fd)
            os.close(fd)
            if engine_fd is not None: os.close(engine_fd)
            for descriptor,_ in assets: os.close(descriptor)
            if asset_directory is not None: os.close(asset_directory)
            if identity_fd is not None: os.close(identity_fd)
            if python_directory is not None: os.close(python_directory)
            if dependency_directory is not None: os.close(dependency_directory)
            if seccomp_fd is not None: os.close(seccomp_fd)
            if dns_fd is not None: os.close(dns_fd)
            if child is not None and child.poll() is None:
                (scope / 'cgroup.kill').write_text('1')
            if guard_installed: host_guard.remove(account['uid'])
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        identities = trusted_module('pb_identities', 'playbound-customer-identities')
        identities.verify_caller()
        action, server_id, pid, identity, extra = request(sys.argv[1:])
        if action != 'run': select_game(journal_game(server_id))
        if action == 'run':
            text = sys.stdin.buffer.read(16385)
            if len(text) > 16384: raise ValueError('Configuration exceeds limit')
            resources = trusted_module('pb_resources', 'playbound-customer-resources')
            sys.exit(run_runtime(identities, resources, server_id, pid, identity, extra, text.decode('utf-8')))
        elif action == 'migration':
            account = identities.ensure_identity(server_id)
            print(json.dumps({'serverId': server_id, 'migrationReady': migration_ready(server_id, account['uid']), 'networkProfile': migration_network_profile(server_id, account['uid']), 'identityProfile': PROFILE}))
        elif action == 'stop':
            print(json.dumps(stop_runtime(server_id, pid, identity)))
        else:
            resources = trusted_module('pb_resources', 'playbound-customer-resources')
            print(json.dumps(runtime_status(resources, server_id, pid, identity)))
    except Exception as error:
        reason = str(error)[:240] if isinstance(error, ValueError) else type(error).__name__
        if isinstance(error, subprocess.CalledProcessError) and error.cmd and error.cmd[0] in ('/usr/bin/systemctl','/usr/sbin/nft'):
            reason = (error.stderr or '').strip()[:240] or reason
        print('Customer identity runtime operation failed: ' + reason, file=sys.stderr)
        sys.exit(1)
