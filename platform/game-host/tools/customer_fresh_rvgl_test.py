import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock, patch
import unittest

if os.name == 'nt':
    raise unittest.SkipTest('Linux fresh RVGL runtime boundary')

spec = importlib.util.spec_from_file_location('fresh_rvgl', Path(__file__).with_name('customer-fresh-rvgl.py'))
fresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fresh)


class FreshRvgl(unittest.TestCase):
    def test_only_untouched_identity_may_be_initialized(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'private'
            legacy = Path(temporary) / 'legacy'
            root.mkdir(mode=0o711)
            legacy.mkdir(mode=0o700)
            server_id = 'f' * 23 + '1'
            with patch.object(fresh, 'ROOT', root), patch.object(fresh, 'LEGACY', legacy), \
                 patch.object(fresh.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=os.getuid())):
                runtime = Mock()
                runtime.directory.side_effect = lambda directory: directory.mkdir(exist_ok=True)
                runtime.migration_ready.return_value = True
                identities = Mock()
                identities.ensure_identity.return_value = {'uid': 40000}
                self.assertTrue(fresh.fresh_candidate(server_id))
                fresh.initialize(server_id, runtime, identities)
                journal = json.loads((root / server_id / 'control' / 'migration.json').read_text())
                self.assertEqual(journal['origin'], 'fresh')
                self.assertEqual(journal['profileTransition'], {'target': 'uid', 'state': 'complete'})
                self.assertEqual(journal['gameSlug'], 're-volt-rvgl')
                self.assertFalse(fresh.fresh_candidate(server_id))
                with self.assertRaises(ValueError): fresh.initialize(server_id, runtime, identities)
                self.assertEqual(identities.ensure_identity.call_count, 1)

    def test_legacy_or_symlink_data_refuses_fresh_enrollment(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'private'
            legacy = Path(temporary) / 'legacy'
            root.mkdir()
            legacy.mkdir()
            server_id = 'f' * 23 + '1'
            (legacy / ('pb-' + server_id)).mkdir()
            self.assertFalse(fresh.fresh_candidate(server_id, root, legacy))
            (legacy / ('pb-' + server_id)).rmdir()
            (legacy / ('pb-' + server_id)).symlink_to(root)
            self.assertFalse(fresh.fresh_candidate(server_id, root, legacy))
            with self.assertRaises(ValueError): fresh.fresh_candidate('../escape', root, legacy)


if __name__ == '__main__':
    unittest.main()
