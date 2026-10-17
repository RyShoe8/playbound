import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('trackmania', Path(__file__).with_name('customer-trackmania.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TrackmaniaPrivateSettings(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        account = self.root/'dedicated-account.json'
        account.write_text(json.dumps({'login': 'fixture-account', 'password': 'fixture-password'}))
        account.chmod(0o600)
        for relative in ('runtime','runtime/UserData','runtime/UserData/Maps','runtime/UserData/Maps/MatchSettings'):
            (self.root/relative).mkdir(mode=0o700)
        self.match = self.root/'runtime/UserData/Maps/MatchSettings/example.txt'
        self.match.write_text('<playlist><map><file>custom.Map.Gbx</file></map></playlist>')
        self.match.chmod(0o600)
        self.value = {'name': 'Private & Friends', 'maxPlayers': 12}

    def test_preserves_playlist_and_world_options_with_private_rpc_credentials(self):
        original = self.match.read_bytes()
        module.prepare(self.root, self.value, 23520)
        file = self.root/'runtime/UserData/Config/dedicated_cfg.txt'
        xml = ET.fromstring(file.read_bytes())
        ET.SubElement(xml.find('server_options'), 'comment').text = 'retained'
        file.write_bytes(ET.tostring(xml))
        passwords = (self.root/'xmlrpc-passwords.json').read_bytes()
        module.prepare(self.root, self.value, 23522)
        xml = ET.parse(file).getroot()
        self.assertEqual(xml.findtext('server_options/comment'), 'retained')
        self.assertEqual(xml.findtext('server_options/name'), 'Private & Friends')
        self.assertEqual(xml.findtext('system_config/xmlrpc_port'), '23523')
        self.assertEqual(xml.findtext('system_config/xmlrpc_allowremote'), 'false')
        self.assertEqual(self.match.read_bytes(), original)
        self.assertEqual((self.root/'xmlrpc-passwords.json').read_bytes(), passwords)
        self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_linked_credentials_and_xml_entities_are_refused(self):
        module.prepare(self.root, self.value, 23520)
        file = self.root/'runtime/UserData/Config/dedicated_cfg.txt'
        content = b'<!DOCTYPE dedicated [<!ENTITY x "payload">]><dedicated />'
        file.write_bytes(content)
        with self.assertRaises(ValueError):
            module.prepare(self.root, self.value, 23520)
        self.assertEqual(file.read_bytes(), content)
        account = self.root/'dedicated-account.json'
        account.unlink()
        account.symlink_to(self.match)
        with self.assertRaises(OSError):
            module.prepare(self.root, self.value, 23520)

    def test_port_pairs_and_typed_fields(self):
        for port in (True, 23519, 23521, 23539, 23540):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(self.value), port)
        for changes in ({'name': 'bad\nname'}, {'maxPlayers': True}, {'maxPlayers': 65}, {'rpcPort': 9000}):
            with self.assertRaises(ValueError):
                module.settings(json.dumps(dict(self.value, **changes)), 23520)


if __name__ == '__main__':
    unittest.main()
