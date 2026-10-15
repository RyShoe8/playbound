#!/usr/bin/python3
"""Fixed unprivileged Freeciv/Hurry Curry builds; no Docker or root worker access."""
import hashlib,json,os,pathlib,resource,shutil,subprocess,sys,tarfile,urllib.request
from reviewedSourceArchive import extract_reviewed_source
from reproducibleFreeciv import prepare_generator
HERE=pathlib.Path(__file__).resolve().parent

class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('Reviewed source redirect refused')

def digest(file):
 with file.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def build(root,key):
 if key not in ('freeciv','hurry-curry') or os.geteuid()==0 or not root.is_absolute() or root.exists() or root.is_symlink():raise ValueError('Fresh unprivileged reviewed build required')
 profile=json.loads((HERE/'sourceRuntimeBuilds.json').read_text())[key]
 cores=sorted(os.sched_getaffinity(0));os.sched_setaffinity(0,{cores[1 if key=='hurry-curry' and len(cores)>1 else 0]});resource.setrlimit(resource.RLIMIT_AS,(3*1024**3,3*1024**3))
 root.mkdir(mode=0o700);home=root/'home';home.mkdir();source=root/'source'
 env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':str(home),'SOURCE_DATE_EPOCH':str(profile['sourceDateEpoch'])}
 if subprocess.check_output(['/usr/bin/gcc','-dumpfullversion'],env=env,text=True,timeout=10).strip()!=profile['compiler']:raise ValueError('Reviewed compiler is unavailable')
 archive=root/'source.archive';opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
 with opener.open(urllib.request.Request(profile['url'],headers={'User-Agent':'Mozilla/5.0'}),timeout=90) as response,archive.open('xb') as output:
  size=0
  while block:=response.read(1024**2):
   size+=len(block)
   if size>profile['sourceBytes']:raise ValueError('Source exceeds reviewed size')
   output.write(block)
 if archive.stat().st_size!=profile['sourceBytes'] or digest(archive)!=profile['sourceSha256']:raise ValueError('Source checksum mismatch')
 if key=='hurry-curry':
  normalized=root/'normalized.tar.gz';skipped=0;total=0
  with tarfile.open(archive) as reader,tarfile.open(normalized,'w:gz',compresslevel=1) as writer:
   for number,entry in enumerate(reader):
    if number>10000:raise ValueError('Too many source entries')
    if entry.name=='hurrycurry/client/locale' and entry.issym() and entry.linkname=='../locale':skipped+=1;continue
    if not entry.isdir() and not entry.isfile():raise ValueError('Unreviewed source link')
    total+=entry.size
    if entry.size<0 or entry.size>16*1024**2 or total>64*1024**2:raise ValueError('Oversized source entry')
    writer.addfile(entry,reader.extractfile(entry) if entry.isfile() else None)
  if skipped!=1:raise ValueError('Reviewed client-only link changed')
  archive=normalized
 extract_reviewed_source(archive,source,profile['prefix'],max_files=30000,max_bytes=512*1024**2,max_entry=32*1024**2)
 def run(args,timeout=1800):
  with (root/'build.log').open('ab') as log:
   result=subprocess.run(args,cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=timeout)
  if result.returncode:raise ValueError('Reviewed source command failed; current installation preserved')
 publish=root/'publish';publish.mkdir()
 if key=='freeciv':
  prepare_generator(source)
  if subprocess.check_output(['/usr/bin/meson','--version'],text=True,timeout=10).strip()!=profile['meson']:raise ValueError('Reviewed Meson is unavailable')
  flags='-O2 -g0 -ffile-prefix-map='+str(root)+'=/_/freeciv -fdebug-prefix-map='+str(root)+'=/_/freeciv'
  env.update(CFLAGS=flags,CXXFLAGS=flags,DESTDIR=str(root/'dest'))
  prefix='/opt/playbound-host/games/freeciv/runtime'
  run(['/usr/bin/meson','setup',str(root/'build'),str(source),'--prefix='+prefix,'--libdir=lib','-Dclients=[]','-Dfcmp=[]','-Daudio=none','-Dtools=[]','-Dserver=enabled'],120)
  run(['/usr/bin/meson','compile','-C',str(root/'build'),'-j','1'])
  run(['/usr/bin/meson','install','-C',str(root/'build'),'--no-rebuild'],120)
  package=publish/'runtime';package.mkdir();installed=root/'dest'/prefix.removeprefix('/')
  for name in ['bin','lib','share']:shutil.copytree(installed/name,package/name,symlinks=True)
 else:
  if digest(source/'Cargo.lock')!=profile['lockSha256']:raise ValueError('Cargo lock changed')
  patch=HERE/'assets/hurry-curry-player-limit.patch'
  if digest(patch)!=profile['patchSha256']:raise ValueError('Player-limit patch changed')
  toolchain=pathlib.Path('/opt/playbound-host/toolchains/rust-1.98.0')
  for name,expected in profile['toolchain'].items():
   filename=toolchain/'bin'/name;info=filename.lstat()
   if filename.is_symlink() or info.st_uid!=0 or info.st_mode&0o7022 or digest(filename)!=expected['sha256']:raise ValueError('Reviewed Rust toolchain unavailable')
  env.update(RUSTC=str(toolchain/'bin/rustc'),CARGO_HOME=str(source/'.cargo'),RUSTFLAGS='--remap-path-prefix='+str(source)+'=/_/hurrycurry')
  run(['/usr/bin/git','apply','--check',str(patch)],30);run(['/usr/bin/git','apply',str(patch)],30)
  if '>= self.config.max_players' not in (source/'server/src/server.rs').read_text():raise ValueError('Player admission cap missing')
  run([str(toolchain/'bin/cargo'),'build','--locked','--release','--jobs','1','--bin','hurrycurry-server'])
  shutil.copyfile(source/'target/release/hurrycurry-server',publish/'hurrycurry-server');(publish/'hurrycurry-server').chmod(0o755)
 print(json.dumps({'key':key,'version':profile['version'],'unprivilegedBuild':True}))

if __name__=='__main__':
 try:
  if len(sys.argv)!=3:raise ValueError('Fixed game key and fresh build directory required')
  build(pathlib.Path(sys.argv[2]),sys.argv[1])
 except Exception as error:
  print(str(error) if isinstance(error,ValueError) else 'Reviewed source build failed; current installation preserved',file=sys.stderr);sys.exit(1)
