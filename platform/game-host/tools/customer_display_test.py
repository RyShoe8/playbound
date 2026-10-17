import importlib.util
import os
from pathlib import Path
import stat
import struct
import subprocess
import signal
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

    def test_supervisor_refuses_invalid_callbacks_before_start(self):
        for launch, factory in ((None, None), ('/bin/sh', None), (lambda _: None, 'Xvfb')):
            with self.subTest(launch=launch), patch.object(module, 'start') as start:
                with self.assertRaises(ValueError):
                    module.supervise_game(launch, factory)
                start.assert_not_called()

    def test_cancel_during_display_start_cannot_launch_engine(self):
        display = Mock()
        handlers = {}
        def register(number, handler):
            handlers[number] = handler
            return signal.SIG_DFL
        def start():
            handlers[signal.SIGTERM](signal.SIGTERM, None)
            return display
        launch = Mock()
        with patch.object(module.signal, 'signal', side_effect=register):
            self.assertEqual(module.supervise_game(launch, start), 143)
        launch.assert_not_called()
        display.close.assert_called_once()
        self.assertEqual(handlers[signal.SIGTERM], signal.SIG_DFL)
        self.assertEqual(handlers[signal.SIGINT], signal.SIG_DFL)

    def test_failed_engine_spawn_closes_display_and_restores_handlers(self):
        display = Mock(environment={'DISPLAY': ':1000'})
        before = {number: signal.getsignal(number) for number in (signal.SIGTERM, signal.SIGINT)}
        with self.assertRaisesRegex(OSError, 'spawn failed'):
            module.supervise_game(Mock(side_effect=OSError('spawn failed')), lambda: display)
        display.close.assert_called_once()
        for number, handler in before.items():
            self.assertEqual(signal.getsignal(number), handler)

    def test_running_cancellation_stops_engine_before_closing_display(self):
        events = []
        display = Mock(environment={'DISPLAY': ':1000'})
        display.process.poll.return_value = None
        display.close.side_effect = lambda: events.append('display closed')
        game = Mock()
        game.poll.side_effect = [None, 0]
        game.terminate.side_effect = lambda: events.append('game stopped')
        def launch(environment):
            self.assertEqual(environment, display.environment)
            signal.getsignal(signal.SIGINT)(signal.SIGINT, None)
            return game
        self.assertEqual(module.supervise_game(launch, lambda: display), 143)
        self.assertEqual(events, ['game stopped', 'display closed'])
        game.wait.assert_called_once_with(timeout=10)

    def test_unexpected_wait_failure_still_closes_display(self):
        display = Mock(environment={})
        display.process.poll.return_value = 1
        game = Mock()
        game.poll.return_value = None
        game.wait.side_effect = OSError('wait failed')
        with self.assertRaisesRegex(OSError, 'wait failed'):
            module.supervise_game(lambda _: game, lambda: display)
        game.kill.assert_called_once()
        display.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
