import hashlib,io,tarfile,tempfile,unittest
from pathlib import Path
from pairedRuntimeArchive import extract
class Tests(unittest.TestCase):
 def test_package_selector_keeps_settings_and_saves_out(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'pkg.tar';data=b'controller';digest=hashlib.sha256(('bombsquad_server\0'+hashlib.sha256(data).hexdigest()+'\n').encode()).hexdigest()
   profile={'format':'tar','prefix':'pkg/','treeSha256':digest,'fileCount':1,'totalBytes':len(data)}
   with tarfile.open(p,'w') as t:
    for name,contents in [('pkg/bombsquad_server',data),('pkg/state/world',b'private')]:
     m=tarfile.TarInfo(name);m.size=len(contents);t.addfile(m,io.BytesIO(contents))
   extract(p,root/'fresh','bombsquad',profile)
   self.assertEqual((root/'fresh/bombsquad_server').read_bytes(),data);self.assertFalse((root/'fresh/state').exists())
 def test_malformed_packages_fail(self):
  for kind in ['traversal','link','duplicate','changed']:
   with self.subTest(kind=kind),tempfile.TemporaryDirectory() as d:
    root=Path(d);p=root/'pkg.tar';data=b'controller';digest=hashlib.sha256(('bombsquad_server\0'+hashlib.sha256(data).hexdigest()+'\n').encode()).hexdigest()
    profile={'format':'tar','prefix':'pkg/','treeSha256':digest,'fileCount':1,'totalBytes':len(data)}
    with tarfile.open(p,'w') as t:
     m=tarfile.TarInfo('pkg/dist/../../world' if kind=='traversal' else 'pkg/bombsquad_server');m.size=len(data)
     if kind=='link':m.type=tarfile.SYMTYPE;m.linkname='/private';m.size=0;t.addfile(m)
     else:
      t.addfile(m,io.BytesIO(b'bad source' if kind=='changed' else data))
      if kind=='duplicate':t.addfile(m,io.BytesIO(data))
    with self.assertRaises(ValueError):extract(p,root/'fresh','bombsquad',profile)
if __name__=='__main__':unittest.main()
