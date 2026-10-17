import importlib.util
import os
from pathlib import Path
import stat
import struct
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, patch

if os.name == 'nt':
    raise unittest.SkipTest('Linux private display candidate')

spec = importlib.util.spec_from_file_location('private_display', Path(__file__).with_name('customer-display.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateDisplayBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)/'display'
        root = patch.object(module, 'DISPLAY_ROOT', self.directory)
        root.start(); self.addCleanup(root.stop)

    def test_missing_or_wrong_enforced_label_cannot_spawn_a_display(self):
        for text in ('unconfined', 'playbound-customer-ipc-40001 (enforce)', 'playbound-customer-ipc-40000 (complain)'):
            with patch.object(module.os, 'getuid', return_value=40000), patch.object(module.Path, 'read_text', return_value=text), patch.object(module.subprocess, 'Popen') as spawn:
                with self.assertRaises(ValueError):
                    module.start()
                spawn.assert_not_called()
        self.assertFalse(self.directory.exists())

    def test_session_lock_blocks_overlap_and_authority_recovers_after_crash(self):
        uid = os.getuid()
        lock = module.acquire_lock(uid)
        try:
            first = module.write_authority(uid, 1000, b'a'*16)
            self.assertEqual(first.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(BlockingIOError):
                module.acquire_lock(uid)
        finally:
            os.close(lock)
        lock = module.acquire_lock(uid)
        try:
            second = module.write_authority(uid, 1000, b'b'*16)
            self.assertNotIn(b'a'*16, second.read_bytes())
            self.assertIn(b'b'*16, second.read_bytes())
        finally:
            os.close(lock)

    def test_authority_has_only_the_fixed_protocol_and_refuses_links(self):
        raw = module.authority(b'c'*16, 1000)
        self.assertEqual(struct.unpack_from('>H', raw)[0], 65535)
        self.assertIn(b'MIT-MAGIC-COOKIE-1', raw)
        for cookie in (b'', b'c'*15, b'c'*17, 'c'*16):
            with self.assertRaises(ValueError):
                module.authority(cookie, 1000)
        module.private_directory(os.getuid())
        outside = Path(self.temp.name)/'outside'
        outside.write_bytes(b'original')
        (self.directory/'Xauthority').symlink_to(outside)
        with self.assertRaises(ValueError):
            module.write_authority(os.getuid(), 1000, b'c'*16)
        self.assertEqual(outside.read_bytes(), b'original')

    def test_start_has_fixed_options_no_cookie_argv_and_cleanup_is_idempotent(self):
        process = Mock()
        process.poll.return_value = None
        with patch.object(module, 'verify_current', return_value=(os.getuid(), 1000)), patch.object(module, 'authenticated_ready', return_value=True), patch.object(module.subprocess, 'Popen', return_value=process) as spawn:
            display = module.start()
            args, options = spawn.call_args
            self.assertEqual(args[0][:4], ['/usr/bin/Xvfb', ':1000', '-screen', '0'])
            self.assertIn('-nolisten', args[0])
            self.assertIn('tcp', args[0])
            self.assertNotIn('-ac', args[0])
            self.assertEqual(options['env']['HOME'], '/server')
            self.assertNotIn('shell', options)
            self.assertEqual(display.environment['DISPLAY'], ':1000')
            process.wait.side_effect = [subprocess.TimeoutExpired('Xvfb', 3), None]
            display.close()
            display.close()
            process.kill.assert_called_once()
            self.assertFalse((self.directory/'Xauthority').exists())
            lock = module.acquire_lock(os.getuid())
            os.close(lock)

    def test_readiness_authenticates_fragmented_x11_handshake(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.recv.side_effect = [b'\x01\x00', b'\x0b\x00\x00\x00\x00\x00']
        info = SimpleNamespace(st_mode=stat.S_IFSOCK, st_uid=40000)
        with patch.object(module.Path, 'lstat', return_value=info), patch.object(module.socket, 'socket', return_value=connection):
            self.assertTrue(module.authenticated_ready(40000, 1000, b'd'*16))
        sent = connection.sendall.call_args.args[0]
        self.assertIn(b'MIT-MAGIC-COOKIE-1', sent)
        self.assertTrue(sent.endswith(b'd'*16))
        connection.settimeout.assert_called_once_with(0.25)
        connection.connect.assert_called_once_with('/tmp/.X11-unix/X1000')


if __name__ == '__main__':
    unittest.main()
