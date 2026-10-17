import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ipc_policy', Path(__file__).with_name('customer-display-policy.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DisplayPolicyContract(unittest.TestCase):
    def test_every_reserved_identity_has_unique_profile_and_display(self):
        names = set()
        displays = set()
        for uid in range(40000, 40256):
            name = module.profile_name(uid)
            display = module.display_number(uid)
            policy = module.render(uid)
            names.add(name); displays.add(display)
            self.assertIn('peer=(label='+name+')', policy)
            self.assertIn('addr="@/tmp/.X11-unix/X'+str(display)+'"', policy)
            self.assertNotIn('peer=(label=unconfined)', policy)
            self.assertNotIn('network unix', policy)
            self.assertNotIn('\n  unix,', policy)
            self.assertNotIn('change_profile', policy)
            self.assertNotIn('complain', policy)
        self.assertEqual(len(names), 256)
        self.assertEqual(len(displays), 256)
        self.assertEqual(min(displays), 1000)
        self.assertEqual(max(displays), 1255)

    def test_profile_name_injection_and_nonreserved_accounts_are_refused(self):
        for uid in (True, 0, 39999, 40256, '40000', None, {}, '40000 { unix, }'):
            for function in (module.profile_name, module.display_number, module.render):
                with self.subTest(uid=uid, function=function.__name__), self.assertRaises(ValueError):
                    function(uid)

    def test_kernel_features_and_exact_enforce_mode_are_mandatory(self):
        name = module.profile_name(40000)
        def read(path):
            return name+' (enforce)\n' if str(path).endswith('/profiles') else 'yes\n'
        with patch.object(module.Path, 'read_text', read):
            self.assertEqual(module.verify_enforced(40000), name)
        for profile in ('', name+' (complain)\n', name+'-other (enforce)\n',
                        name+' (enforce)\n'+name+' (complain)\n',
                        name+' (enforce)\n'+name+' (enforce)\n'):
            with self.subTest(profile=profile):
                with patch.object(module.Path, 'read_text', lambda path: profile if str(path).endswith('/profiles') else 'yes'):
                    with self.assertRaises(ValueError):
                        module.verify_enforced(40000)
        with patch.object(module.Path, 'read_text', return_value='no'):
            with self.assertRaises(ValueError):
                module.verify_enforced(40000)


if __name__ == '__main__':
    unittest.main()
