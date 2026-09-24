"""Run serial spawn/resource checks against the isolated staging agent."""

import json
import time
import urllib.request
from pathlib import Path


BASE = 'http://127.0.0.1:18741'
SOURCE = Path('/tmp/playbound-community-hosting-audit.json')
OUTPUT = Path('/tmp/playbound-staging-resource-audit.json')


def token():
    for line in Path('/tmp/playbound-game-host-staging.env').read_text().splitlines():
        if line.startswith('GAME_HOST_SECRET='):
            return line.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError('Staging secret unavailable')


def main():
    rows = json.loads(SOURCE.read_text())
    selected = [row['slug'] for row in rows if row['state'] == 'spawn-passed'
                and row['slug'] != 'morrowind']
    results = {}
    for slug in selected:
        body = json.dumps({'gameSlug': slug}).encode()
        request = urllib.request.Request(BASE + '/test-spawn', data=body, method='POST', headers={
            'authorization': 'Bearer ' + token(), 'content-type': 'application/json',
        })
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                result = json.load(response)
        except Exception as error:
            result = {'ok': False, 'error': str(error)}
        results[slug] = result
        OUTPUT.write_text(json.dumps(results, indent=2))
        print(json.dumps({'slug': slug, 'ok': result.get('ok'),
                          'elapsedSeconds': round(time.monotonic() - started, 1),
                          'resources': result.get('resources'),
                          'error': result.get('error')}), flush=True)
    print(f'{len(results)} games audited; results at {OUTPUT}', flush=True)


if __name__ == '__main__':
    main()
