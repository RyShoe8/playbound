import hashlib
import io
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile
from openmohaaArchive import extract


class ArchiveTests(unittest.TestCase):
    def run_archive(self, name='game.so', changed=False, link=False, duplicate=False):
        with tempfile.TemporaryDirectory() as work:
            archive, output = Path(work)/'native.zip', Path(work)/'out'
            profile = {'files': {'game.so': {'bytes': 6, 'sha256': hashlib.sha256(b'module').hexdigest()}}}
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                with zipfile.ZipFile(archive, 'w') as bundle:
                    entry = zipfile.ZipInfo(name)
                    if link: entry.external_attr = 0o120777 << 16
                    bundle.writestr(entry, b'alterd' if changed else b'module')
                    if duplicate: bundle.writestr(name, b'module')
            extract(archive, output, profile)
            self.assertEqual((output/'game.so').read_bytes(), b'module')
    def test_valid(self): self.run_archive()
    def test_invalid(self):
        for options in [{'name': '../outside'}, {'changed': True}, {'link': True}, {'duplicate': True}]:
            with self.subTest(options=options), self.assertRaises(ValueError): self.run_archive(**options)


if __name__ == '__main__': unittest.main()
