#!/usr/bin/python3
"""Pinned source + locked, reviewed NuGet blobs. Never builds caller-selected code."""
import base64
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

def digest(file, algorithm='sha256'):
    with file.open('rb') as source:
        return hashlib.file_digest(source, algorithm).digest()

def patch_program(text, commit, version):
    if any(text.count(hook) != 1 for hook in ['static void Main()', 'ServerNetwork.StartFeature();', 'ServerPrinter.CreateLogger();']):
        raise ValueError('RimWorld reviewed bridge hooks changed')
    info = 'if (args.Length == 1 && args[0] == "--playbound-runtime-info") { Console.WriteLine("PLAYBOUND_RIMWORLD_SOURCE ' + commit + ' ' + version + '"); return; }\n            '
    browser = 'if (args.Length == 1 && args[0] == "--playbound-browser-query") { try { RTServer.PlayBound.Bridge.QueryBrowser().GetAwaiter().GetResult(); } catch (Exception error) { Console.Error.WriteLine("RimWorld browser unavailable: " + error.Message); Environment.ExitCode = 1; } return; }\n            '
    return text.replace('static void Main()', 'static void Main(string[] args)').replace('ServerPrinter.CreateLogger();', info + browser + 'ServerPrinter.CreateLogger();').replace('ServerNetwork.StartFeature();', 'ServerNetwork.StartFeature();\n            RTServer.PlayBound.Bridge.StartSnapshots();')

def extract(archive, target, commit):
    extract_reviewed_source(archive, target, 'Rimworld-Together-' + commit)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise ValueError('RimWorld source redirect refused')

def build(root):
    if os.geteuid() == 0 or root.exists() or not root.is_absolute():
        raise ValueError('RimWorld build requires an unprivileged fresh directory')
    profile = json.loads((HERE / 'rimworldBuild.json').read_text())
    bridge = (HERE / 'rimworld/PlayBoundBridge.cs').read_bytes().replace(b'\r\n', b'\n')
    lock = (HERE / 'rimworldPackages.lock.json').read_bytes().replace(b'\r\n', b'\n')
    if hashlib.sha256(bridge).hexdigest() != profile['bridgeSha256'] or hashlib.sha256(lock).hexdigest() != profile['lockSha256']:
        raise ValueError('RimWorld reviewed build assets changed')
    root.mkdir(mode=0o700)
    for name in ['home', 'packages', 'temp', 'publish']: (root / name).mkdir(mode=0o700)
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'HOME': str(root / 'home'), 'DOTNET_CLI_HOME': str(root / 'home'), 'NUGET_PACKAGES': str(root / 'packages'), 'TMPDIR': str(root / 'temp'), 'DOTNET_CLI_TELEMETRY_OPTOUT': '1', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE': '1', 'DOTNET_GENERATE_ASPNET_CERTIFICATE': 'false', 'DOTNET_NOLOGO': '1', 'MSBUILDDISABLENODEREUSE': '1'}
    (root / 'global.json').write_text(json.dumps({'sdk': {'version': profile['sdk'], 'rollForward': 'disable', 'allowPrerelease': False}}))
    sdk = subprocess.run(['/usr/bin/dotnet', '--version'], cwd=root, env=env, capture_output=True, text=True, check=True, timeout=15).stdout.strip()
    if sdk != profile['sdk']: raise ValueError('RimWorld reviewed .NET SDK unavailable')
    archive = root / 'source.tar.gz'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    url = 'https://codeload.github.com/RimWorld-Together/Rimworld-Together/tar.gz/' + profile['commit']
    with opener.open(url, timeout=90) as response, archive.open('xb') as output:
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > profile['sourceBytes']: raise ValueError('RimWorld source exceeds reviewed size')
            output.write(chunk)
    if archive.stat().st_size != profile['sourceBytes'] or digest(archive).hex() != profile['sourceSha256']:
        raise ValueError('RimWorld source checksum mismatch')
    source = root / 'source'; extract(archive, source, profile['commit'])
    project = source / 'Source/Server'; program = project / 'Core/Program.cs'
    program.write_text(patch_program(program.read_text(), profile['commit'], profile['version']))
    (project / 'PlayBoundBridge.cs').write_bytes(bridge)
    (project / 'packages.lock.json').write_bytes(lock)
    if digest(source / 'LICENSE').hex() != profile['licenseSha256']:
        raise ValueError('RimWorld license changed')
    config = root / 'NuGet.Config'
    config.write_text('<configuration><packageSources><clear/><add key="nuget.org" value="https://api.nuget.org/v3/index.json" /></packageSources></configuration>')
    flags = ['-r', 'linux-x64', '-p:RuntimeIdentifiers=linux-x64', '-p:RuntimeFrameworkVersion=' + profile['runtime'], '-p:PublishSingleFile=true', '-p:IncludeNativeLibrariesForSelfExtract=true', '-p:SelfContained=true']
    subprocess.run(['/usr/bin/dotnet', 'restore', str(project / 'RTServer.csproj'), '--locked-mode', '--configfile', str(config), *flags], cwd=root, env=env, check=True, timeout=360)
    actual = {}
    for package in (root / 'packages').glob('*/*/*.nupkg'):
        identity = '/'.join(package.relative_to(root / 'packages').parts[:2])
        actual[identity] = base64.b64encode(digest(package, 'sha512')).decode()
    if actual != profile['packages']:
        raise ValueError('RimWorld NuGet blobs differ from reviewed dependencies')
    subprocess.run(['/usr/bin/dotnet', 'publish', str(project / 'RTServer.csproj'), '--no-restore', '-c', 'Release', *flags, '-p:DebugType=None', '-p:DebugSymbols=false', '-p:Deterministic=true', '-p:PathMap=' + str(source) + '=/_/rimworld', '-p:BuildInParallel=false', '-p:UseSharedCompilation=false', '-m:1', '-o', str(root / 'publish')], cwd=root, env=env, check=True, timeout=360)
    binary = root / 'publish/RTServer'
    if binary.stat().st_size != profile['binary']['bytes'] or digest(binary).hex() != profile['binary']['sha256']:
        raise ValueError('RimWorld output differs from reviewed build')
    expected = 'PLAYBOUND_RIMWORLD_SOURCE ' + profile['commit'] + ' ' + profile['version']
    result = subprocess.run([str(binary), '--playbound-runtime-info'], cwd=root / 'home', env=env, capture_output=True, text=True, check=True, timeout=15)
    if result.stdout.strip() != expected: raise ValueError('RimWorld offline runtime check failed')
    shutil.copyfile(source / 'LICENSE', root / 'publish/UPSTREAM-LICENSE')
    print(json.dumps({'version': profile['version'], 'reviewedBuild': True}))

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2: raise ValueError('RimWorld fresh build directory required')
        build(Path(sys.argv[1]))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else 'RimWorld reviewed source build failed', file=sys.stderr)
        sys.exit(1)
