#!/usr/bin/python3 -I
"""Direct-root, fixed-source engine promotion. No enrollment or service restart."""
import importlib.machinery
import json
import os
from pathlib import Path
import stat
import sys

if __name__ == '__main__':
    if len(sys.argv) != 1 or os.getuid() != 0 or os.geteuid() != 0 or os.environ.get('SUDO_USER'):
        raise SystemExit('Direct root operator required; no arguments accepted')
    here = Path(__file__).resolve().parent
    profile = here.parent/'customerBombsquadEngine.json'
    if not profile.is_file(): profile = here/'customerBombsquadEngine.json'
    helper = here/'install-flightgear-customer-engine.py'
    info = helper.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1:
        raise SystemExit('Untrusted promotion helper')
    module = importlib.machinery.SourceFileLoader('promotion', str(helper)).load_module()
    manifest = json.loads(profile.read_text())
    normalizer=here/'install-bombsquad-customer-assets.py';info=normalizer.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022 or info.st_nlink!=1:raise SystemExit('Untrusted dependency normalizer')
    normalize=importlib.machinery.SourceFileLoader('normalizer',str(normalizer)).load_module()
    import tempfile
    with tempfile.TemporaryDirectory(prefix='.pb-bombsquad-engine-',dir='/usr/local/libexec') as temporary:
        root=Path(temporary)
        row=dict(manifest['binary'],path='bin/python3.14')
        normalize.normalized_source(Path('/opt/playbound-host/python314'),root,{'files':[row]})
        (root/'bin/python3.14').chmod(0o555)
        print(json.dumps(module.promote(root/'bin/python3.14',Path('/usr/local/libexec/playbound-isolated-bombsquad'),manifest,'bombsquad','python3.14')))
