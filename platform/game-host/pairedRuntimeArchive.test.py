import hashlib,io,tarfile,tempfile,unittest
from pathlib import Path
from pairedRuntimeArchive import extract
class Tests(unittest.TestCase):
 def test_warzone_native_package_selects_engine_and_data_without_saves(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'pkg.tar';rows={'warzone2100':b'engine','data/base.wz':b'data'};digest=hashlib.sha256()
   for name,data in sorted(rows.items()):digest.update((name+'\0'+hashlib.sha256(data).hexdigest()+'\n').encode())
   profile={'format':'tar','prefix':'./usr/','treeSha256':digest.hexdigest(),'fileCount':2,'totalBytes':10}
   with tarfile.open(p,'w') as t:
    for name,data in [('./usr/bin/warzone2100',b'engine'),('./usr/share/warzone2100/base.wz',b'data'),('./usr/share/doc/copyright',b'ignored'),('./var/lib/world',b'saved')]:
     m=tarfile.TarInfo(name);m.size=len(data);t.addfile(m,io.BytesIO(data))
   extract(p,root/'fresh','warzone-2100',profile)
   self.assertEqual((root/'fresh/data/base.wz').read_bytes(),b'data');self.assertFalse((root/'fresh/var').exists())
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
