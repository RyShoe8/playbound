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
        if GAME == 'assaultcube' and port % 2 != 1: raise ValueError('Invalid AssaultCube port pair')
        if GAME == 'flightgear' and port % 2: raise ValueError('Invalid FlightGear port stride')
        if GAME == 'supertuxkart' and (port % 2 != 1 or port > 2777): raise ValueError('Invalid SuperTuxKart port pair')
        extra = port, cpu, memory
    return action, server_id, int(raw_pid), identity, extra


def config_bytes(text, port):
    if GAME != 'teeworlds':
        if not isinstance(text,str) or len(text.encode()) > 16384: raise ValueError('Invalid native configuration')
        values = json.loads(text)
        if GAME in ('ysoccer','flightgear'):
            if values != {}: raise ValueError('Undeclared YSoccer setting')
            return text.encode()
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


def command(data, fd, port, memory, engine_fd=None, native_settings=None, seccomp_fd=None, dns_fd=None, assets=(), asset_directory=None):
    target = {'teeworlds':'/usr/games/teeworlds-server','bzflag':'/usr/games/bzfs','hedgewars':'/usr/lib/hedgewars/bin/hedgewars-server','openttd':'/usr/games/openttd','luanti':'/usr/games/minetestserver','openarena':'/usr/lib/ioquake3/ioq3ded','battle-for-wesnoth':'/usr/games/wesnothd-1.18','supertuxkart':'/usr/games/supertuxkart','0-ad':'/usr/games/pyrogenesis','ysoccer':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','flightgear':'/engine-native','mindustry':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','hurry-curry':'/engine-native','assaultcube':'/engine-native','xonotic':'/engine-native'}[GAME]
    settings = native_settings or {}
    game_args = ['-f','server.cfg','sv_port '+str(port)] if GAME == 'teeworlds' else ['-p',str(port)] if GAME == 'hedgewars' else [] if GAME in ('openttd','luanti','openarena','battle-for-wesnoth','supertuxkart','0-ad','ysoccer','flightgear','mindustry','hurry-curry','assaultcube','xonotic') else ['-p',str(port),'-offa','-q','-j','+r','+s',str(settings['scoreLimit']),'-mp',str(settings['maxPlayers'])]
    if GAME == 'openarena': game_args = ['+set','com_basegame','baseoa','+set','fs_basepath','/usr/lib/openarena-server','+set','fs_homepath','/server','+set','com_legacyprotocol','71','+set','com_protocol','71','+set','dedicated','1','+set','net_port',str(port),'+exec','playbound.cfg','+map','oa_dm1']
    if GAME == 'flightgear': game_args = ['-p',str(port),'-a',str(port+1),'-b','0','-d']
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
    return ['/usr/bin/prlimit', '--as=' + str(max(1024 ** 3, memory * 2 * 1024 ** 2)), '--nofile=1024', '--core=0', '--', '/usr/bin/bwrap',
            *(['--seccomp', str(seccomp_fd)] if seccomp_fd is not None else []),
            '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-cgroup', '--disable-userns', '--cap-drop', 'ALL', '--die-with-parent',
            '--ro-bind', '/usr', '/usr', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--symlink', 'usr/bin', '/bin',
            *(['--perms', '0555', '--ro-bind-data', str(engine_fd), '/engine.jar' if GAME in ('ysoccer','mindustry') else target] if engine_fd is not None else []),
            *(['--ro-bind','/proc/self/fd/'+str(asset_directory),'/game-data/data'] if asset_directory is not None else []),
            *[part for descriptor,target in assets for part in ['--perms','0444','--ro-bind-data',str(descriptor),target]],
            '--proc', '/proc', '--dev', '/dev', '--size', '67108864', '--tmpfs', '/tmp', '--bind', str(data), '/server', '--ro-bind-data', str(fd), '/server/baseoa/playbound.cfg' if GAME == 'openarena' else '/server/data/server.cfg' if GAME == 'xonotic' else '/server/server.cfg',
            *[part for filename in ['/etc/protocols','/etc/services','/etc/hosts','/etc/resolv.conf','/etc/ssl/certs'] if Path(filename).exists() for part in ['--ro-bind',filename,filename]],
            *(['--ro-bind','/etc/java-21-openjdk','/etc/java-21-openjdk'] if GAME == 'mindustry' else []),
            *(['--ro-bind-data', str(dns_fd), '/etc/resolv.conf'] if dns_fd is not None else []),
            '--clearenv', '--setenv', 'PATH', '/usr/bin:/usr/games', '--setenv', 'HOME', '/server', '--setenv', 'XDG_DATA_HOME', '/server', '--setenv', 'XDG_CONFIG_HOME', '/server', '--setenv', 'LANG', 'C.UTF-8', '--chdir', '/game-data' if GAME == 'assaultcube' else '/server',
            *(['--setenv', 'PLAYBOUND_STK_DISCOVERY_PORT', str(port+1)] if GAME == 'supertuxkart' else []),
            '--', target, *game_args]


def verify_supervisor_scope(scope):
    if Path('/proc/self/cgroup').read_text().strip() != '0::/system.slice/' + scope.name:
        raise ValueError('Supervisor did not inherit the fenced scope')


def stop_runtime(server_id, pid, identity):
    binding_read(server_id, pid, identity)
    try:
        if game_identity(pid) != identity: raise ValueError('Gate PID was reused')
    except FileNotFoundError:
        pass  # The root binding still identifies an orphaned scope.
    scope = scope_path(server_id, pid)
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


def runtime_status(resources, server_id, pid, identity):
    value = binding_read(server_id, pid, identity)
    try:
        resources.verify_process(pid, identity, pwd.getpwnam('playbound').pw_uid)
        resources.verify_process(value['gamePid'], value['gameIdentity'], value['uid'])
        expected = '0::/system.slice/' + scope_path(server_id, pid).name
        if (Path('/proc') / str(value['gamePid']) / 'cgroup').read_text().strip() != expected: raise ValueError('Game scope changed')
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
    source = LEGACY_ROOT / ('pb-' + server_id)
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
    if journal_game(server_id) != GAME: raise ValueError('Runtime game differs from activated data')
    config = config_bytes(text, port)
    resources.verify_caller(pid, pwd.getpwnam('playbound').pw_uid)
    scope = verify_scope(resources, server_id, pid, identity, cpu, memory)
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
        seccomp_fd = None
        dns_fd = None
        host_guard = None
        guard_installed = False
        try:
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
            bind_programs = binder.apply_current(port,stk_discovery=True) if GAME == 'supertuxkart' else binder.apply_current(port,flightgear_status=True) if GAME == 'flightgear' else binder.apply_current(port,assaultcube_query=True) if GAME == 'assaultcube' else binder.apply_current(port)
            dns_fd = os.memfd_create('pb-public-dns',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
            os.write(dns_fd,b'nameserver 1.1.1.1\nnameserver 1.0.0.1\noptions timeout:2 attempts:2\n')
            os.lseek(dns_fd,0,os.SEEK_SET)
            fcntl.fcntl(dns_fd,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
            for binary in ['/usr/bin/prlimit', '/usr/bin/bwrap', {'teeworlds':'/usr/games/teeworlds-server','bzflag':'/usr/games/bzfs','hedgewars':'/usr/lib/hedgewars/bin/hedgewars-server','openttd':'/usr/games/openttd','luanti':'/usr/games/minetestserver','openarena':'/usr/lib/ioquake3/ioq3ded','battle-for-wesnoth':'/usr/games/wesnothd-1.18','supertuxkart':'/usr/games/supertuxkart','0-ad':'/usr/games/pyrogenesis','ysoccer':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','flightgear':'/usr/local/libexec/playbound-isolated-flightgear/fgms','mindustry':'/usr/lib/jvm/java-21-openjdk-amd64/bin/java','hurry-curry':'/usr/local/libexec/playbound-isolated-hurry/hurrycurry-server','assaultcube':'/usr/local/libexec/playbound-isolated-assaultcube/linux_64_server','xonotic':'/usr/local/libexec/playbound-isolated-xonotic/xonotic-linux64-dedicated'}[GAME]]:
                info = Path(binary).stat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022: raise ValueError('Untrusted runtime executable')
            engines = trusted_module('pb_native_engine', 'playbound-customer-native-engine')
            engine_fd, _target = engines.sealed_engine_for(GAME)
            if GAME == 'xonotic': asset_directory = trusted_module('pb_assets','playbound-customer-xonotic-assets').open_assets()
            if GAME in ('hurry-curry','assaultcube'): assets = trusted_module('pb_assets','playbound-customer-game-assets').seal_assets(game=GAME)
            syscalls = trusted_module('pb_syscalls', 'playbound-customer-seccomp')
            seccomp_fd = syscalls.sealed_filter()
            inherited = (fd,seccomp_fd,dns_fd) if engine_fd is None else (fd,engine_fd,seccomp_fd,dns_fd)
            inherited += tuple(descriptor for descriptor,_ in assets)
            if asset_directory is not None: inherited += (asset_directory,)
            child = subprocess.Popen(command(root / 'data', fd, port, memory, engine_fd, json.loads(text) if GAME != 'teeworlds' else None, seccomp_fd, dns_fd, assets, asset_directory), user=account['uid'], group=account['gid'], extra_groups=[], env=ENV, cwd='/', stdin=subprocess.DEVNULL, pass_fds=inherited)
            binding_write(root, {'profile': PROFILE, 'serverId': server_id, 'gatePid': pid, 'gateIdentity': identity, 'uid': account['uid'], 'gid': account['gid'], 'gamePid': child.pid, 'gameIdentity': game_identity(child.pid), 'networkProfile': network_profile, 'hostNetworkGuard': 'host-egress-v1', 'socketBindPort': port, 'bindPrograms': bind_programs})
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
            os.close(fd)
            if engine_fd is not None: os.close(engine_fd)
            for descriptor,_ in assets: os.close(descriptor)
            if asset_directory is not None: os.close(asset_directory)
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
