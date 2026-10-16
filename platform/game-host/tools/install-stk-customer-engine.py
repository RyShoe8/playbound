#!/usr/bin/python3 -I
"""Operator-only promotion; ordinary SuperTuxKart installs remain unchanged."""
import hashlib
import importlib.machinery
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

if __name__=='__main__':
    if len(sys.argv)!=1 or os.getuid()!=0 or os.geteuid()!=0 or os.environ.get('SUDO_USER'):
        raise SystemExit('Direct root operator required; no arguments accepted')
    here=Path(__file__).resolve().parent
    profile=here.parent/'stkIsolatedBuild.json'
    if not profile.is_file():profile=here/'stkIsolatedBuild.json'
    manifest=json.loads(profile.read_text())
    root=Path('/opt/playbound-host/staging/stk-isolation-build-1.4')
    # Git may consult repository configuration. Run it as the build user, never
    # as root, and compare only bounded commit/diff output to the reviewed pin.
    command=['/usr/sbin/runuser','-u','playbound','--','/usr/bin/git','-C',str(root/'source')]
    options={'timeout':10,'env':{'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}}
    revision=subprocess.check_output([*command,'rev-parse','HEAD'],**options).decode().strip()
    difference=subprocess.check_output([*command,'diff','--no-ext-diff','--binary'],**options)
    if revision!=manifest['commit'] or len(difference)>16384 or hashlib.sha256(difference).hexdigest()!=manifest['sourceDiffSha256']:
        raise SystemExit('Source revision or isolated networking patch differs from review')
    helper=here/'install-flightgear-customer-engine.py';info=helper.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022 or info.st_nlink!=1:
        raise SystemExit('Untrusted promotion helper')
    module=importlib.machinery.SourceFileLoader('promotion',str(helper)).load_module()
    print(json.dumps(module.promote(root/'build/bin/supertuxkart',Path('/usr/local/libexec/playbound-isolated-stk'),manifest,'supertuxkart','supertuxkart')))
