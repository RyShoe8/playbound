#!/usr/bin/python3 -I
"""Operator-only atomic publication of the fixed reviewed Xonotic assets."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat

OPENRA_BINARIES = {'openra':'OpenRA.Server','openhv':'OpenHV.Server','combined-arms':'OpenRA.Server','earth-2140-trilogy':'OpenE2140','romanovs-vengeance':'OpenRA.Server','tiberian-dawn-hd':'OpenRA.Server','crystallized-nexus':'OpenRA.Server'}
SOURCE_EMPTY_DIRS = {'counter-strike-source':('cstrike/cfg','cstrike/logs'), 'team-fortress-2': ('tf/cfg','tf/logs'), 'counter-strike-2': ('game/csgo/cfg','game/csgo/logs')}
import sys
import tempfile


def promote(source, destination, manifest, game='xonotic'):
    if game not in OPENRA_BINARIES and game not in ('xonotic','wolfenstein-enemy-territory','medal-of-honor-allied-assault','freeciv','warzone-2100','bombsquad','bombsquad-python','terraria','factorio','unvanquished','rimworld-together','space-station-14','triplea','necesse','veloren','barotrauma','dont-starve-together','morrowind','team-fortress-2','counter-strike-2','trackmania','unturned','counter-strike-source','open-fortress','battlefield-1942-anthology','core-keeper','re-volt-rvgl','aneurism-iv'): raise ValueError('Unsupported asset publication')
    pattern=r'[A-Za-z0-9_-]{1,100}\.pk3' if game=='xonotic' else r'(?:etmain|legacy)/[A-Za-z0-9_.-]{1,100}\.(?:pk3|so)' if game=='wolfenstein-enemy-territory' else r'(?:main/[A-Za-z0-9_.-]{1,100}\.pk3|game\.so)'
    if game=='freeciv': pattern=r'(?:lib|share/freeciv)/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}'
    if game=='warzone-2100':pattern=r'data/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}'
    if game=='bombsquad':pattern=r'(?:bombsquad_server|dist/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100})'
    if game=='bombsquad-python':pattern=r'lib/(?:libpython3\.14\.so\.1\.0|python3\.14/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100})'
    if game in OPENRA_BINARIES:pattern=(r'(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100}' if game=='openra' else re.escape(OPENRA_BINARIES[game]))
    if game=='dont-starve-together':pattern=r'(?:bin64|data|linux64)/(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100}'
    if game in SOURCE_EMPTY_DIRS:pattern=r'(?:srcds_linux|srcds_linux64|steam_appid\.txt|(?:bin|hl2|linux64|platform|tf|game|cstrike)/(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100})'
    if game=='unturned':pattern=r"(?:Unturned_Headless\.x86_64|UnityPlayer\.so|steamclient\.so|libsteamwebrtc\.so|steam_appid\.txt|EconInfo\.bin|(?:BattlEye|Bundles|Content|CuratedMapIcons|LoadingScreens|Localization|Maps|Modules|Sandbox|Unturned_Headless_Data|linux64)/(?:[A-Za-z0-9_+.,@ ()!&'-]{1,120}/){0,15}[A-Za-z0-9_+.,@ ()!&'-]{1,120})"
    if game=='re-volt-rvgl':pattern=r'(?:rvgl\.64|gamecontrollerdb\.txt|(?:cars|cups|gallery|gfx|icons|levels|lib|licenses|models|packs|redbook|shaders|strings|wavs)/(?:[A-Za-z0-9_+.,@ ()-]{1,120}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,120})'
    if game=='aneurism-iv':pattern=r'(?:GameAssembly\.so|UnityPlayer\.so|aniv_server\.x86_64|libsteamwebrtc\.so|steam_appid\.txt|steamclient\.so|(?:aniv_server_Data|linux64)/(?:[A-Za-z0-9_+.,@ ()-]{1,120}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,120})'
    if game=='core-keeper':pattern=r'(?:CoreKeeperServer|UnityPlayer\.so|steamclient\.so|libsteamwebrtc\.so|libdecor-0\.so\.0|libdecor-cairo\.so|(?:CoreKeeperServer_Data|linux64|localization)/(?:[A-Za-z0-9_+.,@ ()-]{1,120}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,120})'
    if game=='battlefield-1942-anthology':pattern=r'(?:bf1942_lnxded\.static|bf1942_lnxded|settings-seed/(?:[A-Za-z0-9_.-]{1,100}/){0,3}[A-Za-z0-9_.-]{1,100}|mods/bf1942/(?!settings/)(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100})'
    if game=='open-fortress':pattern=r'(?:open_fortress/materials/(?:[A-Za-z0-9_+.,@ ()!&~{-]{1,120}/){0,15}[A-Za-z0-9_+.,@ ()!&~{-]{1,120}|srcds_linux|sdk-build\.json|(?:bin|hl2|platform|open_fortress|defaults)/(?:[A-Za-z0-9_+.,@ ()!&-]{1,120}/){0,15}[A-Za-z0-9_+.,@ ()!&-]{1,120})'
    if game=='trackmania':pattern=r'(?:TrackmaniaServer|Packs/[A-Za-z0-9_+.-]{1,100}\.(?:pak|Gbx)|UserData/Maps/(?:Campaigns/Training|MatchSettings)/[A-Za-z0-9_ .-]{1,100}|UserData/Config/dedicated_cfg\.default\.txt)'
    if game=='morrowind':pattern=r'(?:tes3mp-server\.x86_64|tes3mp-server-default\.cfg|lib/libboost_[A-Za-z0-9_]+\.so\.1\.67\.0|server/data/requiredDataFiles\.json|(?:resources|server/scripts|server/lib/lua)/(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100})'
    if game=='barotrauma':pattern=r'(?:DedicatedServer|[A-Za-z0-9_+.-]{1,100}\.(?:dll|so|pdb|exe|dylib|deps\.json|runtimeconfig\.json)|[A-Za-z0-9_+.-]{1,100}_LICENSE|hintmanager\.xml|Facepunch\.Steamworks\.Posix64\.xml|Icon\.ico|changelog\.txt|daedalic_privacypolicy\.txt|(?:Content|linux64)/(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100})'
    if game=='veloren':pattern=r'(?:veloren-server-cli|assets/(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100})'
    if game=='necesse':pattern=r'(?:Server\.jar|jre/bin/java|(?:jre/lib|jre/conf|lib|locale|linux64)/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100})'
    if game=='triplea':pattern=r'(?:games/triplea/bin/game-headless\.jar|jre/temurin-25/(?:bin/java|(?:lib|conf)/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}))'
    if game=='space-station-14':pattern=r'(?:Robust\.Server|build\.json|[A-Za-z0-9_+.-]{1,100}\.(?:dll|so|pdb|deps\.json|runtimeconfig\.json)|(?:Resources|runtimes)/(?:[A-Za-z0-9_+.,@ ()-]{1,100}/){0,15}[A-Za-z0-9_+.,@ ()-]{1,100})'
    if game=='rimworld-together':pattern=r'RTServer'
    if game=='unvanquished':pattern=r'(?:daemonded|nacl_loader|nacl_helper_bootstrap|irt_core-amd64\.nexe|pkg/[A-Za-z0-9_.-]{1,100}\.dpk)'
    if game=='factorio':pattern=r'(?:bin/x64/factorio|data/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100})'
    if game=='terraria':pattern=r'(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,3}[A-Za-z0-9_+.,@ -]{1,100}'
    rows = manifest.get('files')
    if not isinstance(rows,list) or not 1 <= len(rows) <= (32768 if game=='open-fortress' else 16384 if game in ('veloren','dont-starve-together','unturned') else 128 if game in ('battlefield-1942-anthology','aneurism-iv') else 64 if game=='trackmania' else 512 if game=='morrowind' else 256 if game in ('triplea','necesse') else 4096 if game in ('space-station-14','barotrauma','team-fortress-2','counter-strike-2','trackmania','unturned','counter-strike-source','open-fortress','battlefield-1942-anthology','core-keeper','re-volt-rvgl','aneurism-iv') else 1 if game=='rimworld-together' else 4096 if game=='openra' else 1 if game in OPENRA_BINARIES else 128 if game=='unvanquished' else 4096 if game=='factorio' else 2048 if game in ('bombsquad','bombsquad-python') else 1024 if game in ('freeciv','warzone-2100') else 64 if game=='terraria' else 16):
        raise ValueError('Invalid Xonotic asset inventory')
    seen,total = set(),0
    for row in rows:
        if not isinstance(row,dict) or not re.fullmatch(pattern,str(row.get('path'))) or row['path'] in seen or any(part in ('.','..') for part in row['path'].split('/')):
            raise ValueError('Invalid Xonotic asset path')
        if game in SOURCE_EMPTY_DIRS and any(part in ('cfg','logs','addons','custom','download','downloads','downloadlists','replays','workshop','steamapps') for part in row['path'].split('/')):raise ValueError('Private Source content cannot enter the public bundle')
        seen.add(row['path'])
        if type(row.get('bytes')) is not int or not (0 if (game=='re-volt-rvgl' and row['path'] in ('levels/frontend/box05.prm', 'levels/market1/fabric_01.ncp', 'levels/market1/fabric_01.prm', 'levels/nhood1/tree1.ncp', 'levels/nhood1/tree1_w.prm', 'levels/nhood1_battle/tree1_w.prm', 'levels/wild_west2/pennant.ncp')) or game in ('bombsquad','bombsquad-python') or (game=='open-fortress' and row['path']=='open_fortress/maps/dm_boxy_english.txt') or (game=='open-fortress' and row['path'].startswith('defaults/cfg/') and row['path'].endswith('.cfg')) or (game=='unturned' and row['path'].startswith('Bundles/Items/') and row['path'].endswith('/English.dat')) or (game=='veloren' and row['path'].startswith('assets/voxygen/i18n/') and row['path'].endswith('.ftl')) or (game=='space-station-14' and row['path'] in ('Resources/ConfigPresets/Build/debug.toml','Resources/Prototypes/Entities/Objects/Weapons/Guns/Projectiles/projectiles.yml','Resources/Prototypes/Procedural/salvage_misc.yml')) else 1) <= row['bytes'] <= (1024 if game in SOURCE_EMPTY_DIRS else 768)*1024**2 or not re.fullmatch(r'[a-f0-9]{64}',str(row.get('sha256'))):
            raise ValueError('Invalid Xonotic asset pin')
        total += row['bytes']
    if total > (80 if game=='counter-strike-2' else 20 if game=='team-fortress-2' else 8 if game=='open-fortress' else 4 if game=='counter-strike-source' else 8 if game=='dont-starve-together' else 2)*1024**3: raise ValueError('Asset size limit exceeded')
    info=destination.parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:
        raise ValueError('Untrusted asset publication parent')
    if destination.exists() or destination.is_symlink():
        raise ValueError('Existing asset publication requires explicit operator version review')
    if shutil.disk_usage(destination.parent).free < total+(max(8*1024**3,total//4) if game in SOURCE_EMPTY_DIRS else 2*1024**3):
        raise ValueError('Insufficient disk space for isolated game assets')
    # Retain no-follow descriptors all the way from the filesystem root.
    def open_file(path):
        directory=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
        try:
            for part in path.parts[1:-1]:
                child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
                os.close(directory);directory=child
            return os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
        finally:os.close(directory)
    temporary=Path(tempfile.mkdtemp(prefix='.pb-xonotic-assets-',dir=destination.parent))
    try:
        os.chmod(temporary,0o755)
        for row in rows:
            # Flatten this single reviewed upstream alias from its pinned target.
            # Never follow a source symlink or accept a caller-selected mapping.
            source_name = 'lib/lib64/libunistring.so.2' if game=='re-volt-rvgl' and row['path']=='lib/libunistring.so.2' else 'bf1942_lnxded.static' if game=='battlefield-1942-anthology' and row['path']=='bf1942_lnxded' else 'mods/bf1942/settings/'+row['path'][len('settings-seed/'):] if game=='battlefield-1942-anthology' and row['path'].startswith('settings-seed/') else '/opt/playbound-host/games/trackmania/'+row['path'] if game=='trackmania' and row['path'].startswith('UserData/') else row['path']
            with os.fdopen(open_file(source/source_name),'rb') as original:
                before=os.fstat(original.fileno())
                if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_mode&0o7022 or before.st_size!=row['bytes']:
                    raise ValueError('Unsafe Xonotic asset source')
                digest=hashlib.sha256();remaining=row['bytes']
                target=temporary/row['path']
                target.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
                with target.open('xb') as output:
                    while remaining:
                        block=original.read(min(1024**2,remaining))
                        if not block:raise ValueError('Incomplete Xonotic asset')
                        digest.update(block);output.write(block);remaining-=len(block)
                    output.flush();os.fchmod(output.fileno(),0o555 if (game=='aneurism-iv' and row['path']=='aniv_server.x86_64') or (game=='re-volt-rvgl' and row['path']=='rvgl.64') or (game=='core-keeper' and row['path']=='CoreKeeperServer') or (game=='bombsquad' and row['path']=='dist/bombsquad_headless') or (game=='terraria' and row['path']=='TerrariaServer.bin.x86_64') or (game=='factorio' and row['path']=='bin/x64/factorio') or (game=='rimworld-together' and row['path']=='RTServer') or (game=='triplea' and row['path'] in ('jre/temurin-25/bin/java','jre/temurin-25/lib/jspawnhelper')) or (game=='necesse' and row['path'] in ('jre/bin/java','jre/lib/jspawnhelper')) or (game=='veloren' and row['path']=='veloren-server-cli') or (game=='barotrauma' and row['path']=='DedicatedServer') or (game=='team-fortress-2' and row['path']=='srcds_linux64') or (game in ('counter-strike-source','open-fortress','battlefield-1942-anthology') and row['path']=='srcds_linux') or (game=='counter-strike-2' and row['path']=='game/bin/linuxsteamrt64/cs2') or (game=='morrowind' and row['path']=='tes3mp-server.x86_64') or (game=='trackmania' and row['path']=='TrackmaniaServer') or (game=='battlefield-1942-anthology' and row['path'] in ('bf1942_lnxded.static','bf1942_lnxded')) or (game=='unturned' and row['path']=='Unturned_Headless.x86_64') or (game=='dont-starve-together' and row['path']=='bin64/dontstarve_dedicated_server_nullrenderer_x64') or (game=='space-station-14' and row['path']=='Robust.Server') or (game in OPENRA_BINARIES and row['path']==OPENRA_BINARIES[game]) or (game=='unvanquished' and row['path'] in ('daemonded','nacl_loader','nacl_helper_bootstrap')) else 0o444);os.fsync(output.fileno())
                after=os.fstat(original.fileno())
                if original.read(1) or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) or digest.hexdigest()!=row['sha256']:
                    raise ValueError('Xonotic assets differ from reviewed pins')
        for empty in ({'unturned':('Servers','Servers/PlayBound'),'battlefield-1942-anthology':('mods/bf1942/settings',)}.get(game) or SOURCE_EMPTY_DIRS.get(game,())):(temporary/empty).mkdir(mode=0o755,parents=True,exist_ok=True)
        if game=='core-keeper':
            for name in ('GameInfo.txt','GameID.txt'):
                with (temporary/name).open('xb') as output:
                    os.fchmod(output.fileno(),0o444);os.fsync(output.fileno())
        record=temporary/'profile.json'
        with record.open('x') as output:
            json.dump(manifest,output);output.flush();os.fchmod(output.fileno(),0o444);os.fsync(output.fileno())
        for directory,_,_ in os.walk(temporary,topdown=False):os.chmod(directory,0o555)
        os.rename(temporary,destination)
        directory=os.open(destination.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(directory)
        finally:os.close(directory)
        return {'files':len(rows),'bytes':total,'changedProcesses':0}
    finally:
        if temporary.exists():shutil.rmtree(temporary)


if __name__=='__main__':
    if len(sys.argv)!=1 or os.getuid()!=0 or os.geteuid()!=0 or os.environ.get('SUDO_USER'):
        raise SystemExit('Direct root operator required; no arguments accepted')
    here=Path(__file__).resolve().parent
    profile=here.parent/'customerXonoticAssets.json'
    if not profile.is_file():profile=here/'customerXonoticAssets.json'
    print(json.dumps(promote(Path('/opt/playbound-host/games/xonotic/data'),
        Path('/usr/local/libexec/playbound-isolated-xonotic-data-086'),json.loads(profile.read_text()))))
