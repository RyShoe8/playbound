"""Retain a root-owned, reviewed immutable asset directory for namespace bind."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

OPENRA_BINARIES = {'openra':'OpenRA.Server','openhv':'OpenHV.Server','combined-arms':'OpenRA.Server','earth-2140-trilogy':'OpenE2140','romanovs-vengeance':'OpenRA.Server','tiberian-dawn-hd':'OpenRA.Server','crystallized-nexus':'OpenRA.Server'}

SOURCE_EMPTY_DIRS = {'counter-strike-source':('cstrike/cfg','cstrike/logs'), 'team-fortress-2': ('tf/cfg','tf/logs'), 'counter-strike-2': ('game/csgo/cfg','game/csgo/logs')}
ROOT = Path('/usr/local/libexec/playbound-isolated-xonotic-data-086')


def open_assets(root=None, game='xonotic'):
    if game not in OPENRA_BINARIES and game not in ('xonotic','wolfenstein-enemy-territory','medal-of-honor-allied-assault','freeciv','warzone-2100','bombsquad','bombsquad-python','terraria','factorio','unvanquished','rimworld-together','space-station-14','triplea','necesse','veloren','barotrauma','dont-starve-together','morrowind','team-fortress-2','counter-strike-2','trackmania','unturned','counter-strike-source','open-fortress','battlefield-1942-anthology','core-keeper','re-volt-rvgl','aneurism-iv'):raise ValueError('Unsupported immutable asset family')
    if root is None and game in OPENRA_BINARIES:
        root=Path('/usr/local/libexec/playbound-isolated-'+game+'-data-v1')
    if root is None:
        root=Path({'xonotic':str(ROOT),
                   'wolfenstein-enemy-territory':'/usr/local/libexec/playbound-isolated-etlegacy-data-285',
                   'medal-of-honor-allied-assault':'/usr/local/libexec/playbound-isolated-openmohaa-data-v1',
                   'freeciv':'/usr/local/libexec/playbound-isolated-freeciv-data-v1',
                   'warzone-2100':'/usr/local/libexec/playbound-isolated-warzone-data-v1',
                   'bombsquad':'/usr/local/libexec/playbound-isolated-bombsquad-data-v1',
                   'bombsquad-python':'/usr/local/libexec/playbound-isolated-bombsquad-python-v1',
                   'dont-starve-together':'/usr/local/libexec/playbound-isolated-dst-data-v1',
                   're-volt-rvgl':'/usr/local/libexec/playbound-isolated-rvgl-data-v1',
                   'aneurism-iv':'/usr/local/libexec/playbound-isolated-aniv-data-v1',
                   'core-keeper':'/usr/local/libexec/playbound-isolated-corekeeper-data-v1',
                   'battlefield-1942-anthology':'/usr/local/libexec/playbound-isolated-battlefield-data-v1',
                   'open-fortress':'/usr/local/libexec/playbound-isolated-openfortress-data-v1',
                   'counter-strike-source':'/usr/local/libexec/playbound-isolated-css-data-v1',
                   'team-fortress-2':'/usr/local/libexec/playbound-isolated-tf2-data-v1',
                   'counter-strike-2':'/usr/local/libexec/playbound-isolated-cs2-data-v1',
                   'unturned':'/usr/local/libexec/playbound-isolated-unturned-data-v1',
                   'trackmania':'/usr/local/libexec/playbound-isolated-trackmania-data-v1',
                   'morrowind':'/usr/local/libexec/playbound-isolated-morrowind-data-v1',
                   'barotrauma':'/usr/local/libexec/playbound-isolated-barotrauma-data-v1',
                   'veloren':'/usr/local/libexec/playbound-isolated-veloren-data-v1',
                   'necesse':'/usr/local/libexec/playbound-isolated-necesse-data-v1',
                   'triplea':'/usr/local/libexec/playbound-isolated-triplea-data-v1',
                   'space-station-14':'/usr/local/libexec/playbound-isolated-ss14-data-v1',
                   'rimworld-together':'/usr/local/libexec/playbound-isolated-rimworld-data-v1',
                   'unvanquished':'/usr/local/libexec/playbound-isolated-unvanquished-data-0562',
                   'factorio':'/usr/local/libexec/playbound-isolated-factorio-data-v1',
                   'terraria':'/usr/local/libexec/playbound-isolated-terraria-data-1458'}[game])
    pattern=r'[A-Za-z0-9_-]{1,100}\.pk3' if game=='xonotic' else r'(?:etmain|legacy)/[A-Za-z0-9_.-]{1,100}\.(?:pk3|so)' if game=='wolfenstein-enemy-territory' else r'(?:main/[A-Za-z0-9_.-]{1,100}\.pk3|game\.so)'
    if game=='freeciv':
        if root is None: raise ValueError('Missing fixed Freeciv asset root')
        pattern=r'(?:lib|share/freeciv)/(?:[A-Za-z0-9_+.,@ -]{1,100}/){0,15}[A-Za-z0-9_+.,@ -]{1,100}'
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
    parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for component in root.parts[1:]:
            child=os.open(component,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            info=os.fstat(child)
            if info.st_uid!=0 or info.st_mode&0o022:
                os.close(child);raise ValueError('Untrusted asset directory')
            os.close(parent);parent=child
        def read_file(name,maximum):
            directory=os.dup(parent)
            try:
                parts=name.split('/')
                for part in parts[:-1]:
                    child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
                    info=os.fstat(child)
                    if info.st_uid!=0 or info.st_mode&0o222:
                        os.close(child);raise ValueError('Untrusted immutable asset subdirectory')
                    os.close(directory);directory=child
                descriptor=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
            finally:os.close(directory)
            with os.fdopen(descriptor,'rb') as source:
                before=os.fstat(source.fileno())
                if not stat.S_ISREG(before.st_mode) or before.st_uid!=0 or before.st_nlink!=1 or before.st_mode&0o7222 or before.st_size>maximum:
                    raise ValueError('Untrusted immutable asset')
                digest=hashlib.sha256();content=b''
                while True:
                    block=source.read(1024**2)
                    if not block:break
                    digest.update(block)
                    if name=='profile.json':content+=block
                after=os.fstat(source.fileno())
                if (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('Asset changed')
                return before.st_size,digest.hexdigest(),content
        _,_,content=read_file('profile.json',8*1024*1024 if game=='open-fortress' else 4*1024*1024 if game in ('veloren','dont-starve-together','unturned') else 1024*1024 if game in ('factorio','openra','space-station-14','barotrauma','morrowind','team-fortress-2','counter-strike-2','trackmania','unturned','counter-strike-source','open-fortress','battlefield-1942-anthology','core-keeper','re-volt-rvgl','aneurism-iv') else 512*1024 if game in ('freeciv','warzone-2100','bombsquad','bombsquad-python') else 32768)
        rows=json.loads(content)['files']
        if not isinstance(rows,list) or not 1<=len(rows)<=(32768 if game=='open-fortress' else 16384 if game in ('veloren','dont-starve-together','unturned') else 128 if game in ('battlefield-1942-anthology','aneurism-iv') else 64 if game=='trackmania' else 512 if game=='morrowind' else 256 if game in ('triplea','necesse') else 4096 if game in ('space-station-14','barotrauma','team-fortress-2','counter-strike-2','trackmania','unturned','counter-strike-source','open-fortress','battlefield-1942-anthology','core-keeper','re-volt-rvgl','aneurism-iv') else 1 if game=='rimworld-together' else 4096 if game=='openra' else 1 if game in OPENRA_BINARIES else 128 if game=='unvanquished' else 4096 if game=='factorio' else 2048 if game in ('bombsquad','bombsquad-python') else 1024 if game in ('freeciv','warzone-2100') else 64 if game=='terraria' else 16):raise ValueError('Invalid immutable asset inventory')
        seen={'profile.json'};total=0
        for row in rows:
            name=row.get('path')
            if not isinstance(name,str) or not re.fullmatch(pattern,name) or name in seen or any(part in ('.','..') for part in name.split('/')):raise ValueError('Invalid immutable asset path')
            if game in SOURCE_EMPTY_DIRS and any(part in ('cfg','logs','addons','custom','download','downloads','downloadlists','replays','workshop','steamapps') for part in name.split('/')):raise ValueError('Private Source content cannot enter the public bundle')
            seen.add(name)
            size,digest,_=read_file(name,(1024 if game in SOURCE_EMPTY_DIRS else 768)*1024**2);total+=size
            if total>(80 if game=='counter-strike-2' else 20 if game=='team-fortress-2' else 8 if game=='open-fortress' else 4 if game=='counter-strike-source' else 8 if game=='dont-starve-together' else 2)*1024**3 or size!=row.get('bytes') or digest!=row.get('sha256'):raise ValueError('Immutable assets differ from reviewed pins')
        if game=='core-keeper':
            for name in ('GameInfo.txt','GameID.txt'):
                size,_,_=read_file(name,0)
                if size != 0:raise ValueError('Core Keeper output mountpoint is not empty')
                seen.add(name)
        children={}
        for name in seen:
            parts=name.split('/');prefix=''
            for part in parts:
                children.setdefault(prefix,set()).add(part)
                prefix+=part+'/'
        for empty in ({'unturned':('Servers','Servers/PlayBound'),'battlefield-1942-anthology':('mods/bf1942/settings',)}.get(game) or SOURCE_EMPTY_DIRS.get(game,())):
            parts=empty.split('/');prefix=''
            for part in parts:
                children.setdefault(prefix,set()).add(part);prefix+=part+'/'
            children.setdefault(prefix,set())
        def verify_tree(directory,prefix=''):
            expected=children[prefix]
            if set(os.listdir(directory))!=expected:raise ValueError('Unlisted immutable asset entry')
            for entry in expected:
                nested=prefix+entry+'/'
                if nested not in children:continue
                child=os.open(entry,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
                try:verify_tree(child,nested)
                finally:os.close(child)
        verify_tree(parent)
        result,parent=parent,None
        return result
    finally:
        if parent is not None:os.close(parent)
