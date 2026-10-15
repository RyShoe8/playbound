import hashlib
import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
import warnings
import zipfile

spec = importlib.util.spec_from_file_location('archive', Path(__file__).with_name('xonoticArchive.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveBounds(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.archive = self.root / 'archive.zip'
        self.output = self.root / 'engine'
        self.bytes = b'reviewed native fixture'
        self.name = 'Xonotic/xonotic-linux64-dedicated'

    def bundle(self, entries):
        with warnings.catch_warnings(), zipfile.ZipFile(self.archive, 'w') as bundle:
            warnings.simplefilter('ignore', UserWarning)
            for name, content, mode in entries:
                entry = zipfile.ZipInfo(name)
                entry.external_attr = mode << 16
                bundle.writestr(entry, content)
        return {'archiveBytes': self.archive.stat().st_size, 'archiveSha512': hashlib.sha512(self.archive.read_bytes()).hexdigest(), 'member': self.name, 'binaryBytes': len(self.bytes), 'binarySha256': hashlib.sha256(self.bytes).hexdigest()}

    def test_extracts_only_native_bytes_and_never_existing_server_settings(self):
        profile = self.bundle([(self.name, self.bytes, 0o100755), ('Xonotic/server/server.cfg', b'publisher defaults', 0o100644)])
        module.extract(self.archive, self.output, profile)
        self.assertEqual(self.output.read_bytes(), self.bytes)
        self.assertFalse((self.root / 'server').exists())

    def test_unsafe_names_links_duplicate_selected_entries_and_bad_hash_are_rejected(self):
        for entries in [
            [(self.name, self.bytes, 0o100755), ('../escape', b'bad', 0o100644)],
            [(self.name, self.bytes, stat.S_IFLNK | 0o777)],
            [(self.name, self.bytes, 0o100755)] * 2,
            [(self.name, b'x' * len(self.bytes), 0o100755)],
            [(self.name, self.bytes, 0o104755)],
        ]:
            profile = self.bundle(entries)
            with self.assertRaises(ValueError): module.extract(self.archive, self.output, profile)
            self.output.unlink(missing_ok=True)

    def test_archive_digest_and_preexisting_outputs_fail_before_replacement(self):
        profile = self.bundle([(self.name, self.bytes, 0o100755)])
        with self.assertRaises(ValueError): module.extract(self.archive, self.output, {**profile, 'archiveSha512': '0' * 128})
        self.output.write_bytes(b'previous engine')
        with self.assertRaises(FileExistsError): module.extract(self.archive, self.output, profile)
        self.assertEqual(self.output.read_bytes(), b'previous engine')


if __name__ == '__main__': unittest.main()
