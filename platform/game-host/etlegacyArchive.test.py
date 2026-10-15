import hashlib
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from etlegacyArchive import extract


class ArchiveTests(unittest.TestCase):
    def run_archive(self, extra=None, changed=False):
        with tempfile.TemporaryDirectory() as work:
            archive, output = Path(work)/'release.tar.gz', Path(work)/'output'
            entries = {'etlded.x86_64': b'engine', 'legacy/server.pk3': b'mod', 'licenses/COPYING': b'license'}
            raw = ''.join(name+'\0'+str(len(data))+'\0'+hashlib.sha256(data).hexdigest()+'\n' for name, data in sorted(entries.items()))
            profile = {'prefix': 'release/', 'fileCount': 3, 'totalBytes': sum(map(len, entries.values())), 'treeSha256': hashlib.sha256(raw.encode()).hexdigest()}
            with tarfile.open(archive, 'w:gz') as bundle:
                for name, data in entries.items():
                    if changed and name == 'etlded.x86_64': data = b'modified'
                    item = tarfile.TarInfo('release/'+name); item.size = len(data); bundle.addfile(item, io.BytesIO(data))
                if extra:
                    item = tarfile.TarInfo(extra)
                    if extra.endswith('link'):
                        item.type = tarfile.SYMTYPE; item.linkname = '/tmp/outside'
                    bundle.addfile(item)
            extract(archive, output, profile)
            self.assertEqual((output/'etlded.x86_64').read_bytes(), b'engine')

    def test_reviewed_tree(self): self.run_archive()
    def test_bad_entries(self):
        for name in ['release/../outside', 'release/legacy/link', 'release/etlded.x86_64']:
            with self.subTest(name=name), self.assertRaises((ValueError, FileExistsError)): self.run_archive(extra=name)
    def test_changed_tree(self):
        with self.assertRaises(ValueError): self.run_archive(changed=True)


if __name__ == '__main__': unittest.main()
