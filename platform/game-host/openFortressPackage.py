"""Assemble only the reviewed SDK/mod pair; never consume private server files."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

ARCHIVE_SHA = "4ac3451e099e8057af5e5ebe765c3b90fb5e6afdaeedaeb9d7a0ea47eb609b1e"
ARCHIVE_BYTES = 2617348367
SDK_BUILD = "6982827"
ALIASES = ["datacache", "dedicated", "engine", "materialsystem", "replay", "scenefilecache", "shaderapiempty", "soundemittersystem", "studiorender", "vphysics"]


def entries_from_listing(text):
    if len(text.encode()) > 16 * 1024**2 or "----------\n" not in text:
        raise ValueError("Open Fortress archive listing is invalid")
    entries, seen, total = [], set(), 0
    for block in text.split("----------\n", 1)[1].strip().split("\n\n"):
        fields = {}
        for line in block.splitlines():
            if " = " not in line:
                continue
            key, value = line.split(" = ", 1)
            if key in fields:
                raise ValueError("Duplicate archive metadata")
            fields[key] = value
        name = fields.get("Path", "")
        if (not name or "\\" in name or re.search(r"[\x00-\x1f\x7f]", name) or any(part in ("", ".", "..") for part in name.split("/"))
                or not (name == "open_fortress" or name.startswith("open_fortress/"))
                or name in seen or any(key in fields for key in ("Symbolic Link", "Hard Link"))
                or fields.get("Encrypted") != "-"):
            raise ValueError("Unsafe Open Fortress archive path")
        kind = fields.get("Attributes", "").split()[-1:]
        if not kind or not re.fullmatch(r"[d-][rwx-]{9}", kind[0]):
            raise ValueError("Unsupported Open Fortress archive member")
        size = int(fields.get("Size", "-1"))
        if not 0 <= size < 2 * 1024**3 or (kind[0][0] == "d" and size != 0):
            raise ValueError("Invalid Open Fortress archive size")
        seen.add(name)
        total += size
        entries.append((name, size, kind[0][0]))
        if len(entries) > 30000 or total > 10 * 1024**3:
            raise ValueError("Open Fortress archive exceeds review limits")
    if not entries:
        raise ValueError("Empty Open Fortress archive")
    # Reject file-as-parent collisions before extracting any member.
    files = {name for name, _, kind in entries if kind == "-"}
    for name, _, _ in entries:
        if any(str(parent) in files for parent in PurePosixPath(name).parents if str(parent) != "."):
            raise ValueError("Open Fortress archive has a file as a parent")
    return entries, total


def real_directory(folder):
    if folder.resolve() != folder or folder.is_symlink() or not folder.is_dir():
        raise ValueError("Open Fortress requires a real directory")


def verify_sdk_manifest(text):
    for key, value in [("appid", "244310"), ("buildid", SDK_BUILD), ("BetaKey", "previous2021"), ("StateFlags", "4")]:
        values = re.findall(r'"' + key + r'"\s+"([^"]*)"', text, re.I)
        # Steam repeats BetaKey in UserConfig and MountedConfig. Both must agree.
        if not values or any(found != value for found in values) or (key != "BetaKey" and len(values) != 1) or len(values) > 2:
            raise ValueError("Open Fortress requires its reviewed previous2021 SDK build")


def assemble(sdk, archive, output):
    if os.geteuid() == 0:
        raise ValueError("Open Fortress package assembly must be unprivileged")
    sdk, archive, output = Path(sdk), Path(archive), Path(output)
    real_directory(sdk)
    real_directory(output.parent)
    if (sdk.parent != output.parent or sdk.name != "source-sdk" or output.name != "runtime"
            or not re.fullmatch(r"(?:\.pb-update-open-fortress-|openfortress-build-review-)[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}", output.parent.name)):
        raise ValueError("Open Fortress requires an isolated package staging root")
    if output.exists() or output.is_symlink() or output == sdk or output.is_relative_to(sdk) or sdk.is_relative_to(output):
        raise ValueError("Open Fortress output must be a new isolated directory")
    if archive.resolve() != archive or archive.is_symlink() or not archive.is_file() or archive.stat().st_nlink != 1 or archive.stat().st_size != ARCHIVE_BYTES:
        raise ValueError("Open Fortress requires the reviewed publisher archive")
    with archive.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != ARCHIVE_SHA:
            raise ValueError("Open Fortress publisher checksum differs from review")
    manifest = sdk / "steamapps/appmanifest_244310.acf"
    if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size > 65536:
        raise ValueError("Open Fortress SDK manifest is unavailable")
    text = manifest.read_text()
    verify_sdk_manifest(text)
    listing = subprocess.run(["/usr/bin/7z", "l", "-slt", str(archive)], check=True, timeout=60, stdout=subprocess.PIPE).stdout.decode()
    entries, expanded = entries_from_listing(listing)
    disk = os.statvfs(output.parent)
    if disk.f_bavail * disk.f_frsize - expanded < max(8 * 1024**3, disk.f_blocks * disk.f_frsize // 10) + 512 * 1024**2:
        raise ValueError("Insufficient space for reviewed Open Fortress extraction")
    output.mkdir(mode=0o700)
    subprocess.run(["/usr/bin/7z", "x", "-mmt=1", "-y", "-bb0", str(archive), "-o" + str(output)], check=True, timeout=600, stdout=subprocess.DEVNULL)
    for name, size, kind in entries:
        member = output / name
        if member.is_symlink() or not member.resolve().is_relative_to(output):
            raise ValueError("Open Fortress extracted an unsafe member")
        if kind == "-" and (not member.is_file() or member.stat().st_nlink != 1 or member.stat().st_size != size):
            raise ValueError("Open Fortress extracted a changed member")
        if kind == "d" and not member.is_dir():
            raise ValueError("Open Fortress extracted a changed directory")
        member.chmod(0o755 if kind == "d" else 0o644)
    for name in ["bin", "hl2", "platform"]:
        source = sdk / name
        real_directory(source)
        for member in source.rglob("*"):
            if member.is_symlink() or (not member.is_file() and not member.is_dir()):
                raise ValueError("Unreviewed SDK link or special file")
        # Consume only this isolated SDK download; never a live installation.
        shutil.move(str(source), output / name)
    for name in ["srcds_linux", "thirdpartylegalnotices.txt"]:
        source = sdk / name
        if source.is_symlink() or not source.is_file() or source.stat().st_nlink != 1:
            raise ValueError("Unreviewed SDK launcher file")
        shutil.copyfile(source, output / name)
    mod = output / "open_fortress"
    defaults = output / "defaults"
    defaults.mkdir()
    shutil.move(str(mod / "cfg"), defaults / "cfg")
    for member in (defaults / "cfg").rglob("*"):
        if member.is_file() and (member.name in ["server.cfg", "config.cfg"] or member.name.endswith(".review-original")):
            member.unlink()
    (defaults / "cfg/server.cfg").write_text("// Private PlayBound server configuration.\n")
    for name in ["modelsounds.cache", "console.log", "console_prev.log", "download", "downloadlists", "custom", "logs", "replay", "cache"]:
        target = mod / name
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
    console = output / "bin/console.log"
    if console.exists():
        console.unlink()
    for name in ALIASES:
        source, target = output / f"bin/{name}_srv.so", output / f"bin/{name}.so"
        if not target.exists():
            shutil.copyfile(source, target)
    server = mod / "bin/server.so"
    if not (mod / "bin/server_srv.so").exists():
        shutil.copyfile(server, mod / "bin/server_srv.so")
    info = mod / "gameinfo.txt"
    lines = []
    for line in info.read_text().splitlines():
        marker = "|all_source_engine_paths|..\\Team Fortress 2\\"
        if marker in line:
            line = line.replace(marker, "/opt/playbound-host/games/team-fortress-2/").replace("\\", "/")
        elif "|all_source_engine_paths|hl2\\" in line:
            line = line.replace("\\", "/")
        lines.append(line)
    info.write_text("\n".join(lines) + "\n")
    (output / "sdk-build.json").write_text(json.dumps({"appId": 244310, "branch": "previous2021", "buildId": SDK_BUILD, "modArchiveSha256": ARCHIVE_SHA}))
    for member in output.rglob("*"):
        if member.is_symlink():
            raise ValueError("Package assembly produced a link")
        if member.is_dir():
            member.chmod(0o755)
        elif member.is_file() and member.stat().st_nlink == 1:
            with member.open("rb") as source:
                executable = source.read(4) == b"\x7fELF"
            member.chmod(0o755 if executable else 0o644)
        else:
            raise ValueError("Package assembly produced a special file")
    output.chmod(0o755)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Expected isolated SDK, reviewed archive and fresh output")
    assemble(*sys.argv[1:])
