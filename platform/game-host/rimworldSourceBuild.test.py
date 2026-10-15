import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('rimworldSourceBuild.py'))
builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)

class SourceBoundaries(unittest.TestCase):
    def test_bridge_hooks_must_match_once_and_cannot_apply_twice(self):
        text = 'static void Main() { ServerPrinter.CreateLogger(); ServerNetwork.StartFeature(); }'
        patched = builder.patch_program(text, 'reviewed', 'version')
        self.assertIn('--playbound-browser-query', patched)
        self.assertIn('--playbound-runtime-info', patched)
        self.assertIn('Bridge.StartSnapshots();', patched)
        for bad in [text + text, text.replace('Main()', 'Other()'), patched]:
            with self.assertRaises(ValueError): builder.patch_program(bad, 'reviewed', 'version')

    def test_source_archive_rejects_traversal_links_duplicates_and_special_modes(self):
        with tempfile.TemporaryDirectory(prefix='pb-rim-source-') as folder:
            root = Path(folder)
            for kind in ['good', 'traversal', 'symlink', 'duplicate', 'mode', 'prefix']:
                archive = root / (kind + '.tar.gz')
                with tarfile.open(archive, 'w:gz') as out:
                    name = 'Rimworld-Together-reviewed/code.cs'
                    if kind == 'traversal': name = 'Rimworld-Together-reviewed/../../escape'
                    if kind == 'prefix': name = 'other/code.cs'
                    item = tarfile.TarInfo(name); item.size = 1; item.mode = 0o4755 if kind == 'mode' else 0o644
                    if kind == 'symlink': item.type = tarfile.SYMTYPE; item.linkname = '/etc/passwd'; item.size = 0
                    out.addfile(item, io.BytesIO(b'x') if item.isfile() else None)
                    if kind == 'duplicate': out.addfile(item, io.BytesIO(b'x'))
                if kind == 'good':
                    builder.extract(archive, root / kind, 'reviewed'); self.assertEqual((root / kind / 'code.cs').read_bytes(), b'x')
                else:
                    with self.assertRaises(ValueError): builder.extract(archive, root / kind, 'reviewed')
            self.assertFalse((root / 'escape').exists())

    def test_redirects_cannot_select_another_source(self):
        with self.assertRaises(ValueError): builder.NoRedirect().redirect_request(None, None, None, None, None, None)

if __name__ == '__main__': unittest.main()
