import hashlib
import io
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile
from unvanquishedArchive import extract


class ArchiveTests(unittest.TestCase):
    def run_archive(self, changed=False, extra=None):
        with tempfile.TemporaryDirectory() as work:
            archive, output = Path(work)/'game.zip', Path(work)/'out'
            files = {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'executable': name == 'daemonded'} for name, data in [('daemonded', b'engine'), ('pkg/unvanquished_1.0.0.dpk', b'game-data')]}
            native = io.BytesIO()
            with zipfile.ZipFile(native, 'w') as bundle: bundle.writestr('daemonded', b'alterd' if changed else b'engine')
            with warnings.catch_warnings():
                warnings.simplefilter('ignore')
                with zipfile.ZipFile(archive, 'w') as bundle:
                    bundle.writestr('release/linux-amd64.zip', native.getvalue())
                    bundle.writestr('release/pkg/unvanquished_1.0.0.dpk', b'game-data')
                    if extra: bundle.writestr(extra, b'bad')
            extract(archive, output, {'files': files, 'prefix': 'release/', 'nativeZip': 'linux-amd64.zip'})
            self.assertEqual((output/'daemonded').read_bytes(), b'engine')
    def test_valid(self): self.run_archive()
    def test_changed(self):
        with self.assertRaises(ValueError): self.run_archive(changed=True)
    def test_bad_inventory(self):
        for name in ['release/../outside', 'release/pkg/unvanquished_1.0.0.dpk', 'release/pkg/extra.dpk']:
            with self.subTest(name=name), self.assertRaises(ValueError): self.run_archive(extra=name)


if __name__ == '__main__': unittest.main()
