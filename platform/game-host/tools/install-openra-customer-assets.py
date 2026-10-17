#!/usr/bin/python3 -I
"""Operator-only pinned publication of seven distinct OpenRA engine families.
No runtime enrollment, service restart or caller-selected URL/path is accepted.
"""
import importlib.machinery
import json
import os
from pathlib import Path
import stat
import sys

if __name__=='__main__':
    if len(sys.argv)!=1 or os.getuid()!=0 or os.geteuid()!=0 or os.environ.get('SUDO_USER'):
        raise SystemExit('Direct root operator required; no arguments accepted')
    here=Path(__file__).resolve().parent
    helper=here/'install-xonotic-customer-assets.py';info=helper.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=1 or info.st_mode&0o022:
        raise SystemExit('Untrusted asset publisher')
    profile=here.parent/'customerOpenRaAssets.json'
    if not profile.is_file():profile=here/'customerOpenRaAssets.json'
    module=importlib.machinery.SourceFileLoader('publisher',str(helper)).load_module()
    profiles=json.loads(profile.read_text())
    if set(profiles)!=set(module.OPENRA_BINARIES):raise SystemExit('Incomplete OpenRA family review')
    for game,binary in module.OPENRA_BINARIES.items():
        if profiles[game]['binary']!=binary:raise SystemExit('OpenRA engine contract differs')
        result=module.promote(Path('/opt/playbound-host/games')/game,
            Path('/usr/local/libexec/playbound-isolated-'+game+'-data-v1'),profiles[game],game)
        print(json.dumps({'game':game,**result}))
