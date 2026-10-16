"""Assemble the reviewed Windows Source 2007 / GE:S package, unprivileged."""
from pathlib import Path, PurePosixPath
import hashlib,json,os,re,shutil,subprocess,sys

ARCHIVE_SHA='79643189e9d6549e13ed9545d2277cb34bac05fff645d44d9de1f0ab030610d3'
ARCHIVE_BYTES=2186852760
SDK_BUILD='195543'

def listing_entries(text):
    if len(text.encode())>16*1024**2 or '----------\n' not in text:
        raise ValueError('Invalid GoldenEye archive listing')
    entries,seen,total=[],set(),0
    for block in text.split('----------\n',1)[1].strip().split('\n\n'):
        fields={}
        for line in block.splitlines():
            if ' = ' not in line:continue
            key,value=line.split(' = ',1)
            if key in fields:raise ValueError('Duplicate archive metadata')
            fields[key]=value
        name=fields.get('Path','')
        if (not name or '\\' in name or re.search(r'[\x00-\x1f\x7f]',name)
            or any(part in ('','.','..') for part in name.split('/'))
            or not (name=='gesource' or name.startswith('gesource/')) or name in seen
            or any(key in fields for key in ('Symbolic Link','Hard Link')) or fields.get('Encrypted')!='-'):
            raise ValueError('Unsafe GoldenEye archive path')
        attributes=fields.get('Attributes','')
        directory=fields.get('Folder')=='+' or attributes.startswith('D') or 'drwx' in attributes
        if any(token.startswith(('l','b','c','p','s')) and len(token)==10 for token in attributes.split()):
            raise ValueError('Special archive member')
        size=int(fields.get('Size','-1'))
        if not 0<=size<2*1024**3 or (directory and size):raise ValueError('Invalid archive size')
        total+=size;seen.add(name);entries.append((name,size,directory))
        if len(entries)>40000 or total>8*1024**3:raise ValueError('Archive bounds exceeded')
    files={name for name,_,directory in entries if not directory}
    for name,_,_ in entries:
        if any(str(p) in files for p in PurePosixPath(name).parents if str(p)!='.'):
            raise ValueError('Archive file-as-parent collision')
    if not entries:raise ValueError('Empty archive')
    return entries,total

def assemble(sdk,archive,output):
    if os.geteuid()==0:raise ValueError('GoldenEye assembly must be unprivileged')
    sdk,archive,output=map(Path,(sdk,archive,output))
    parent=output.parent
    if (sdk.parent!=parent or sdk.name!='source-sdk' or output.name!='runtime'
        or not re.fullmatch(r'(?:\.pb-update-goldeneye-source-|goldeneye-build-review-)[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}',parent.name)):
        raise ValueError('GoldenEye requires isolated assembly paths')
    for directory in [sdk,parent]:
        if directory.resolve()!=directory or not directory.is_dir():raise ValueError('Unsafe assembly directory')
    if output.exists() or output.is_symlink():raise ValueError('Output must be new')
    if archive.resolve()!=archive or not archive.is_file() or archive.stat().st_nlink!=1 or archive.stat().st_size!=ARCHIVE_BYTES:
        raise ValueError('GoldenEye archive requires review')
    with archive.open('rb') as source:
        if hashlib.file_digest(source,'sha256').hexdigest()!=ARCHIVE_SHA:raise ValueError('GoldenEye checksum mismatch')
    manifest=sdk/'steamapps/appmanifest_310.acf'
    if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size>65536:raise ValueError('Missing SDK manifest')
    text=manifest.read_text()
    for key,value in [('appid','310'),('buildid',SDK_BUILD),('StateFlags','4')]:
        if re.findall(r'"'+key+r'"\s+"([^"]*)"',text,re.I)!=[value]:raise ValueError('Unreviewed Source SDK build')
    if re.search(r'"BetaKey"\s+"[^"\s]+"',text,re.I):raise ValueError('Non-public SDK branch')
    listing=subprocess.check_output(['/usr/bin/7z','l','-slt',str(archive)],timeout=60).decode()
    entries,expanded=listing_entries(listing)
    disk=os.statvfs(parent)
    if disk.f_bavail*disk.f_frsize-expanded<max(8*1024**3,disk.f_blocks*disk.f_frsize//10)+512*1024**2:
        raise ValueError('Insufficient disk for GoldenEye extraction')
    output.mkdir(mode=0o700)
    subprocess.run(['/usr/bin/7z','x','-mmt=1','-y','-bb0',str(archive),'-o'+str(output)],check=True,timeout=600,stdout=subprocess.DEVNULL)
    for name,size,directory in entries:
        member=output/name
        if member.is_symlink() or not member.resolve().is_relative_to(output):raise ValueError('Unsafe extracted path')
        if directory:
            if not member.is_dir():raise ValueError('Changed extracted directory')
        elif not member.is_file() or member.stat().st_nlink!=1 or member.stat().st_size!=size:
            raise ValueError('Changed extracted member')
        member.chmod(0o755 if directory else 0o644)
    for name in ['bin','hl2','platform','sourcetest','srcds.exe','steamclient.dll','vstdlib_s.dll','steam.dll','tier0_s.dll']:
        source=sdk/name
        if not source.exists() or source.resolve()!=source:raise ValueError('Missing SDK member')
        for member in [source,*source.rglob('*')] if source.is_dir() else [source]:
            if member.is_symlink() or not(member.is_file() or member.is_dir()) or (member.is_file() and member.stat().st_nlink!=1):
                raise ValueError('Unsafe SDK member')
        shutil.move(str(source),output/name)
    mod=output/'gesource'
    defaults=output/'defaults';defaults.mkdir()
    shutil.move(str(mod/'cfg'),defaults/'cfg')
    (defaults/'cfg/server.cfg').write_text('// Private PlayBound configuration.\n')
    for name in ['logs','DownloadLists','download','downloads','custom','cache','modelsounds.cache','console.log','console_prev.log']:
        target=mod/name
        if target.is_dir():shutil.rmtree(target)
        elif target.exists():target.unlink()
    # Node graphs are generated during gameplay and belong to each server.
    graphs=mod/'maps/graphs'
    if graphs.exists():shutil.rmtree(graphs)
    for name in ['python/gphashes.txt','python/python.log']:
        target=mod/name
        if target.exists():target.unlink()
    (output/'sdk-build.json').write_text(json.dumps({'appId':310,'buildId':SDK_BUILD,'mod':'5.0.6'},sort_keys=True)+'\n')
    for member in output.rglob('*'):
        if member.is_symlink() or not(member.is_file() or member.is_dir()):raise ValueError('Unsafe assembled member')
        member.chmod(0o755 if member.is_dir() else 0o644)
    print(json.dumps({'assembled':True,'sdkBuild':SDK_BUILD,'mod':'5.0.6'}))

if __name__=='__main__':assemble(*sys.argv[1:])
