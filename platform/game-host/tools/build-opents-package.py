"""Build OpenTS + Tiberian Sun/Firestorm data from already extracted sources.

Usage: python3 build-opents-package.py STAGING OUTPUT.zip
STAGING contains app/ (innoextract TSinstaller.exe), disc-gdi/, disc-nod/,
disc-firestorm/ (read-only ISO mounts), engine.zip and engine-source.tar.gz.
No installer is executed. Only game archives and documentation are copied.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = "https://downloads.cnc-comm.com/tiberian-sun/"
SOURCES = {
    "TSinstaller.exe": ROOT + "tsins/TSinstaller.exe",
    "TS_GDI.zip": ROOT + "iso/TS_GDI.zip",
    "TS_Nod.zip": ROOT + "iso/TS_Nod.zip",
    "TS_Firestorm.zip": ROOT + "iso/TS_Firestorm.zip",
    "engine.zip": "https://github.com/OpenTS-Developers/OpenTS/releases/download/v0.1.0/OpenTS-v0.1.0.zip",
    "engine-source.tar.gz": "https://codeload.github.com/OpenTS-Developers/OpenTS/tar.gz/refs/tags/v0.1.0",
}


def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build(staging, output):
    files = {}
    # Preserve the installer's updated 2.03/Firestorm archives. Exclude legacy
    # DLL injection, executables and loose modified rules from that installer.
    for file in (staging / "app").glob("*"):
        if file.suffix.lower() == ".mix":
            files[file.name.upper()] = file
    for disc in ("disc-gdi", "disc-nod", "disc-firestorm"):
        for file in (staging / disc).glob("*"):
            if file.suffix.lower() == ".mix":
                files.setdefault(file.name.upper(), file)
        for directory in (staging / disc).iterdir():
            if directory.is_dir() and directory.name.lower() == "install":
                for file in directory.glob("*"):
                    if file.suffix.lower() == ".mix":
                        files.setdefault(file.name.upper(), file)
    for file in (staging / "app" / "Documentation").glob("*"):
        if file.is_file():
            files["Documentation/" + file.name] = file
    required = {
        "TIBSUN.MIX", "EXPAND01.MIX", "PATCH.MIX", "GMENU.MIX", "MULTI.MIX",
        "MAPS01.MIX", "MAPS02.MIX", "MAPS03.MIX", "SIDECD01.MIX", "SIDECD02.MIX",
        "E01SCD01.MIX", "E01SCD02.MIX", "SCORES.MIX", "SCORES01.MIX",
        "MOVIES01.MIX", "MOVIES02.MIX", "MOVIES03.MIX",
    }
    if missing := required - files.keys():
        raise RuntimeError("Missing game data: " + ", ".join(sorted(missing)))
    provenance = {name: {"url": url, "sizeBytes": (staging / name).stat().st_size,
                          "sha256": sha256(staging / name)} for name, url in SOURCES.items()}
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_suffix(".partial")
    with zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for name, file in sorted(files.items()):
            package.write(file, name)
        with zipfile.ZipFile(staging / "engine.zip") as engine:
            for name in ("Game.exe", "Language.dll"):
                package.writestr(name, engine.read(name))
        package.write(staging / "engine-source.tar.gz", "Documentation/OpenTS-v0.1.0-source.tar.gz")
        package.writestr("SUN.INI", "[Options]\nNoCD=yes\n[Video]\nScreenWidth=1280\nScreenHeight=720\nStretchMovies=true\n")
        package.writestr("Documentation/package-sources.json", json.dumps(provenance, indent=2) + "\n")
        package.writestr("README-PlayBound.txt", "OpenTS v0.1.0 with Tiberian Sun 2.03 + Firestorm game data.\n"
                        "Run Game.exe from this directory. Campaigns, music and movies are included.\n"
                        "Game data: https://cnc-comm.com/tiberian-sun/downloads/the-game/installer\n"
                        "Engine: https://github.com/OpenTS-Developers/OpenTS/tree/v0.1.0\n"
                        "OpenTS source and its license/notices are in Documentation/OpenTS-v0.1.0-source.tar.gz.\n"
                        "Original game documentation and EA license are in Documentation/.\n")
    with zipfile.ZipFile(partial) as package:
        if bad := package.testzip():
            raise RuntimeError("CRC verification failed: " + bad)
        if not required <= set(package.namelist()):
            raise RuntimeError("Package lost required data")
    partial.replace(output)
    print(json.dumps({"file": str(output), "sizeBytes": output.stat().st_size,
                      "sha256": sha256(output), "dataFiles": len(files)}, indent=2))


if __name__ == "__main__":
    build(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
