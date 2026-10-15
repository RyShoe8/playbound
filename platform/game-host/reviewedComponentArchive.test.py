import hashlib
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from reviewedComponentArchive import extract


class ArchiveTests(unittest.TestCase):
    def test_engine_only_preserves_package_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); archive=root/'game.tar'; data=b'engine'
            profile={'format':'tar','member':'game/engine','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
            with tarfile.open(archive,'w') as t:
                for name,contents in [('game/engine',data),('../world',b'never extract')]:
                    m=tarfile.TarInfo(name);m.size=len(contents);t.addfile(m,io.BytesIO(contents))
            extract(archive,root/'fresh',profile)
            self.assertEqual((root/'fresh').read_bytes(),data)
            self.assertEqual(sorted(p.name for p in root.iterdir()),['fresh','game.tar'])

    def test_duplicate_symlink_changed_and_missing_engine(self):
        for kind in ['duplicate','link','changed','missing']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as folder:
                root=Path(folder); archive=root/'game.tar';data=b'engine'
                profile={'format':'tar','member':'game/engine','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
                with tarfile.open(archive,'w') as t:
                    m=tarfile.TarInfo('game/engine' if kind!='missing' else 'other');m.size=len(data)
                    if kind=='link':m.type=tarfile.SYMTYPE;m.linkname='/private';m.size=0;t.addfile(m)
                    else:
                        t.addfile(m,io.BytesIO(b'broken' if kind=='changed' else data))
                        if kind=='duplicate':t.addfile(m,io.BytesIO(data))
                with self.assertRaises(ValueError):extract(archive,root/'fresh',profile)
                self.assertFalse((root/'fresh').exists())


if __name__=='__main__':unittest.main()
