#!/usr/bin/python3 -I
"""Direct-root staging probe. Loads/removes only two unused reserved IPC labels.

--corekeeper-root-command exercises the runtime's namespace builder with fixture
helper mounts. It does not enroll an account or test persistent agent adoption.
"""
import importlib.machinery
import importlib.util
import fcntl
import json
import os
from pathlib import Path
import pwd
import select
import socket
import stat
import subprocess
import sys
import shutil
import tempfile

UIDS = (40254, 40255)


def cleanup_all(actions):
    """Attempt every independent teardown, even when an earlier one fails."""
    failures = []
    for name, action in actions:
        try:
            action()
        except Exception:
            # Do not include subprocess output: game logs may contain secrets.
            failures.append(name)
    if failures:
        raise RuntimeError('Staging cleanup requires attention: '+', '.join(failures))


def confined_prefix(uid, label):
    """Exercise the production ordering: drop identity before entering policy."""
    if type(uid) is not int or uid not in UIDS or label != 'playbound-customer-ipc-'+str(uid):
        raise ValueError('Fixed staging identity required')
    return ['/usr/bin/setpriv', '--reuid='+str(uid), '--regid='+str(uid), '--clear-groups',
            '/usr/bin/aa-exec', '-p', label, '--']


def verify_controller_scope(arguments, unit, scope):
    if ([part for part in arguments if part.startswith('--unit=')] != ['--unit='+unit]
            or scope.name != unit+'.scope'):
        raise ValueError('Staging launch and controller scopes differ')


def validate_engine_result(text, corekeeper=False, online=False, rvgl=False, root_command=False):
    if not corekeeper and not rvgl:
        return
    rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    expected = 'corekeeper-isolated-start-stop' if corekeeper else 'rvgl-isolated-start-stop'
    if len(rows) != 1 or not isinstance(rows[0], dict) or rows[0].get('case') != expected:
        raise ValueError('Missing or ambiguous engine acceptance result')
    row = rows[0]
    if root_command and row.get('rootCommandGenerated') is not True:
        raise ValueError('Root-generated namespace command was not exercised')
    if row.get('engineSpawned') is not True or type(row.get('engineExitCode')) is not int or row['engineExitCode'] != 0:
        raise ValueError('Engine did not start and stop cleanly')
    if row.get('exitStatus') != 143:
        raise ValueError('Engine exited before the supervised stop')
    if (rvgl or online) and row.get('udpBound') is not True:
        raise ValueError('Engine gameplay listener was not observed')
    if corekeeper and online:
        if row.get('querySucceeded') is not True:
            raise ValueError('Core Keeper game query failed')
        for key, expected_value in [('players', 0), ('maxPlayers', 4), ('bots', 0)]:
            if type(row.get(key)) is not int or row[key] != expected_value:
                raise ValueError('Unexpected Core Keeper staging occupancy or limit')
        if any(row.get(key) is not True for key in ('privateGameIdWritten', 'privateGameInfoWritten')):
            raise ValueError('Core Keeper private identity output missing')

CHILD = r'''
import socket,sys
role,address=sys.argv[1:]
dgram=role.endswith('-dgram')
if dgram and not role.startswith('listen'):s,partner=socket.socketpair(socket.AF_UNIX,socket.SOCK_DGRAM)
else:s=socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM if dgram else socket.SOCK_STREAM)
s.settimeout(2)
if role.startswith('listen'):
 s.bind('\0'+address)
 if not dgram:s.listen(1)
 print('READY',flush=True)
 try:
  if dgram:s.recv(1)
  else:
   c,_=s.accept();c.close()
  print('ACCEPTED',flush=True)
 except TimeoutError:print('TIMEOUT',flush=True)
else:
 try:
  s.connect('\0'+address)
  if dgram:s.send(b'x')
  print('CONNECTED',flush=True)
 except PermissionError:print('DENIED',flush=True)
'''


COREKEEPER_FIXTURE = r'''
import importlib.util,os,signal,threading,time,json,re,socket
REQUIRE_ONLINE_QUERY = False
EXTERNAL_STOP = False
os.umask(0o077)
from pathlib import Path
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
h=load('display','/display-helper.py');h.verify_current()
g=load('corekeeper','/server/corekeeper-bootstrap.py')
value={'name':'PlayBound isolated staging','maxPlayers':4}
g.prepare(Path('/server'),value,1320)
observed={'engineSpawned':False,'udpBound':False,'querySucceeded':False}
original=g.subprocess.Popen
children=[]
output=open('/server/data/process.log','ab',buffering=0)
def spawn(command,*args,**kwargs):
 if command[0]=='/game-data/CoreKeeperServer':kwargs.update(stdout=output,stderr=output)
 child=original(command,*args,**kwargs)
 if command[0]=='/game-data/CoreKeeperServer':
  observed['engineSpawned']=True;children.append(child)
 return child
g.subprocess.Popen=spawn
stop=threading.Event()
def query():
 request=b'\xff\xff\xff\xffTSource Engine Query\x00'
 try:
  with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as connection:
   connection.settimeout(0.2);connection.connect(('127.0.0.1',1321));connection.send(request);packet=connection.recv(65536)
   if len(packet)==9 and packet[:5]==b'\xff\xff\xff\xffA':connection.send(request+packet[5:]);packet=connection.recv(65536)
  if packet[:5]!=b'\xff\xff\xff\xffI':return
  offset=6
  for _ in range(4):offset=packet.index(0,offset)+1
  if len(packet)<offset+5:return
  observed.update(querySucceeded=True,players=packet[offset+2],maxPlayers=packet[offset+3],bots=packet[offset+4])
 except (OSError,ValueError):pass
def monitor():
 deadline=time.monotonic()+90
 while not stop.wait(0.5) and time.monotonic()<deadline:
  for file in ('/proc/net/udp','/proc/net/udp6'):
   if any(row.split()[1].endswith(':0528') for row in Path(file).read_text().splitlines()[1:]):observed['udpBound']=True
  if observed['udpBound']:query()
 if not stop.is_set() and not EXTERNAL_STOP:os.kill(os.getpid(),signal.SIGTERM)
thread=threading.Thread(target=monitor,daemon=True);thread.start()
try:status=g.supervise(value,1320,h)
finally:stop.set();thread.join(timeout=2)
assert not h.DISPLAY_ROOT.joinpath('Xauthority').exists()
log=Path('/server/data/server.log')
text=log.read_text(errors='replace')[-65536:] if log.exists() else ''
output.close()
text+='\n'+Path('/server/data/process.log').read_text(errors='replace')[-8192:]
errors=[re.sub(r'[A-Za-z0-9+/=_-]{32,}','[redacted]',line)[:300] for line in text.splitlines() if re.search(r'error|fail|fatal|denied|exception|abort|cannot|could not|malloc',line,re.I)]
print(json.dumps({'case':'corekeeper-isolated-start-stop','exitStatus':status,**observed,
 'steamFailure':'steam' in text.lower() and ('fail' in text.lower() or 'error' in text.lower()),
 'missingLibrary':'cannot open shared object' in text.lower(),'engineExitCode':children[0].returncode if children else None,'errors':errors[-5:],'privateGameIdWritten':Path('/server/GameID.txt').stat().st_size>0,'privateGameInfoWritten':Path('/server/GameInfo.txt').stat().st_size>0}))
assert observed['engineSpawned']
assert children[0].returncode == 0, 'Core Keeper did not stop cleanly'
if REQUIRE_ONLINE_QUERY:
 assert observed['udpBound'] and observed['querySucceeded'], 'Core Keeper never answered its game query'
 assert (observed['players'],observed['maxPlayers'],observed['bots']) == (0,4,0), 'Unexpected staging occupancy or slot limit'
 assert Path('/server/GameID.txt').stat().st_size > 0, 'Private GameID missing'
 assert Path('/server/GameInfo.txt').stat().st_size > 0, 'Private GameInfo missing'
'''


RVGL_FIXTURE = r'''
EXTERNAL_STOP = False
import importlib.util,os,signal,threading,time,json,re
from pathlib import Path
os.umask(0o077)
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
h=load('display','/display-helper.py');h.verify_current()
g=load('rvgl','/server/rvgl-bootstrap.py');g.prepare(Path('/server'))
observed={'engineSpawned':False,'udpBound':False};children=[]
output=open('/server/rvgl-process.log','ab',buffering=0)
original=g.subprocess.Popen
def spawn(command,*args,**kwargs):
 if command[0]=='/server/runtime/rvgl.64':kwargs.update(stdout=output,stderr=output)
 child=original(command,*args,**kwargs)
 if command[0]=='/server/runtime/rvgl.64':observed['engineSpawned']=True;children.append(child)
 return child
g.subprocess.Popen=spawn
stop=threading.Event()
def monitor():
 deadline=time.monotonic()+(90 if EXTERNAL_STOP else 30)
 while not stop.wait(0.5) and time.monotonic()<deadline:
  for file in ('/proc/net/udp','/proc/net/udp6'):
   if any(row.split()[1].endswith(':0906') for row in Path(file).read_text().splitlines()[1:]):observed['udpBound']=True
 if not stop.is_set() and not EXTERNAL_STOP:os.kill(os.getpid(),signal.SIGTERM)
thread=threading.Thread(target=monitor,daemon=True);thread.start()
try:status=g.supervise(2310,h)
finally:stop.set();thread.join(timeout=2);output.close()
text=Path('/server/rvgl-process.log').read_text(errors='replace')[-8192:]
errors=[line[:300] for line in text.splitlines() if re.search(r'error|fail|fatal|denied|cannot|could not',line,re.I)]
print(json.dumps({'case':'rvgl-isolated-start-stop','exitStatus':status,**observed,'engineExitCode':children[0].returncode if children else None,'errors':errors[-5:]}))
assert not h.DISPLAY_ROOT.joinpath('Xauthority').exists()
assert observed['engineSpawned'] and observed['udpBound'], 'RVGL never bound its gameplay port'
assert children[0].returncode == 0, 'RVGL did not stop cleanly'
'''


def command(uid, label, role, address):
    prefix = ['/usr/bin/aa-exec', '-p', label, '--'] if label else []
    return prefix+['/usr/bin/setpriv', '--reuid='+str(uid), '--regid='+str(uid),
                   '--clear-groups', '/usr/bin/python3', '-I', '-c', CHILD, role, address]


def probe(policy, server_uid, server_label, client_uid, client_label, expected, datagram=False):
    address = '/tmp/.X11-unix/X'+str(policy.display_number(server_uid))
    listener = subprocess.Popen(command(server_uid, server_label, 'listen-dgram' if datagram else 'listen', address),
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True)
    try:
        ready, _, _ = select.select([listener.stdout], [], [], 5)
        if not ready or listener.stdout.readline().strip() != 'READY':
            raise ValueError('Staging listener did not become ready')
        result = subprocess.run(command(client_uid, client_label, 'connect-dgram' if datagram else 'connect', address),
                                stdin=subprocess.DEVNULL, capture_output=True,
                                text=True, timeout=5)
        if result.returncode or result.stdout.strip() != expected:
            raise ValueError('IPC peer expectation failed: '+expected)
        output, _ = listener.communicate(timeout=5)
        if listener.returncode or output.strip() != ('ACCEPTED' if expected == 'CONNECTED' else 'TIMEOUT'):
            raise ValueError('IPC listener result differed')
    finally:
        if listener.poll() is None:
            listener.kill()
            listener.communicate(timeout=3)


def display_probe(policy, corekeeper=False, online=False, rvgl=False, root_command=False, external_stop=False):
    if external_stop and not root_command:
        raise ValueError('External stop requires the root-generated namespace')
    if root_command and not ((corekeeper and online and not rvgl) or (rvgl and not corekeeper and not online)):
        raise ValueError('Root namespace staging requires one supported engine fixture')
    uid = UIDS[0]
    parent = Path('/var/lib/playbound-customer-runtime')
    info = parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Unsafe staging workspace parent')
    root = Path(tempfile.mkdtemp(prefix='staging-display-', dir=parent))
    descriptor = None
    syscall_descriptor = None
    entry_descriptor = None
    game_descriptor = None
    dns_descriptor = None
    egress = None
    asset_descriptor = None
    identity_descriptors = []
    config_descriptor = None
    namespace_created = False
    namespace = 'pb-staging-rvgl' if rvgl else 'pb-staging-corekeeper'
    unit = 'playbound-staging-rvgl' if rvgl else 'playbound-staging-corekeeper'
    fixture_id = 'f'*24
    if external_stop:
        unit = 'playbound-customer-'+fixture_id+'-'+str(os.getpid())
        if Path('/sys/fs/cgroup/system.slice',unit+'.scope').exists():
            root.rmdir()  # Only the newly-created, still-empty fixture directory.
            raise ValueError('Staging controller scope already exists')
    try:
        root.chmod(0o711)
        data = root/'data'
        data.mkdir(mode=0o700)
        os.chown(data, uid, uid)
        helper = Path(__file__).with_name('customer-display.py')
        info = helper.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022:
            raise ValueError('Untrusted staging display helper')
        descriptor = os.open(helper, os.O_RDONLY | os.O_NOFOLLOW)
        code = '''import importlib.util,json,socket,ctypes,errno
libc=ctypes.CDLL(None,use_errno=True)
assert libc.unshare(0x40000000)==-1 and ctypes.get_errno()==errno.EPERM
try:socket.socket(socket.AF_UNIX,socket.SOCK_DGRAM)
except PermissionError:pass
else:raise AssertionError('Unix datagram socket admitted')
a,b=socket.socketpair(socket.AF_UNIX,socket.SOCK_DGRAM)
a.send(b'x');assert b.recv(1)==b'x';a.close();b.close()
from pathlib import Path
assert not Path('/var/lib/playbound-host').exists()
assert not Path('/root').exists()
try:
 Path('/usr/.playbound-staging-write-check').write_text('fixture')
except OSError:pass
else:raise AssertionError('System mount was writable')
spec=importlib.util.spec_from_file_location('display','/display-helper.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
d=h.start()
try:
 uid,number=h.verify_current()
 assert d.process.poll() is None
 assert not h.authenticated_ready(uid,number,b'x'*16)
finally:d.close()
assert not h.DISPLAY_ROOT.joinpath('Xauthority').exists()
print(json.dumps({'case':'confined-xvfb-authentication-cleanup','passed':True}))
'''
        args = [*confined_prefix(uid, policy.profile_name(uid)),
                '/usr/bin/prlimit', '--as=1073741824', '--core=0', '--', '/usr/bin/bwrap',
                '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
                '--unshare-cgroup', '--disable-userns', '--cap-drop', 'ALL', '--die-with-parent',
                '--ro-bind', '/usr', '/usr', '--ro-bind', '/usr/bin', '/bin',
                '--ro-bind', '/usr/lib', '/lib', '--ro-bind', '/usr/lib64', '/lib64',
                '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--bind', str(data), '/server',
                '--ro-bind-data', str(descriptor), '/display-helper.py', '--chdir', '/server',
                '--clearenv', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'HOME', '/server',
                '--setenv', 'LANG', 'C.UTF-8', '--', '/usr/bin/python3', '-I', '-c', code]
        if corekeeper:
            # The public bundle was separately published and hash-verified by
            # the fixed operator publisher, never mounted from mutable live files.
            reader_file = Path(__file__).with_name('customer-xonotic-assets.py')
            spec = importlib.util.spec_from_file_location('asset_reader', reader_file)
            reader = importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
            asset_descriptor = reader.open_assets(Path('/var/lib/playbound-customer-runtime/staging-corekeeper-assets-v2'), 'core-keeper')
            game_descriptor = os.open(Path(__file__).with_name('customer-corekeeper.py'), os.O_RDONLY|os.O_NOFOLLOW)
            game_info = os.fstat(game_descriptor)
            if (not stat.S_ISREG(game_info.st_mode) or game_info.st_uid != 0
                    or game_info.st_nlink != 1 or game_info.st_mode & 0o022):
                raise ValueError('Untrusted staging Core Keeper helper')
            loader = importlib.machinery.SourceFileLoader('staging_corekeeper', '/proc/self/fd/'+str(game_descriptor))
            spec = importlib.util.spec_from_loader('staging_corekeeper', loader)
            game = importlib.util.module_from_spec(spec);loader.exec_module(game)
            identity_descriptors = game.identity_mounts(data, uid)
            split = args.index('--clearenv')
            args[split:split] = ['--ro-bind', '/proc/self/fd/'+str(asset_descriptor), '/game-data',
                '--ro-bind-data', str(game_descriptor), '/server/corekeeper-bootstrap.py',
                *[part for identity_descriptor, name in identity_descriptors
                  for part in ('--bind', '/proc/self/fd/'+str(identity_descriptor), '/game-data/'+name)]]
            args[args.index('/usr/bin/prlimit')+1] = '--as=17179869184'
            args.insert(args.index('/usr/bin/prlimit')+2,'--fsize=16777216')
            code = COREKEEPER_FIXTURE
            if online:
                code = code.replace('REQUIRE_ONLINE_QUERY = False', 'REQUIRE_ONLINE_QUERY = True')
            args[-1] = code
            # No Internet route, public bind, live game port or Steam identity.
            subprocess.run(['/usr/sbin/ip', 'netns', 'add', namespace], check=True, capture_output=True)
            namespace_created = True
            subprocess.run(['/usr/sbin/ip', '-n', namespace, 'link', 'set', 'lo', 'up'], check=True, capture_output=True)
            if online:
                helper = Path(__file__).with_name('customer-staging-network.py')
                spec = importlib.util.spec_from_file_location('staging_egress', helper)
                network = importlib.util.module_from_spec(spec);spec.loader.exec_module(network)
                egress = network.StagingEgress();egress.start()
                dns_descriptor = os.memfd_create('pb-staging-public-dns',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
                os.write(dns_descriptor,b'nameserver 1.1.1.1\nnameserver 1.0.0.1\noptions timeout:2 attempts:2\n')
                os.lseek(dns_descriptor,0,os.SEEK_SET)
                fcntl.fcntl(dns_descriptor,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
                split = args.index('--clearenv')
                args[split:split] = ['--ro-bind-data',str(dns_descriptor),'/etc/resolv.conf',
                    '--ro-bind','/etc/ssl/certs','/etc/ssl/certs']
            args = ['/usr/sbin/ip', 'netns', 'exec', namespace, *args]
            args = ['/usr/bin/systemd-run', '--scope', '--quiet', '--collect',
                '--unit='+unit, '-p', 'MemoryMax=2G',
                '-p', 'MemorySwapMax=0', '-p', 'CPUQuota=100%', '-p', 'TasksMax=128', *args]
        if rvgl:
            spec = importlib.util.spec_from_file_location('asset_reader', Path(__file__).with_name('customer-xonotic-assets.py'))
            reader = importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
            asset_descriptor = reader.open_assets(Path('/var/lib/playbound-customer-runtime/staging-rvgl-assets'), 're-volt-rvgl')
            spec = importlib.util.spec_from_file_location('layout', Path(__file__).with_name('customer-rvgl.py'))
            layout = importlib.util.module_from_spec(spec);spec.loader.exec_module(layout)
            layout.prepare(data)
            for folder, dirs, files in os.walk(data):
                os.chown(folder,uid,uid)
            game_descriptor = os.open(Path(__file__).with_name('customer-rvgl.py'), os.O_RDONLY|os.O_NOFOLLOW)
            split = args.index('--clearenv')
            args[split:split] = [*layout.mounts(asset_descriptor), '--ro-bind-data', str(game_descriptor), '/server/rvgl-bootstrap.py']
            args[args.index('/usr/bin/prlimit')+1] = '--as=8589934592'
            args.insert(args.index('/usr/bin/prlimit')+2,'--fsize=16777216')
            code = RVGL_FIXTURE
            args[-1] = code
            subprocess.run(['/usr/sbin/ip','netns','add',namespace],check=True,capture_output=True)
            namespace_created=True
            subprocess.run(['/usr/sbin/ip','-n',namespace,'link','set','lo','up'],check=True,capture_output=True)
            args=['/usr/bin/systemd-run','--scope','--quiet','--collect','--unit='+unit,
                '-p','MemoryMax=1G','-p','MemorySwapMax=0','-p','CPUQuota=100%','-p','TasksMax=128',
                '/usr/sbin/ip','netns','exec',namespace,*args]
        syscall_helper = Path(__file__).with_name('customer-seccomp.py')
        if root_command:
            # Exercise the real root namespace builder with only fixture source
            # mounts substituted. No installed helper, account or journal changes.
            runtime_file = Path(__file__).with_name('customer-runtime.py')
            info = runtime_file.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022:
                raise ValueError('Untrusted root runtime staging source')
            spec = importlib.util.spec_from_file_location('staging_root_runtime', runtime_file)
            runtime = importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
            runtime.select_game('re-volt-rvgl' if rvgl else 'core-keeper')
            if rvgl:
                original_trusted = runtime.trusted_module
                runtime.trusted_module = lambda name, filename: layout if filename == 'playbound-customer-rvgl' else original_trusted(name,filename)
            config_descriptor = os.memfd_create('pb-staging-root-config', os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
            payload = {'configuration':{},'port':2310} if rvgl else {'configuration': {'name':'PlayBound isolated staging','maxPlayers':4}, 'port':1320}
            os.write(config_descriptor, json.dumps(payload).encode())
            os.lseek(config_descriptor,0,os.SEEK_SET)
            fcntl.fcntl(config_descriptor,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
            namespace_command = runtime.command(data,config_descriptor,payload['port'],1024 if rvgl else 2048,
                native_settings=payload,dns_fd=dns_descriptor,asset_directory=asset_descriptor,
                identity_files=identity_descriptors)
            replacements = {
                '/usr/local/libexec/playbound-customer-corekeeper':game_descriptor,
                '/usr/local/libexec/playbound-customer-rvgl':game_descriptor,
                '/usr/local/libexec/playbound-customer-display':descriptor,
            }
            # Installed helpers are public root-owned files. Staging sources
            # stay below /root; copy their already-verified descriptors into
            # read-only mounts instead of resolving an inaccessible host path.
            for position, part in enumerate(namespace_command):
                if part in replacements:
                    if namespace_command[position-1] != '--ro-bind':
                        raise ValueError('Unexpected trusted helper mount form')
                    namespace_command[position-1] = '--ro-bind-data'
                    namespace_command[position] = str(replacements[part])
            code = code.replace("'/server/rvgl-bootstrap.py'", "'/rvgl-bootstrap.py'") if rvgl else code.replace("'/server/corekeeper-bootstrap.py'", "'/corekeeper-bootstrap.py'")
            if rvgl:
                code = code.replace("g=load('rvgl'", "assert json.loads(Path('/server/server.cfg').read_text()) == "+repr(payload)+"\ng=load('rvgl'")
                code = code.replace("'case':'rvgl-isolated-start-stop'", "'rootCommandGenerated':True,'case':'rvgl-isolated-start-stop'")
            code = code.replace("g=load('corekeeper'", "assert json.loads(Path('/server/server.cfg').read_text()) == "+repr(payload)+"\ng=load('corekeeper'")
            code = code.replace("'case':'corekeeper-isolated-start-stop'", "'rootCommandGenerated':True,'case':'corekeeper-isolated-start-stop'")
            if external_stop:
                code = code.replace('EXTERNAL_STOP = False', 'EXTERNAL_STOP = True')
            # The fixture owns the timed query/stop and calls the actual game
            # helper; this is namespace acceptance, not agent adoption acceptance.
            namespace_command[-3:] = ['/usr/bin/python3','-I','-c',code]
            namespace_command.insert(2,'--fsize=16777216')
            args = args[:args.index('/usr/bin/prlimit')]+namespace_command
        info = syscall_helper.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022:
            raise ValueError('Untrusted staging syscall helper')
        syscall_descriptor = os.open(syscall_helper, os.O_RDONLY | os.O_NOFOLLOW)
        entry_helper = Path(__file__).with_name('customer-display-entry.py')
        entry_descriptor = os.open(entry_helper, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        entry_info = os.fstat(entry_descriptor)
        if (not stat.S_ISREG(entry_info.st_mode) or entry_info.st_uid != 0
                or entry_info.st_nlink != 1 or entry_info.st_mode & 0o022):
            raise ValueError('Untrusted staging display entry helper')
        position = args.index('/usr/bin/bwrap')
        args = args[:position]+['/usr/bin/python3', '-I', '/proc/self/fd/'+str(entry_descriptor), str(syscall_descriptor), *args[position+1:]]
        inherited = tuple(fd for fd in (descriptor,entry_descriptor,syscall_descriptor,game_descriptor,asset_descriptor,dns_descriptor,config_descriptor) if fd is not None)+tuple(fd for fd, _ in identity_descriptors)
        if external_stop:
            verify_controller_scope(args,unit,runtime.scope_path(fixture_id,os.getpid()))
            runtime.ROOT = root/'controller'
            runtime.ROOT.mkdir(mode=0o711)
            server = runtime.ROOT/fixture_id
            server.mkdir(mode=0o711)
            (server/'control').mkdir(mode=0o700)
            with subprocess.Popen(args, pass_fds=inherited, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as process:
                try:
                    try:
                        stdout, stderr = process.communicate(timeout=90)
                    except subprocess.TimeoutExpired:
                        scope = runtime.scope_path(fixture_id,os.getpid())
                        candidates = []
                        for raw in (scope/'cgroup.procs').read_text().splitlines():
                            pid = int(raw)
                            directory = Path('/proc')/raw
                            try:
                                if directory.stat().st_uid == uid and (directory/'comm').read_text().strip() == 'bwrap':
                                    candidates.append(pid)
                            except FileNotFoundError:
                                pass
                        if not candidates:
                            raise ValueError('No confined staging wrapper to stop')
                        game_pid = min(candidates)
                        wrapper_identity = runtime.game_identity(game_pid)
                        control_pid, control_identity = runtime.scoped_command_identity(
                            game_pid,wrapper_identity,uid,scope,['/usr/bin/python3','-I','-c',code])
                        gate_identity = runtime.game_identity(os.getpid())
                        runtime.binding_write(server, {'profile':runtime.PROFILE,'serverId':fixture_id,
                            'gatePid':os.getpid(),'gateIdentity':gate_identity,'uid':uid,'gid':uid,
                            'gamePid':game_pid,'gameIdentity':wrapper_identity,
                            'controlPid':control_pid,'controlIdentity':control_identity})
                        # No binding/identity/scope/signal functions are replaced.
                        # Only the private fixture ROOT differs from production.
                        outcome = runtime.stop_runtime(fixture_id,os.getpid(),gate_identity)
                        if outcome.get('graceful') is not True:
                            raise ValueError('External controller required a forced scope stop')
                        stdout, stderr = process.communicate(timeout=10)
                        print(json.dumps({'case':'root-controller-external-stop','graceful':True}),flush=True)
                    else:
                        raise ValueError('Engine exited before the external stop request')
                    result = subprocess.CompletedProcess(args,process.returncode,stdout,stderr)
                finally:
                    if process.poll() is None:
                        try:
                            subprocess.run(["/usr/bin/systemctl","kill","--signal=KILL","--kill-whom=all",unit+".scope"],capture_output=True,timeout=10)
                        finally:
                            process.kill()
                            process.communicate(timeout=5)
        else:
            result = subprocess.run(args, pass_fds=inherited, stdin=subprocess.DEVNULL,
                                    capture_output=True, text=True, timeout=115 if corekeeper else 50 if rvgl else 20)
        if result.returncode:
            # Contains only this fixture's fixed commands/paths, never game logs.
            raise ValueError('Confined Xvfb fixture failed: '+result.stderr[-2048:])
        validate_engine_result(result.stdout, corekeeper=corekeeper, online=online, rvgl=rvgl, root_command=root_command)
        print(result.stdout.strip(), flush=True)
    finally:
        actions = []
        if corekeeper or rvgl:
            actions.extend([
                ('kill scope', lambda: subprocess.run(['/usr/bin/systemctl','kill','--signal=KILL','--kill-whom=all',unit+'.scope'],capture_output=True,timeout=10)),
                ('stop scope', lambda: subprocess.run(['/usr/bin/systemctl','stop',unit+'.scope'],capture_output=True,timeout=15)),
            ])
        if egress is not None:
            actions.append(('egress rules', egress.close))
        if namespace_created:
            actions.append(('network namespace', lambda: subprocess.run(['/usr/sbin/ip','netns','del',namespace],capture_output=True,timeout=10,check=True)))
        for fd in (descriptor, entry_descriptor, syscall_descriptor, game_descriptor, asset_descriptor, dns_descriptor, config_descriptor):
            if fd is not None:
                actions.append(('descriptor '+str(fd), lambda fd=fd: os.close(fd)))
        for fd, _ in identity_descriptors:
            actions.append(('private identity descriptor '+str(fd), lambda fd=fd: os.close(fd)))
        actions.append(('private workspace', lambda: shutil.rmtree(root)))
        cleanup_all(actions)


def main():
    if sys.argv[1:] not in ([], ['--corekeeper'], ['--corekeeper-online'], ['--corekeeper-root-command'], ['--corekeeper-external-stop'], ['--rvgl'], ['--rvgl-root-command'], ['--rvgl-external-stop']) or os.getuid() != 0 or os.environ.get('SUDO_USER'):
        raise ValueError('Direct root staging operator required; only optional --corekeeper/--corekeeper-online')
    helper = Path(__file__).with_name('customer-display-policy.py')
    info = helper.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or info.st_mode & 0o022:
        raise ValueError('Untrusted staging policy source')
    spec = importlib.util.spec_from_file_location('staging_policy', helper)
    policy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(policy)
    existing = Path('/sys/kernel/security/apparmor/profiles').read_text().splitlines()
    for uid in UIDS:
        try:
            pwd.getpwuid(uid)
        except KeyError:
            pass
        else:
            raise ValueError('Staging UID has an assigned account')
        if any(row.startswith(policy.profile_name(uid)+' ') for row in existing):
            raise ValueError('Staging label already exists')
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            row = next(row for row in (process/'status').read_text().splitlines() if row.startswith('Uid:'))
        except (OSError, StopIteration):
            continue
        if set(row.split()[1:]) & {str(uid) for uid in UIDS}:
            raise ValueError('Staging UID has a live process')
    loaded = []
    try:
        for uid in UIDS:
            subprocess.run(['/usr/sbin/apparmor_parser', '--add', '--skip-cache', '--Werror'],
                           input=policy.render(uid), text=True, capture_output=True,
                           timeout=10, check=True)
            loaded.append(uid)
            policy.verify_enforced(uid)
        first, second = UIDS
        a, b = policy.profile_name(first), policy.profile_name(second)
        cases = [('same-label', first, a, first, a, 'CONNECTED'),
                 ('cross-label', first, a, second, b, 'DENIED'),
                 ('host-to-private', first, a, first, None, 'DENIED'),
                 ('private-to-host', first, None, first, a, 'DENIED')]
        for name, *arguments in cases:
            probe(policy, *arguments)
            print(json.dumps({'case': name, 'passed': True}), flush=True)
        for name, *arguments in cases:
            probe(policy, *arguments, datagram=True)
            print(json.dumps({'case': name+'-datagram-pair', 'passed': True}), flush=True)
        core = sys.argv[1:] in (['--corekeeper'],['--corekeeper-online'],['--corekeeper-root-command'],['--corekeeper-external-stop'])
        online = sys.argv[1:] in (['--corekeeper-online'],['--corekeeper-root-command'],['--corekeeper-external-stop'])
        root_command = sys.argv[1:] in (['--corekeeper-root-command'],['--corekeeper-external-stop'],['--rvgl-root-command'],['--rvgl-external-stop'])
        display_probe(policy,corekeeper=core,online=online,rvgl=sys.argv[1:] in (['--rvgl'],['--rvgl-root-command'],['--rvgl-external-stop']),root_command=root_command,external_stop=sys.argv[1:] in (['--corekeeper-external-stop'],['--rvgl-external-stop']))
    finally:
        cleanup_all([('IPC label '+str(uid), lambda uid=uid: subprocess.run(
            ['/usr/sbin/apparmor_parser', '--remove', '--skip-cache'],
            input=policy.render(uid), text=True, capture_output=True,
            timeout=10, check=True)) for uid in reversed(loaded)])


if __name__ == '__main__':
    main()
