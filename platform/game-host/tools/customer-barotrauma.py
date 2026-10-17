#!/usr/bin/python3 -I
"""Private Barotrauma configuration contract; not an enrollment grant."""
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import xml.etree.ElementTree as ET


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid Barotrauma settings')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers'}:
        raise ValueError('Undeclared Barotrauma setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 80 or re.search(r'[\x00-\x1f\x7f]', value['name']):
        raise ValueError('Invalid Barotrauma name')
    if type(port) is not int or not 27220 <= port <= 27238 or (port - 27220) % 2:
        raise ValueError('Invalid Barotrauma allocation')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 16:
        raise ValueError('Invalid Barotrauma slots')
    return value


def prepare(root, value, port):
    settings(json.dumps(value), port)
    info = root.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Unsafe private Barotrauma root')
    filename = root / 'serversettings.xml'
    try:
        descriptor = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        document = ET.Element('serversettings')
    else:
        with os.fdopen(descriptor, 'rb') as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 262144:
                raise ValueError('Unsafe private Barotrauma configuration')
            content = source.read(262145)
        if len(content) > 262144 or b'<!' in content or b'\x00' in content:
            raise ValueError('Unsupported Barotrauma XML declaration')
        document = ET.fromstring(content)
        if document.tag != 'serversettings':
            raise ValueError('Invalid Barotrauma settings root')
    document.attrib.update({'ServerName': value['name'], 'port': str(port),
        'queryport': str(port + 1), 'MaxPlayers': str(value['maxPlayers']),
        'IsPublic': 'False', 'enableupnp': 'false'})
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-settings-', dir=root)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(ET.tostring(document, encoding='utf-8', xml_declaration=True))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, filename)
        directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/DedicatedServer').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server/runtime'), value, payload['port'])
    os.chdir('/server/runtime')
    os.execv('/game-data/DedicatedServer', ['/game-data/DedicatedServer'])
