#!/usr/bin/env bash
# Operator-only. Supply a privately owned Soldier of Fortune GOG installation;
# only its PAK data is copied to the VPS. Nothing is placed in the public archive.
# Usage: sudo bash provision-openmerc.sh /private/path/to/Soldier-of-Fortune
set -euo pipefail

if [[ "$(id -u)" -ne 0 || $# -ne 1 ]]; then
  echo "Usage: sudo bash provision-openmerc.sh /private/path/to/Soldier-of-Fortune" >&2
  exit 2
fi

source_dir="$(realpath "$1")"
root="${GAME_HOST_GAMES_DIR:-/opt/playbound-host/games}"
dest="$root/soldier-of-fortune-platinum-edition"
if [[ -e "$dest" ]]; then
  echo "openMERC is already installed at $dest; leaving it unchanged"
  exit 0
fi
for file in pak0.pak pak1.pak pak2.pak pak3.pak gs.pak; do
  test -f "$source_dir/base/$file" || { echo "Missing private game data: $file" >&2; exit 2; }
done
printf '%s  %s\n' \
  '14138a0d3d9bdefd507015b4a80d06e66de4b0f2f1c3ee7af49cae73f3e0ec05' "$source_dir/base/pak0.pak" \
  '46a4027c830060f405833c3ee8e1c1ab6400449f817deb8dae6d577082645a5e' "$source_dir/base/pak1.pak" \
  '418517b10ca275d3b21ab9aa7d2b20f8810a027058b6bf33bac9b5526acf134f' "$source_dir/base/pak2.pak" \
  'd72940364fbf523dd7ea208d1a51a56e0b55fab65ab2342a102d6f02d43dc970' "$source_dir/base/pak3.pak" \
  'cd86986026a994c7aeec5bae5a633880661c0abda3be35b61b2b1a4d060898ce' "$source_dir/base/gs.pak" | sha256sum --check --status

if [[ ! -d "$root" ]]; then install -d -o root -g playbound -m 750 "$root"; fi
work="$(mktemp -d "$root/.openmerc-stage.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT
curl --fail --location --retry 3 --connect-timeout 20 --max-time 600 \
  --silent --show-error \
  'https://github.com/sidreshot/openMERC/releases/download/v0.2.2/openMERC-0.2.2-linux-x86_64.tar.gz' \
  -o "$work/openmerc.tar.gz"
printf '%s  %s\n' '880e3186e25007d51934261b89e1204f18c082c70c4ea484f8a3156e0446c8da' "$work/openmerc.tar.gz" | sha256sum --check --status
tar -xzf "$work/openmerc.tar.gz" -C "$work" --no-same-owner
mkdir -m 750 "$work/base"
for file in pak0.pak pak1.pak pak2.pak pak3.pak gs.pak; do
  cp --reflink=auto -- "$source_dir/base/$file" "$work/base/$file"
done
for file in openMerc-ded openmerc/gamex86.so openmerc/player.so openmerc/zz_openmerc.pak base/pak0.pak; do
  test -f "$work/$file" || { echo "Incomplete openMERC package: $file" >&2; exit 1; }
done
rm -f -- "$work/openmerc.tar.gz"
chown -R root:playbound "$work"
find "$work" -type d -exec chmod 750 {} +
find "$work" -type f -exec chmod 640 {} +
chmod 550 "$work/openMerc-ded"
mv -- "$work" "$dest"
trap - EXIT
echo "Private openMERC 0.2.2 dedicated files installed at $dest"
