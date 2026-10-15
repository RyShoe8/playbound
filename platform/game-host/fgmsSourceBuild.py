#!/usr/bin/python3
"""Build the reviewed fgms relay, never the FlightGear GUI client."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.request
from reviewedSourceArchive import extract_reviewed_source

HERE = Path(__file__).resolve().parent

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs): raise ValueError('FlightGear source redirect refused')

def build(root):
    if os.geteuid() == 0 or root.exists() or not root.is_absolute():
        raise ValueError('FlightGear build requires an unprivileged fresh directory')
    profile = json.loads((HERE / 'fgmsBuild.json').read_text())
    root.mkdir(mode=0o700); home = root / 'home'; home.mkdir(mode=0o700)
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(home), 'SOURCE_DATE_EPOCH': str(profile['sourceDateEpoch'])}
    compiler = subprocess.run(['/usr/bin/g++', '-dumpfullversion'], env=env, capture_output=True, text=True, check=True, timeout=10).stdout.strip()
    cmake = subprocess.run(['/usr/bin/cmake', '--version'], env=env, capture_output=True, text=True, check=True, timeout=10).stdout.splitlines()[0]
    if compiler != profile['compiler'] or cmake != 'cmake version ' + profile['cmake']:
        raise ValueError('FlightGear reviewed compiler/CMake unavailable')
    archive = root / 'source.tar.gz'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open('https://codeload.github.com/FlightGear/fgms/tar.gz/' + profile['commit'], timeout=90) as response, archive.open('xb') as output:
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > profile['sourceBytes']: raise ValueError('FlightGear source exceeds reviewed size')
            output.write(chunk)
    with archive.open('rb') as source: sha = hashlib.file_digest(source, 'sha256').hexdigest()
    if archive.stat().st_size != profile['sourceBytes'] or sha != profile['sourceSha256']:
        raise ValueError('FlightGear source checksum mismatch')
    source = root / 'source'; extract_reviewed_source(archive, source, 'fgms-' + profile['commit'], max_files=10000, max_bytes=64 * 1024**2, max_entry=16 * 1024**2)
    if (source / 'version').read_text().strip() != profile['version']:
        raise ValueError('FlightGear relay protocol/version changed')
    if hashlib.sha256((source / 'COPYING').read_bytes()).hexdigest() != profile['licenseSha256']:
        raise ValueError('FlightGear upstream license changed')
    flags = '-ffile-prefix-map=' + str(source) + '=/_/fgms -fdebug-prefix-map=' + str(source) + '=/_/fgms'
    subprocess.run(['/usr/bin/cmake', '-S', str(source), '-B', str(root / 'build'), '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIB=OFF', '-DBUILD_SERVER2=OFF', '-DENABLE_DEBUG_SYMBOLS=OFF', '-DCMAKE_C_FLAGS=' + flags, '-DCMAKE_CXX_FLAGS=' + flags], cwd=root, env=env, check=True, timeout=120)
    subprocess.run(['/usr/bin/cmake', '--build', str(root / 'build'), '--parallel', '1'], cwd=root, env=env, check=True, timeout=300)
    binary = root / 'build/fgms'
    if binary.stat().st_size != profile['binary']['bytes'] or hashlib.sha256(binary.read_bytes()).hexdigest() != profile['binary']['sha256']:
        raise ValueError('FlightGear output differs from reviewed build')
    result = subprocess.run([str(binary), '-h'], cwd=home, env=env, capture_output=True, text=True, timeout=10)
    if result.returncode not in [0, 1] or 'fgms: version ' + profile['version'] not in result.stdout + result.stderr:
        raise ValueError('FlightGear offline relay check failed')
    publish = root / 'publish'; publish.mkdir()
    shutil.copyfile(binary, publish / 'fgms'); (publish / 'fgms').chmod(0o755)
    shutil.copyfile(source / 'COPYING', publish / 'COPYING')
    print(json.dumps({'version': profile['version'], 'reviewedBuild': True}))

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2: raise ValueError('FlightGear fresh build directory required')
        build(Path(sys.argv[1]))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else 'FlightGear reviewed source build failed', file=sys.stderr)
        sys.exit(1)
