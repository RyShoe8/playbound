"""One-room managed agent smoke test on a loopback-only staging agent."""

import json
import os
import sys
import time
import urllib.request
from pathlib import Path


ROOM_ID = 'smoke-openra-20260924'
BASE = os.environ.get('PLAYBOUND_AGENT_URL', 'http://127.0.0.1:18741')
PID_FILE = Path('/tmp/playbound-managed-smoke-pid')


def token():
    for line in Path('/tmp/playbound-game-host-staging.env').read_text().splitlines():
        if line.startswith('GAME_HOST_SECRET='):
            return line.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError('Staging secret unavailable')


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method, headers={
        'authorization': 'Bearer ' + token(), 'content-type': 'application/json',
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def room():
    return next((row for row in call('GET', '/managed')['rooms']
                 if row['communityServerId'] == ROOM_ID), None)


def main():
    mode = sys.argv[1]
    if mode == 'start':
        result = call('POST', '/managed', {
            'communityServerId': ROOM_ID, 'gameSlug': 'openra',
            'editionSlug': 'official', 'mod': 'ra', 'name': 'PlayBound staging smoke',
        })
        assert result['status'] in ('pending', 'running'), result
        for _ in range(60):
            snapshot = call('GET', '/managed')
            current = next((row for row in snapshot['rooms'] if row['communityServerId'] == ROOM_ID), None)
            if snapshot['jobs'].get(ROOM_ID, {}).get('status') == 'failed':
                raise RuntimeError(snapshot['jobs'][ROOM_ID].get('error', 'Managed start failed'))
            if current and snapshot['jobs'].get(ROOM_ID, {}).get('status') == 'running':
                PID_FILE.write_text(str(current['pid']))
                print(json.dumps({'phase': 'started', 'pid': current['pid'],
                                  'port': current['port'], 'resources': current.get('resources')}))
                return
            time.sleep(1)
        raise RuntimeError('Managed room did not start within 60 seconds')
    if mode == 'check':
        current = room()
        assert current, 'Managed room did not recover after restart'
        assert current['pid'] == int(PID_FILE.read_text()), 'Agent replaced a recoverable process'
        print(json.dumps({'phase': 'reattached', 'pid': current['pid'],
                          'port': current['port'], 'resources': current.get('resources')}))
        return
    if mode == 'stop':
        call('DELETE', '/managed/' + ROOM_ID)
        assert not room(), 'Room remained in registry after stop'
        print(json.dumps({'phase': 'stopped'}))
        return
    if mode == 'diagnose':
        entries = json.loads(Path('/tmp/playbound-agent-staging-state/managed-rooms.json').read_text())
        saved = next(row for row in entries if row['communityServerId'] == ROOM_ID)
        pid = saved['pid']
        stat = Path(f'/proc/{pid}/stat').read_text()
        fields = stat[stat.rfind(')') + 2:].split()
        current = Path('/proc/sys/kernel/random/boot_id').read_text().strip() + ':' + fields[19]
        print(json.dumps({'phase': 'diagnose', 'pid': pid,
                          'identityMatches': saved['identity'] == current,
                          'groupId': int(fields[2]), 'state': fields[0]}))
        return
    if mode == 'rooms':
        rows = call('GET', '/rooms')['rooms']
        print(json.dumps([{'roomId': row['roomId'], 'gameSlug': row['gameSlug'],
                           'createdAt': row['createdAt']} for row in rows]))
        return
    raise RuntimeError('Use start, check, or stop')


if __name__ == '__main__':
    main()
