#!/usr/bin/python3 -I
"""Direct-root promotion of one reviewed relay; no service or data changes."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile


def promote(source, destination, manifest, game='flightgear', binary_name='fgms'):
    if (game,binary_name) not in [('flightgear','fgms'),('supertuxkart','supertuxkart'),('hurry-curry','hurrycurry-server'),('assaultcube','linux_64_server'),('xonotic','xonotic-linux64-dedicated'),('wolfenstein-enemy-territory','etlded.x86_64'),('medal-of-honor-allied-assault','omohaaded')]:
        raise ValueError('Unknown reviewed engine promotion')
    info=source.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_mode&0o7022:
        raise ValueError('Unsafe relay file')
    descriptor=os.open(source,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(descriptor,'rb') as file:
        actual=os.fstat(file.fileno())
        if (info.st_dev,info.st_ino)!=(actual.st_dev,actual.st_ino) or actual.st_size>64*1024**2:
            raise ValueError('Relay changed before promotion')
        data=file.read()
        after=os.fstat(file.fileno())
        if (actual.st_size,actual.st_mtime_ns,actual.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns):
            raise ValueError('Relay changed during promotion')
    digest=hashlib.sha256(data).hexdigest()
    if not any(value['bytes']==len(data) and value['sha256']==digest for value in [manifest['binary'],manifest['legacyBinary']]):
        raise ValueError('Relay differs from reviewed builds')
    destination.mkdir(mode=0o755,exist_ok=True)
    info=destination.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:
        raise ValueError('Unsafe relay destination')
    # The old sealed descriptor remains valid for a running server. No process
    # is stopped and no agent endpoint can invoke this operator-only tool.
    for name,content,mode in [(binary_name,data,0o555),('profile.json',json.dumps({game:{'binaryBytes':len(data),'binarySha256':digest,'version':manifest['version']}}).encode(),0o644)]:
        fd,temporary=tempfile.mkstemp(prefix='.promote-',dir=destination)
        try:
            with os.fdopen(fd,'wb') as output:
                output.write(content);output.flush();os.fchmod(output.fileno(),mode);os.fsync(output.fileno())
            os.replace(temporary,destination/name)
        finally:
            Path(temporary).unlink(missing_ok=True)
    directory=os.open(destination,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(directory)
    finally:os.close(directory)
    return {'gameSlug':game,'bytes':len(data),'sha256':digest,'changedProcesses':0}


if __name__=='__main__':
    if len(sys.argv)!=1 or os.getuid()!=0 or os.geteuid()!=0 or os.environ.get('SUDO_USER'):
        raise SystemExit('Direct root operator required; no arguments accepted')
    profile=Path(__file__).resolve().parent.parent/'fgmsBuild.json'
    if not profile.is_file():profile=Path(__file__).resolve().parent/'fgmsBuild.json'
    print(json.dumps(promote(Path('/opt/playbound-host/games/flightgear/fgms'),Path('/usr/local/libexec/playbound-isolated-flightgear'),json.loads(profile.read_text()))))
