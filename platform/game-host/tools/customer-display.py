"""Candidate private Xvfb supervisor. Used only by unenrolled game candidates.

Requires the matching enforced AppArmor label before any socket or process is
created. The display entry point accepts no caller executable, display number, command,
geometry or environment. Game lifetime callbacks are internal trusted code. Existing seccomp policy is intentionally unchanged.
"""
import os
import fcntl
from pathlib import Path
import secrets
import signal
import socket
import stat
import struct
import subprocess
import time
import tempfile

DISPLAY_ROOT = Path('/server/.display')


def allocation(uid):
    if type(uid) is not int or not 40000 <= uid <= 40255:
        raise ValueError('Reserved display UID required')
    return 'playbound-customer-ipc-'+str(uid), 1000+uid-40000


def verify_current():
    uid = os.getuid()
    name, display = allocation(uid)
    if Path('/proc/self/attr/current').read_text().strip() != name+' (enforce)':
        raise ValueError('Enforced matching private IPC label required')
    return uid, display


def authority(cookie, display):
    if not isinstance(cookie, bytes) or len(cookie) != 16 or type(display) is not int or not 1000 <= display <= 1255:
        raise ValueError('Invalid private display authority')
    # FamilyWild avoids reliance on the container hostname. The file and cookie
    # are private; Xvfb listens only on Unix sockets, never on a TCP port.
    fields = (b'', str(display).encode('ascii'), b'MIT-MAGIC-COOKIE-1', cookie)
    return struct.pack('>H', 65535)+b''.join(struct.pack('>H', len(field))+field for field in fields)


def private_directory(uid):
    directory = DISPLAY_ROOT
    directory.mkdir(mode=0o700, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise ValueError('Unsafe private display directory')
    return directory


def acquire_lock(uid):
    directory = private_directory(uid)
    descriptor = os.open(directory/'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size:
            raise ValueError('Unsafe private display lock')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def write_authority(uid, display, cookie):
    directory = private_directory(uid)
    filename = directory/'Xauthority'
    try:
        info = filename.lstat()
    except FileNotFoundError:
        pass
    else:
        if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_nlink != 1 or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError('Unsafe retained display authority')
    # The caller holds the private session lock. A crashed session's authority
    # may be replaced, but a link or another owner's file is never followed.
    descriptor, temporary = tempfile.mkstemp(prefix='.authority-', dir=directory)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(authority(cookie, display))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, filename)
        parent = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return filename


def authenticated_ready(uid, display, cookie):
    endpoint = Path('/tmp/.X11-unix')/('X'+str(display))
    try:
        info = endpoint.lstat()
    except FileNotFoundError:
        return False
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != uid:
        raise ValueError('Unsafe private display socket')
    name = b'MIT-MAGIC-COOKIE-1'
    packet = struct.pack('<BBHHHHH', 0x6c, 0, 11, 0, len(name), len(cookie), 0)
    packet += name+b'\0'*((-len(name)) % 4)+cookie
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(0.25)
        try:
            connection.connect(str(endpoint))
            connection.sendall(packet)
            header = b''
            while len(header) < 8:
                block = connection.recv(8-len(header))
                if not block:
                    return False
                header += block
        except (TimeoutError, ConnectionRefusedError, ConnectionResetError):
            return False
    return header[0] == 1 and struct.unpack_from('<H', header, 2)[0] == 11


class PrivateDisplay:
    def __init__(self, process, filename, display, lock):
        self.process = process
        self.lock = lock
        self.filename = filename
        self.environment = {'DISPLAY': ':'+str(display), 'XAUTHORITY': str(filename)}

    def close(self):
        if self.lock is None:
            return
        try:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=2)
        finally:
            try:
                self.filename.unlink(missing_ok=True)
            finally:
                if self.lock is not None:
                    os.close(self.lock)
                    self.lock = None


def start():
    uid, display = verify_current()
    cookie = secrets.token_bytes(16)
    lock = acquire_lock(uid)
    filename = None
    process = None
    try:
        filename = write_authority(uid, display, cookie)
        process = subprocess.Popen(['/usr/bin/Xvfb', ':'+str(display), '-screen', '0',
            '640x480x24', '-nolisten', 'tcp', '-auth', str(filename), '-noreset'],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            cwd='/server', env={'PATH': '/usr/bin:/bin', 'HOME': '/server', 'LANG': 'C.UTF-8'},
            close_fds=True)
        deadline = time.monotonic()+10
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise ValueError('Private display exited before readiness')
            if authenticated_ready(uid, display, cookie):
                return PrivateDisplay(process, filename, display, lock)
            time.sleep(0.05)
        raise ValueError('Private display readiness timed out')
    except BaseException:
        if process is not None:
            PrivateDisplay(process, filename, display, lock).close()
        else:
            try:
                if filename is not None:
                    filename.unlink(missing_ok=True)
            finally:
                os.close(lock)
        raise


def supervise_game(launch, display_factory=None):
    """Internal trusted-bootstrap callback; never exposed as an operation endpoint.

    A fixed game bootstrap constructs its own argv/env. This function only owns
    display/game lifetime and never reads a command from configuration or stdin.
    """
    if not callable(launch) or (display_factory is not None and not callable(display_factory)):
        raise ValueError('Trusted game/display factory required')
    if display_factory is None:
        display_factory = start
    game = None
    display = None
    stopping = False
    previous = {}
    def stop(_signal, _frame):
        nonlocal stopping
        stopping = True
    try:
        for number in (signal.SIGTERM, signal.SIGINT):
            previous[number] = signal.signal(number, stop)
        display = display_factory()  # refuses a missing/wrong enforced IPC label
        if stopping:
            return 143
        game = launch(display.environment)
        while game.poll() is None:
            if stopping or display.process.poll() is not None:
                game.terminate()
                try:
                    game.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    game.kill()
                    game.wait(timeout=2)
                return 143 if stopping else 1
            time.sleep(0.1)
        return game.returncode if game.returncode >= 0 else 1
    finally:
        try:
            if game is not None and game.poll() is None:
                game.kill()
                game.wait(timeout=2)
        finally:
            try:
                if display is not None:
                    display.close()
            finally:
                for number, handler in previous.items():
                    signal.signal(number, handler)
