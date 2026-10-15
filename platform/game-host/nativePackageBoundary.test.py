"""Linux-only package/promotion boundaries; all writes use temporary fixtures."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
import uuid

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('promotion', HERE / 'promote-package-native.py')
promotion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promotion)

class NativeBoundaries(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='pb-native-boundary-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.operation = str(uuid.uuid4())
        self.stage = self.root / ('.pb-update-bzflag-' + self.operation)
        self.stage.mkdir()
        self.content = b'reviewed native fixture'
        self.profiles = {'bzflag': {'binary': 'bzfs', 'binaryBytes': len(self.content), 'binarySha256': hashlib.sha256(self.content).hexdigest()}}
        (self.stage / 'bzfs').write_bytes(self.content)

    def promote(self):
        promotion.promote('bzflag', self.operation, self.root, self.profiles)

    @unittest.skipUnless(os.geteuid() == 0, 'requires isolated root fixture')
    def test_promotes_only_matching_regular_bytes(self):
        self.promote()
        target = self.stage / 'bzfs'
        self.assertEqual(target.read_bytes(), self.content)
        self.assertEqual(target.stat().st_uid, 0)
        self.assertEqual(target.stat().st_mode & 0o7777, 0o755)
        self.assertEqual(list(self.stage.iterdir()), [target])

    def test_rejects_paths_custom_games_and_extra_arguments(self):
        for game, operation in [('bzflag', '../escape'), ('custom', self.operation), ('bzflag', self.operation + ' extra')]:
            with self.assertRaises(ValueError):
                promotion.promote(game, operation, self.root, self.profiles)

    @unittest.skipUnless(os.geteuid() == 0, 'requires isolated root fixture')
    def test_rejects_tampering_links_and_linked_stage(self):
        target = self.stage / 'bzfs'
        target.write_bytes(b'x' * len(self.content))
        with self.assertRaises(ValueError): self.promote()
        self.assertFalse(any(p.name.startswith('.root-native') for p in self.stage.iterdir()))
        target.unlink()
        outside = self.root / 'outside'; outside.write_bytes(self.content)
        target.symlink_to(outside)
        with self.assertRaises(OSError): self.promote()
        target.unlink(); os.link(outside, target)
        with self.assertRaises(ValueError): self.promote()
        target.unlink(); self.stage.rmdir(); self.stage.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(OSError): self.promote()
        self.assertEqual(outside.read_bytes(), self.content)

    def test_extraction_rejects_selected_links_duplicates_and_wrong_hash(self):
        # A tiny synthetic Debian container exercises the real streaming reader.
        helper = self.root / 'packageNativeArchive.py'; shutil.copyfile(HERE / helper.name, helper)
        for kind in ['good', 'symlink', 'duplicate', 'digest', 'traversal']:
            tar = self.root / 'data.tar.gz'
            with tarfile.open(tar, 'w:gz') as payload:
                member = tarfile.TarInfo('usr/games/bzfs' if kind != 'traversal' else '../bzfs')
                member.mode = 0o755; member.size = len(self.content)
                if kind == 'symlink': member.type = tarfile.SYMTYPE; member.linkname = '/etc/passwd'; member.size = 0
                payload.addfile(member, io.BytesIO(self.content) if member.isfile() else None)
                if kind == 'duplicate': payload.addfile(member, io.BytesIO(self.content))
            (self.root / 'debian-binary').write_text('2.0\n')
            with tarfile.open(self.root / 'control.tar.gz', 'w:gz'): pass
            archive = self.root / (kind + '.deb')
            subprocess.run(['/usr/bin/ar', 'rc', str(archive), 'debian-binary', 'control.tar.gz', 'data.tar.gz'], cwd=self.root, check=True, stdout=subprocess.DEVNULL)
            profile = {**self.profiles['bzflag'], 'member': 'usr/games/bzfs', 'archiveBytes': archive.stat().st_size, 'archiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
            if kind == 'digest': profile['binarySha256'] = '0' * 64
            (self.root / 'nativePackageProfiles.json').write_text(json.dumps({'bzflag': profile}))
            target = self.root / (kind + '-output')
            result = subprocess.run(['/usr/bin/python3', str(helper), 'bzflag', str(archive), str(target)], capture_output=True)
            self.assertEqual(result.returncode == 0, kind == 'good', kind)
            if kind == 'good': self.assertEqual(target.read_bytes(), self.content)
        self.assertFalse((self.root.parent / 'bzfs').exists())

if __name__ == '__main__': unittest.main()
