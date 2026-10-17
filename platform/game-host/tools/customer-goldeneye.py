"""GoldenEye private configuration/argv candidate; not a Wine runtime boundary."""
import json
import re


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid GoldenEye configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers', 'map', 'timeLimit', 'rconPassword'}:
        raise ValueError('Undeclared GoldenEye setting')
    if type(port) is not int or not 27120 <= port <= 27139:
        raise ValueError('Invalid GoldenEye allocation')
    for key, maximum in (('name', 100), ('rconPassword', 128)):
        if not isinstance(value[key], str) or len(value[key]) > maximum or re.search(r'[\x00-\x1f\x7f"\\;]', value[key]):
            raise ValueError('Invalid GoldenEye text setting')
    if not value['name'] or not isinstance(value['map'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value['map']):
        raise ValueError('Invalid GoldenEye name or map')
    # Same requested range as the existing recipe; actual engine admission
    # limits still require runtime acceptance, so this does not enable hosting.
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64:
        raise ValueError('Invalid GoldenEye player limit')
    if type(value['timeLimit']) is not int or not 0 <= value['timeLimit'] <= 600:
        raise ValueError('Invalid GoldenEye time limit')
    return value


def prepare(root, value, port, private_files):
    settings(json.dumps(value), port)
    # private_files is the immutable Source filesystem module supplied by a
    # trusted bootstrap, never a path or module selected by a customer/API.
    for name in ('runtime/gesource/cfg', 'runtime/gesource/maps/graphs',
                 'runtime/gesource/python', 'runtime/gesource/logs',
                 'runtime/gesource/DownloadLists', 'runtime/gesource/download',
                 'runtime/gesource/downloads', 'runtime/gesource/custom',
                 'runtime/gesource/cache', 'wineprefix', '.runtime', '.cache'):
        private_files.private_directory(root, name)
    text = ('hostname "'+value['name']+'"\nrcon_password "'+value['rconPassword']+
            '"\nmp_timelimit '+str(value['timeLimit'])+'\n')
    private_files.private_write(root/'runtime/gesource/cfg/pb-managed.cfg', text)


def arguments(value, port):
    settings(json.dumps(value), port)
    return ['/usr/bin/wine', '/server/runtime/srcds.exe', '-console', '-game',
            'gesource', '-strictportbind', '-norestart', '-ip', '0.0.0.0',
            '-port', str(port), '+map', value['map'], '-maxplayers',
            str(value['maxPlayers']), '+mp_timelimit', str(value['timeLimit']),
            '+exec', 'pb-managed.cfg']


def environment():
    return {'PATH': '/usr/bin:/bin', 'HOME': '/server', 'LANG': 'C.UTF-8',
            'WINEPREFIX': '/server/wineprefix', 'WINEDEBUG': '-all',
            'XDG_RUNTIME_DIR': '/server/.runtime', 'XDG_CACHE_HOME': '/server/.cache',
            'PYTHONDONTWRITEBYTECODE': '1'}
