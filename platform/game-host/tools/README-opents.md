# OpenTS complete package

`build-opents-package.py` combines the OpenTS **v0.1.0** release with the
Tiberian Sun 2.03/Firestorm freeware data from the installer and three disc
downloads listed on [C&C Communications Center](https://cnc-comm.com/tiberian-sun/downloads/the-game).
The upstream engine ZIP alone does not contain game assets and cannot start a
clean installation.

## Building on the Linux VPS

Use a staging directory outside the public archive. Download the six files
listed in the script's `SOURCES`. Requires Python 3, `innoextract`, `unzip`,
and root access for read-only ISO mounts.

1. Extract `TSinstaller.exe` with `innoextract -e TSinstaller.exe`; this
   produces `app/`. Do not run the installer.
2. Unzip the three disc downloads into `gdi/`, `nod/`, and `firestorm/`.
3. Mount their ISO files read-only at `disc-gdi/`, `disc-nod/`, and
   `disc-firestorm/` using `mount -o loop,ro`. The current 7-Zip ISO reader
   reports empty discs; Linux ISO mounts expose the files correctly.
4. Run `python3 build-opents-package.py STAGING OUTPUT.zip`.
5. Unmount all three discs, even if building fails.

The builder checks required archives, verifies every ZIP entry's CRC, and
renames a temporary `.partial` file only after verification. It keeps the
installer's updated MIX archives and fills missing campaigns, music, movies,
and World Domination Tour data from the discs. Legacy binaries, injected DLLs,
and loose modified rules are excluded. OpenTS's `Game.exe` and `Language.dll`
sit beside the data at the ZIP root. Original documentation, the EA license,
the matching OpenTS source archive/license, and source URLs/SHA-256 hashes are
included. `Game.pdb` is not needed to play and is excluded.

## Published September 18, 2026

- VPS: `/opt/playbound-host/archive/launcher-packages/games/opents/OpenTS-v0.1.0-Complete.zip`
- URL: `https://mirror.playbound.club/launcher-packages/games/opents/OpenTS-v0.1.0-Complete.zip`
- Download: **1,384,724,784 bytes**; extracted: **1,702,189,494 bytes**.
- SHA-256: `8c32182c73d632033aa897ab9dfc27fd4ded611558be6e68111193c97d7c967d`
- Game and official edition recipes were updated through Admin to `direct-zip`,
  filename `OpenTS-v0.1.0-Complete.zip`, version `v0.1.0-complete`.
- Automatic engine-only URL replacement is disabled for the game recipe.

Production MongoDB remains authoritative; these changes were not seeded over
the catalog. Existing engine-only installs need the new package installed.
Verification covered required contents, all ZIP CRCs, and public HTTP delivery;
a Windows game launch still needs to be confirmed.
