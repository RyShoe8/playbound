#!/usr/bin/python3 -I
"""Identity-bound RVGL display transport. No caller-supplied path or command."""
import base64
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ROOT = Path('/var/lib/playbound-customer-runtime')
KEYS = {'Up', 'Down', 'Left', 'Right', 'Return', 'Escape', 'BackSpace', 'Tab', 'space'}


def trusted(name, filename):
    path = Path('/usr/local/libexec') / filename
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
        raise ValueError('Untrusted runtime dependency')
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def validate_input(value):
    if not isinstance(value, dict):
        raise ValueError('Invalid lobby input')
    if set(value) == {'type', 'x', 'y'} and value['type'] == 'click' and type(value['x']) is int and type(value['y']) is int and 0 <= value['x'] < 640 and 0 <= value['y'] < 480:
        return ['mousemove', str(value['x']), str(value['y'])], ['click', '1']
    if set(value) == {'type', 'key'} and value['type'] == 'key' and value['key'] in KEYS:
        return ['mousemove', '320', '240'], ['key', '--clearmodifiers', value['key']]
    raise ValueError('Invalid lobby input')


def identity(action, server_id, pid, process_identity):
    if action not in ('capture', 'input') or not re.fullmatch(r'[a-f0-9]{24}', server_id) or not re.fullmatch(r'[1-9][0-9]{0,9}', pid) or not re.fullmatch(r'[a-f0-9-]{36}:[0-9]+', process_identity):
        raise ValueError('Invalid lobby identity')
    identities = trusted('rvgl_identities', 'playbound-customer-identities')
    identities.verify_caller()
    runtime = trusted('rvgl_runtime', 'playbound-customer-runtime')
    resources = trusted('rvgl_resources', 'playbound-customer-resources')
    if runtime.journal_game(server_id) != 're-volt-rvgl':
        raise ValueError('Wrong lobby game')
    runtime.select_game('re-volt-rvgl')
    result = runtime.runtime_status(resources, server_id, int(pid), process_identity)
    if result.get('running') is not True or result.get('profile') != 're-volt-rvgl-unix-v1':
        raise ValueError('RVGL runtime is not healthy')
    uid = result['uid']
    if type(uid) is not int or not 40000 <= uid <= 40255:
        raise ValueError('Invalid lobby UID')
    data = ROOT / server_id / 'data'
    display_dir = data / '.display'
    authority = display_dir / 'Xauthority'
    for path in (data, display_dir):
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
            raise ValueError('Unsafe lobby directory')
    info = authority.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_nlink != 1 or info.st_mode & 0o077 or not 0 < info.st_size <= 4096:
        raise ValueError('Unsafe lobby authority')
    return uid, 1000 + uid - 40000, str(authority)


def execute(uid, display, authority, args):
    command = ['/usr/bin/aa-exec', '-p', f'playbound-customer-ipc-{uid}', '--',
               '/usr/bin/setpriv', f'--reuid={uid}', f'--regid={uid}', '--clear-groups',
               '/usr/bin/env', f'DISPLAY=:{display}', f'XAUTHORITY={authority}', *args]
    return subprocess.run(command, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'},
                          cwd='/', capture_output=True, timeout=6, check=True).stdout


def main(args):
    if len(args) != 4:
        raise ValueError('Expected action and runtime identity')
    action, server_id, pid, process_identity = args
    uid, display, authority = identity(action, server_id, pid, process_identity)
    if action == 'capture':
        jpeg = execute(uid, display, authority, ['/usr/bin/import', '-window', 'root', '-quality', '68', 'jpeg:-'])
        if not 4 <= len(jpeg) <= 2 * 1024 * 1024 or jpeg[:2] != b'\xff\xd8':
            raise ValueError('RVGL capture did not return a bounded JPEG')
        print(json.dumps({'image': base64.b64encode(jpeg).decode('ascii')}))
        return
    body = sys.stdin.buffer.read(257)
    if len(body) > 256:
        raise ValueError('Lobby input too large')
    move, interaction = validate_input(json.loads(body))
    execute(uid, display, authority, ['/usr/bin/xdotool', *move])
    location = execute(uid, display, authority, ['/usr/bin/xdotool', 'getmouselocation', '--shell']).decode('ascii')
    match = re.search(r'^WINDOW=([1-9][0-9]*)$', location, re.M)
    if not match:
        raise ValueError('RVGL lobby window is not visible')
    execute(uid, display, authority, ['/usr/bin/xdotool', 'windowfocus', match.group(1)])
    execute(uid, display, authority, ['/usr/bin/xdotool', *interaction])
    print('{"ok":true}')


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except Exception as error:
        reason = str(error)[:160] if isinstance(error, ValueError) else type(error).__name__
        print('Private RVGL lobby operation failed: ' + reason, file=sys.stderr)
        sys.exit(1)
