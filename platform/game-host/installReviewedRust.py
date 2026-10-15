#!/usr/bin/python3
"""One-time operator setup; update workers never receive Docker/root access."""
import hashlib,json,os,pathlib,stat,subprocess,uuid

IMAGE='rust@sha256:82150a52ec202c1b14d7817e14516c392bb7f5cfebd88f1ed531cb37ebd39922'
PINS={'cargo':'ff3022fcbd13b08434ea7afde9a0ef9d5b3f5c17b5fc7a40031be3ee000a6a24','rustc':'3690cc576ede140504698405d5d8fa3826aaadbe71699c6c4ed0a565d6f493e2'}
def verify(root):
 if root.resolve()!=root or root.stat().st_uid!=0:raise ValueError('Rust toolchain must be an isolated root-owned directory')
 for name,sha in PINS.items():
  p=root/'bin'/name;info=p.lstat()
  if not p.is_file() or p.is_symlink() or info.st_uid!=0 or info.st_mode&0o7022 or hashlib.sha256(p.read_bytes()).hexdigest()!=sha:raise ValueError('Reviewed Rust executable mismatch')
def install():
 if os.geteuid()!=0:raise ValueError('Run reviewed Rust setup as an operator, never through the agent')
 root=pathlib.Path('/opt/playbound-host/toolchains');root.mkdir(mode=0o755,exist_ok=True)
 if root.resolve()!=root or root.stat().st_uid!=0:raise ValueError('Unsafe toolchain parent')
 target=root/'rust-1.98.0'
 if target.exists():verify(target);print(json.dumps({'reviewedRustReady':True,'existing':True}));return
 fresh=root/('.rust-export-'+str(uuid.uuid4()));container=None
 try:
  container=subprocess.check_output(['docker','create','--network','none',IMAGE],text=True,timeout=300).strip()
  if len(container)!=64 or any(c not in '0123456789abcdef' for c in container):raise ValueError('Unexpected export container identity')
  subprocess.run(['docker','cp',container+':/usr/local/rustup/toolchains/1.98.0-x86_64-unknown-linux-gnu',str(fresh)],check=True,timeout=180)
  for parent,dirs,files in os.walk(fresh):
   p=pathlib.Path(parent)
   if p.is_symlink():raise ValueError('Toolchain directory link refused')
   os.chown(p,0,0);p.chmod(0o755)
   for name in dirs:
    if (p/name).is_symlink():raise ValueError('Toolchain directory link refused')
   for name in files:
    f=p/name;info=f.lstat()
    if not stat.S_ISREG(info.st_mode) or f.is_symlink():raise ValueError('Toolchain special file refused')
    os.chown(f,0,0);f.chmod(0o755 if info.st_mode&0o111 else 0o644)
  verify(fresh);fresh.rename(target)
  print(json.dumps({'reviewedRustReady':True,'existing':False}))
 finally:
  if container:subprocess.run(['docker','rm',container],check=True,stdout=subprocess.DEVNULL,timeout=30)
if __name__=='__main__':install()
