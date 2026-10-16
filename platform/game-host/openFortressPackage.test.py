import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("of_package", Path(__file__).with_name("openFortressPackage.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def listing(*rows):
    return "archive metadata\n----------\n" + "\n\n".join(
        f"Path = {name}\nSize = {size}\nAttributes = A {kind}\nEncrypted = -" for name, size, kind in rows
    ) + "\n"


class PackageBoundary(unittest.TestCase):
    def test_sdk_channel_and_build(self):
        valid = '"appid" "244310" "buildid" "6982827" "StateFlags" "4" "UserConfig" { "BetaKey" "previous2021" } "MountedConfig" { "BetaKey" "previous2021" }'
        module.verify_sdk_manifest(valid)
        for text in [valid.replace('6982827', '999'), valid.replace('"4"', '"6"'), valid.replace('previous2021', 'public', 1), valid + ' "buildid" "6982827"']:
            with self.assertRaises(ValueError):
                module.verify_sdk_manifest(text)

    def test_expected_members(self):
        rows, size = module.entries_from_listing(listing(("open_fortress", 0, "drwxr-xr-x"), ("open_fortress/bin/server.so", 12, "-rwxr-xr-x")))
        self.assertEqual(size, 12)
        self.assertEqual(len(rows), 2)

    def test_unsafe_paths_and_types(self):
        for name in ["/open_fortress/x", "open_fortress/../x", "open_fortress//x", "other/x", "open_fortress\\x", "open_fortress/x\x00y"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                module.entries_from_listing(listing((name, 1, "-rw-r--r--")))
        for kind in ["lrwxrwxrwx", "prw-r--r--", "srw-r--r--"]:
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                module.entries_from_listing(listing(("open_fortress/file", 1, kind)))

    def test_duplicates_links_and_parent_collisions(self):
        row = ("open_fortress/x", 1, "-rw-r--r--")
        for text in [listing(row, row), listing(row) + "Symbolic Link = ../outside\n", listing(row) + "Hard Link = outside\n",
                     listing(row, ("open_fortress/x/child", 1, "-rw-r--r--")), listing(row).replace("Encrypted = -", "Encrypted = +"),
                     listing(row).replace("Size = 1", "Size = 1\nSize = 2")]:
            with self.assertRaises(ValueError):
                module.entries_from_listing(text)

    def test_size_bounds(self):
        for size in [-1, 2 * 1024**3]:
            with self.assertRaises(ValueError):
                module.entries_from_listing(listing(("open_fortress/file", size, "-rw-r--r--")))
        with self.assertRaises(ValueError):
            module.entries_from_listing(listing(("open_fortress/folder", 1, "drwxr-xr-x")))


if __name__ == "__main__":
    unittest.main()
