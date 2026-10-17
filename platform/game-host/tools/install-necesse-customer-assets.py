#!/usr/bin/python3 -I
"""Direct-root publication of the fixed Necesse engine data boundary."""
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
    profile=here.parent/'customerNecesseAssets.json'
    if not profile.is_file():profile=here/'customerNecesseAssets.json'
    module=importlib.machinery.SourceFileLoader('publisher',str(helper)).load_module()
    print(json.dumps(module.promote(Path('/opt/playbound-host/games/necesse'),
        Path('/usr/local/libexec/playbound-isolated-necesse-data-v1'),json.loads(profile.read_text()),'necesse')))
