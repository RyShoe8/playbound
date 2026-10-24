"""Build a local, portable Grid Leader Windows test archive.

This deliberately does not upload or change the catalog. Grid Leader is still
being evaluated; a working archive is not a publication decision.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile


UPSTREAM = "https://github.com/jonathanopalise/grid-leader.git"
REVISION = "f266f20d5776f4f5517f76f0b71990db4ae3dcdf"
PANDA3D = "panda3d==1.10.16"
PYINSTALLER = "pyinstaller==6.16.0"
ASSET_DIRS = ("data", "fonts", "models", "music", "sounds", "textures")
ASSET_FILES = ("fuji.xml", "Config.prc", "highscores.txt")


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"Expected one occurrence in {path.name}: {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path.home() / "Downloads" / "GridLeader-PlayBound-test-win64.zip",
    )
    args = parser.parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="playbound-grid-leader-") as temp:
        work = Path(temp)
        if work.resolve().parent != Path(tempfile.gettempdir()).resolve():
            raise RuntimeError("Build directory escaped the expected temporary directory")
        source = work / "source"
        subprocess.run(["git", "clone", "--quiet", UPSTREAM, str(source)], check=True)
        subprocess.run(["git", "checkout", "--quiet", REVISION], cwd=source, check=True)
        actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
        if actual != REVISION:
            raise RuntimeError(f"Unexpected upstream revision: {actual}")

        replace_once(source / "trackgeometry.py", 'print "approximate length",approximateLength',
                     'print("approximate length", approximateLength)')
        config = source / "Config.prc"
        replace_once(config, "load-display pandadx9", "load-display pandagl")
        replace_once(config, "audio-library-name p3fmod_audio", "audio-library-name p3openal_audio")
        with config.open("a", encoding="utf-8") as file:
            file.write("\ndefault-model-extension .egg\n")

        main_py = source / "main.py"
        replace_once(main_py, "from panda3d.core import loadPrcFileData", """import os, sys
if getattr(sys, 'frozen', False):
    os.chdir(os.path.dirname(sys.executable))
    os.environ['PATH'] = os.path.join(sys._MEIPASS, 'panda3d') + os.pathsep + os.environ.get('PATH', '')
from panda3d.core import loadPrcFileData, loadPrcFile, Filename
if getattr(sys, 'frozen', False):
    loadPrcFile(Filename.fromOsSpecific(os.path.join(sys._MEIPASS, 'Config.prc')))""")
        replace_once(main_py, "\t\tbase.makeDefaultPipe()", "\t\tif base.pipe is None:\n\t\t\tbase.makeDefaultPipe()")
        replace_once(main_py, "props.setSize(width,height)", "props.setSize(min(width, 1280), min(height, 720))")
        replace_once(main_py, "props.setFullscreen(True)", "props.setFullscreen(False)")
        replace_once(main_py, "PStatClient.connect()", "# PStats disabled for the portable build")
        replace_once(main_py, "\nrun()", "\nbase.run()")

        venv = work / "venv"
        subprocess.run([sys.executable, "-m", "venv", str(venv)], check=True)
        python = venv / "Scripts" / "python.exe"
        subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check",
                        PANDA3D, PYINSTALLER], check=True)
        subprocess.run([str(python), "-m", "compileall", "-q", str(source)], check=True)
        build = work / "build"
        dist = work / "dist"
        command = [
            str(python), "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir",
            "--name", "GridLeader", "--distpath", str(dist), "--workpath", str(build),
            "--specpath", str(source), "--hidden-import", "pandac.PandaModules",
            "--hidden-import", "panda3d.core", "--collect-binaries", "panda3d",
        ]
        for name in (*ASSET_DIRS, *ASSET_FILES):
            command += ["--add-data", f"{name};{name if name in ASSET_DIRS else '.'}"]
        command.append("main.py")
        subprocess.run(command, cwd=source, check=True)

        game = dist / "GridLeader"
        for name in ASSET_DIRS:
            shutil.copytree(game / "_internal" / name, game / name)
        for name in ("fuji.xml", "highscores.txt"):
            shutil.copy2(game / "_internal" / name, game / name)
        licenses = list((venv / "Lib" / "site-packages").glob("panda3d-*.dist-info/LICENSE.txt"))
        if len(licenses) != 1:
            raise RuntimeError("Panda3D license notice not found in the build environment")
        shutil.copy2(licenses[0], game / "Panda3D-LICENSE.txt")
        (game / "PlayBound-build.txt").write_text(
            "Grid Leader - PlayBound Windows test build\n"
            f"Game source: {UPSTREAM} at {REVISION}\n"
            f"Runtime: {PANDA3D}; package tool: {PYINSTALLER}\n"
            "This compatibility build is for evaluating the game in PlayBound testing.\n"
            "The original project does not include a license file in its repository.\n"
            "Panda3D's license is included separately as Panda3D-LICENSE.txt.\n",
            encoding="utf-8",
        )
        if not (game / "GridLeader.exe").is_file():
            raise RuntimeError("No runnable executable in the build")
        if not (game / "models" / "titlescreentrack.egg").is_file():
            raise RuntimeError("Game models were not packaged")

        partial = output.with_name(output.name + ".partial")
        try:
            with ZipFile(partial, "w", ZIP_DEFLATED, compresslevel=6) as archive:
                for path in game.rglob("*"):
                    if path.is_file():
                        archive.write(path, Path("GridLeader") / path.relative_to(game))
            with ZipFile(partial) as archive:
                if archive.testzip() is not None:
                    raise RuntimeError("Archive CRC check failed")
                if "GridLeader/GridLeader.exe" not in archive.namelist():
                    raise RuntimeError("Archive executable is missing")
                if "GridLeader/Panda3D-LICENSE.txt" not in archive.namelist():
                    raise RuntimeError("Panda3D license notice is missing")
            partial.replace(output)
        finally:
            if partial.exists():
                partial.unlink()
    print(f"Test package: {output} ({output.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
