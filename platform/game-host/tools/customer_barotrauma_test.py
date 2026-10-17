import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('barotrauma', Path(__file__).with_name('customer-barotrauma.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BarotraumaConfigurationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.value = {'name': 'Friends & submarines', 'maxPlayers': 12}

    def test_preserves_campaign_settings_and_children(self):
        config = self.root / 'serversettings.xml'
        config.write_text('<serversettings seed="saved" MaxPlayers="4"><campaign submarine="Dugong" /></serversettings>')
        config.chmod(0o600)
        module.prepare(self.root, self.value, 27220)
        module.prepare(self.root, self.value, 27220)
        document = ET.parse(config).getroot()
        self.assertEqual(document.attrib['seed'], 'saved')
        self.assertEqual(document.find('campaign').attrib['submarine'], 'Dugong')
        self.assertEqual(document.attrib['queryport'], '27221')
        self.assertEqual(document.attrib['ServerName'], self.value['name'])
        self.assertEqual(document.attrib['MaxPlayers'], '12')
        self.assertEqual(config.stat().st_mode & 0o777, 0o600)

    def test_rejects_invalid_allocations_and_types(self):
        for port in (True, 27219, 27221, 27239, 27240):
            with self.subTest(port=port), self.assertRaises(ValueError):
                module.settings(json.dumps(self.value), port)
        for count in (True, 1, 17, '12'):
            with self.subTest(count=count), self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, maxPlayers=count)), 27220)
        with self.assertRaises(ValueError):
            module.settings(json.dumps(dict(self.value, command='anything')), 27220)

    def test_malformed_or_entity_xml_never_overwrites(self):
        config = self.root / 'serversettings.xml'
        for content in ('<broken', '<other />', '<!DOCTYPE serversettings [<!ENTITY x "secret">]><serversettings />', '<serversettings>\x00</serversettings>'):
            config.write_text(content)
            config.chmod(0o600)
            with self.subTest(content=content), self.assertRaises((ValueError, ET.ParseError)):
                module.prepare(self.root, self.value, 27220)
            self.assertEqual(config.read_text(), content)

    def test_rejects_links_and_public_configuration(self):
        config = self.root / 'serversettings.xml'
        outside = self.root / 'outside'
        outside.write_text('<serversettings />')
        outside.chmod(0o600)
        for kind in ('symbolic', 'hard'):
            if kind == 'symbolic': config.symlink_to(outside)
            else: os.link(outside, config)
            with self.subTest(kind=kind), self.assertRaises((ValueError, OSError)):
                module.prepare(self.root, self.value, 27220)
            config.unlink()
        config.write_text('<serversettings />')
        config.chmod(0o644)
        with self.assertRaises(ValueError): module.prepare(self.root, self.value, 27220)


if __name__ == '__main__':
    unittest.main()
