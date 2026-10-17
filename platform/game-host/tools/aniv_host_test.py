import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

if os.name == 'nt':
    raise unittest.SkipTest('Linux namespace helper runs and is tested on the VPS')

spec = importlib.util.spec_from_file_location('aniv_host', Path(__file__).with_name('aniv-host.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Boundaries(unittest.TestCase):
    def test_log_reads_are_bounded_and_redacted(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'CONTROL', Path(directory)):
            filename = Path(directory) / ('startup-' + module.identity('server-one') + '.log')
            filename.write_text('discard\n' + 'x' * 70000 + '\npass\x1b[31mword=several words\n' + 'a' * 32 + '\nReady\nunfinished')
            filename.chmod(0o600)
            result = module.read_logs('server-one')
            self.assertTrue(result['truncated'])
            self.assertEqual(result['lines'], ['[credential-bearing line omitted]', '[redacted]', 'Ready'])
            self.assertFalse(module.read_logs('missing-server')['available'])

    def test_bounded_writer_resets_its_offset_and_preserves_recent_tail(self):
        with tempfile.TemporaryFile('w+b') as log:
            log.write(b'old\n' * (module.LOG_RETAIN_BYTES // 4) + b'recent\n')
            module.write_bounded_log(log, b'new\n')
            self.assertLessEqual(log.tell(), module.LOG_READ_BYTES + 4)
            log.seek(0)
            self.assertTrue(log.read().endswith(b'recent\nnew\n'))

    def test_retention_leaves_live_legacy_writer_alone(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'CONTROL', Path(directory)), patch.object(module, 'process_identity', return_value='live'):
            active = module.identity('active-server')
            stopped = module.identity('stopped-server')
            for digest in (active, stopped):
                filename = Path(directory) / ('startup-' + digest + '.log')
                filename.write_bytes(b'old\n' * (module.LOG_RETAIN_BYTES // 4) + b'recent\n')
                filename.chmod(0o600)
            (Path(directory) / 'slot-27700.json').write_text(module.json.dumps({'pid':1,'identity':'live','serverId':'active-server'}))
            self.assertEqual(module.retain_stopped_logs(), {'trimmed':1})
            self.assertGreater((Path(directory) / ('startup-' + active + '.log')).stat().st_size, module.LOG_RETAIN_BYTES)
            self.assertLessEqual((Path(directory) / ('startup-' + stopped + '.log')).stat().st_size, module.LOG_READ_BYTES)

    def test_log_reader_refuses_links_and_nonprivate_files(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'CONTROL', Path(directory)):
            filename = Path(directory) / ('startup-' + module.identity('server-one') + '.log')
            other = Path(directory) / 'private'
            other.write_text('private\n')
            other.chmod(0o600)
            filename.symlink_to(other)
            with self.assertRaises(OSError): module.read_logs('server-one')
            filename.unlink()
            os.link(other, filename)
            with self.assertRaises(ValueError): module.read_logs('server-one')
            filename.unlink()
            filename.write_text('private\n')
            filename.chmod(0o644)
            with self.assertRaises(ValueError): module.read_logs('server-one')

    def test_query_counts_humans_and_never_guesses_on_malformed_replies(self):
        header=b'\xff\xff\xff\xffI\x11Server\0aneurismiv\0aniv\0ANEURISM IV\0\x00\x00'
        self.assertEqual(module.parse_occupancy(header+bytes([5,16,2])), {'players':3,'maxPlayers':16,'bots':2})
        self.assertEqual(module.parse_occupancy(header+bytes([0,16,0])), {'players':0,'maxPlayers':16,'bots':0})
        for packet in (b'', header, header+bytes([1,16,2]), header+bytes([17,16,0]), header+bytes([0,0,0])):
            self.assertIsNone(module.parse_occupancy(packet))
    def test_only_scoped_namespace_slots_are_accepted(self):
        self.assertEqual(module.placement(27700)[0], 'pb-aniv-27700')
        self.assertNotEqual(module.placement(27700)[4], module.placement(27701)[4])
        for slot in (0, 27015, 27716, 65535):
            with self.assertRaises(ValueError): module.placement(slot)

    def test_server_settings_cannot_be_shell_commands_or_unbounded(self):
        self.assertEqual(module.settings({'name':'A & B', 'maxPlayers':4})['map'], 'aneurismiv')
        self.assertEqual(module.settings({'name':'PlayBound.Club Community Server'})['name'], 'PlayBound Club Community Server')
        with self.assertRaises(ValueError): module.settings({'name':'...///'})
        for value in ({'maxPlayers':True}, {'maxPlayers':100}, {'map':'../other'}, {'name':'hello\nquit'}):
            with self.assertRaises(ValueError): module.settings(value)
        with self.assertRaises(ValueError): module.identity('../arbitrary')

    @unittest.skipIf(os.name == 'nt', 'Unix permission and symlink boundary')
    def test_credentials_cannot_follow_symlinks_or_read_other_owners(self):
        with tempfile.TemporaryDirectory() as directory:
            value=Path(directory)/'value'; value.write_text('fixture'); value.chmod(0o600)
            self.assertEqual(module.private_value(value, os.getuid()), 'fixture')
            with self.assertRaises(ValueError): module.private_value(value, os.getuid()+1)
            value.chmod(0o644)
            with self.assertRaises(ValueError): module.private_value(value, os.getuid())
            link=Path(directory)/'link'; link.symlink_to(value)
            with self.assertRaises(OSError): module.private_value(link, os.getuid())

    def test_credentials_reject_hardlinks_fifos_and_non_ascii_without_content_leaks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            value = root/'value'
            value.write_bytes(b'fixture')
            value.chmod(0o600)
            alias = root/'alias'
            os.link(value, alias)
            with self.assertRaises(ValueError):
                module.private_value(value, os.getuid())
            alias.unlink()
            fifo = root/'fifo'
            os.mkfifo(fifo, 0o600)
            with self.assertRaises(ValueError):
                module.private_value(fifo, os.getuid())
            value.write_bytes(b'private-fixture-\xff')
            with self.assertRaisesRegex(ValueError, '^Invalid Steam credential encoding$'):
                module.private_value(value, os.getuid())

    def test_credential_changes_during_read_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            value = Path(directory)/'value'
            value.write_bytes(b'fixture')
            value.chmod(0o600)
            original = module.os.read
            def changed(descriptor, count):
                content = original(descriptor, count)
                value.write_bytes(b'changed fixture')
                return content
            with patch.object(module.os, 'read', side_effect=changed):
                with self.assertRaisesRegex(ValueError, 'changed while reading'):
                    module.private_value(value, os.getuid())


if __name__ == '__main__': unittest.main()
