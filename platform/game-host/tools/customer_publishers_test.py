"""Check operator entry points against actual checked-in manifest names."""
import ast
from pathlib import Path
import unittest


class PublisherManifestContract(unittest.TestCase):
    def test_every_fixed_manifest_literal_exists_with_exact_case(self):
        tools = Path(__file__).parent
        available = {file.name for file in tools.parent.glob('customer*.json')}
        for publisher in tools.glob('install-*-customer-assets.py'):
            tree = ast.parse(publisher.read_text(encoding='utf-8'))
            manifests = {node.value for node in ast.walk(tree)
                         if isinstance(node, ast.Constant) and isinstance(node.value, str)
                         and node.value.startswith('customer') and node.value.endswith('.json')}
            with self.subTest(publisher=publisher.name):
                self.assertTrue(manifests)
                self.assertTrue(manifests <= available, manifests-available)


if __name__ == '__main__':
    unittest.main()
