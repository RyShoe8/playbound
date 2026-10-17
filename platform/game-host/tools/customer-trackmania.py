#!/usr/bin/python3 -I
"""Trackmania private XML/bootstrap contract. Credentials never enter argv."""
import json
import os
from pathlib import Path
import re
import secrets
import stat
import tempfile
import xml.etree.ElementTree as ET


def settings(text, port):
    if not isinstance(text, str) or len(text.encode()) > 16384:
        raise ValueError('Invalid Trackmania configuration')
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {'name', 'maxPlayers'}:
        raise ValueError('Undeclared Trackmania setting')
    if not isinstance(value['name'], str) or not 1 <= len(value['name']) <= 100 or re.search(r'[\x00-\x1f\x7f]', value['name']):
        raise ValueError('Invalid Trackmania name')
    if type(value['maxPlayers']) is not int or not 2 <= value['maxPlayers'] <= 64 or type(port) is not int or not 23520 <= port <= 23538 or (port-23520) % 2:
        raise ValueError('Invalid Trackmania allocation')
    return value


def read_private(file, maximum=262144):
    descriptor = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, 'rb') as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > maximum:
            raise ValueError('Unsafe private Trackmania file')
        content = source.read(maximum+1)
        if len(content) > maximum:
            raise ValueError('Trackmania file exceeds limit')
        return content


def write_private(file, content):
    try:
        read_private(file)
    except FileNotFoundError:
        pass
    descriptor, temporary = tempfile.mkstemp(prefix='.pb-trackmania-', dir=file.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
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


def prepare(root, value, port):
    settings(json.dumps(value), port)
    account = json.loads(read_private(root/'dedicated-account.json', 4096))
    if not isinstance(account, dict) or any(not isinstance(account.get(key), str) or not 1 <= len(account[key]) <= 256 or re.search(r'[\x00-\x1f\x7f]', account[key]) for key in ('login', 'password')):
        raise ValueError('Private Trackmania account required')
    for relative in ('runtime', 'runtime/UserData', 'runtime/UserData/Config',
                     'runtime/UserData/Maps', 'runtime/UserData/Maps/MatchSettings',
                     'runtime/Logs', 'runtime/CommonData'):
        directory = root/relative
        directory.mkdir(mode=0o700, exist_ok=True)
        info = directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe Trackmania data directory')
    passwords_file = root/'xmlrpc-passwords.json'
    try:
        passwords = json.loads(read_private(passwords_file, 4096))
    except FileNotFoundError:
        passwords = {name: secrets.token_hex(24) for name in ('SuperAdmin', 'Admin', 'User')}
        write_private(passwords_file, json.dumps(passwords).encode())
    if not isinstance(passwords, dict) or set(passwords) != {'SuperAdmin', 'Admin', 'User'} or any(not isinstance(secret, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', secret) for secret in passwords.values()):
        raise ValueError('Invalid private Trackmania RPC credentials')
    file = root/'runtime/UserData/Config/dedicated_cfg.txt'
    try:
        content = read_private(file)
    except FileNotFoundError:
        document = ET.Element('dedicated')
    else:
        if b'<!' in content or b'\x00' in content:
            raise ValueError('Unsupported Trackmania XML declaration')
        document = ET.fromstring(content)
        if document.tag != 'dedicated':
            raise ValueError('Invalid Trackmania XML root')
    def section(name):
        found = document.findall(name)
        if len(found) > 1:
            raise ValueError('Duplicate Trackmania section')
        return found[0] if found else ET.SubElement(document, name)
    def fields(parent, values):
        for name, text in values.items():
            found = parent.findall(name)
            if len(found) > 1:
                raise ValueError('Duplicate Trackmania setting')
            target = found[0] if found else ET.SubElement(parent, name)
            target.text = str(text)
    auth = section('authorization_levels')
    auth.clear()
    for name, password in passwords.items():
        fields(ET.SubElement(auth, 'level'), {'name': name, 'password': password})
    fields(section('masterserver_account'), {'login': account['login'], 'password': account['password']})
    fields(section('server_options'), {'name': value['name'], 'max_players': value['maxPlayers'],
           'hide_server': 1, 'enable_p2p_upload': 'false', 'enable_p2p_download': 'false'})
    fields(section('system_config'), {'server_port': port, 'client_port': port,
           'xmlrpc_port': port+1, 'xmlrpc_allowremote': 'false', 'bind_ip_address': '0.0.0.0',
           'use_nat_upnp': 'false', 'allow_spectator_relays': 'false'})
    write_private(file, ET.tostring(document, encoding='utf-8', xml_declaration=True))
    match = root/'runtime/UserData/Maps/MatchSettings/example.txt'
    # Custom maps/settings must already exist; no implicit public download.
    if not read_private(match, 1024**2).strip():
        raise ValueError('Private Trackmania match settings required')


if __name__ == '__main__':
    if not 40000 <= os.getuid() <= 40255 or not Path('/game-data/TrackmaniaServer').is_file():
        raise SystemExit('Reserved runtime namespace required')
    payload = json.loads(Path('/server/server.cfg').read_text())
    value = settings(json.dumps(payload['configuration']), payload['port'])
    prepare(Path('/server'), value, payload['port'])
    os.chdir('/server/runtime')
    os.execv('/game-data/TrackmaniaServer', ['/game-data/TrackmaniaServer',
             '/dedicated_cfg=dedicated_cfg.txt', '/game_settings=MatchSettings/example.txt', '/nodaemon'])
