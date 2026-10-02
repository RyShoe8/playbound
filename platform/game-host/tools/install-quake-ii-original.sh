#!/usr/bin/env bash
# Stage licensed Quake II (Original) game data for the Yamagi dedicated server.
# Pass the baseq2 directory from a purchased Original installation, not the
# 2023 rerelease directory. Run as root after installing yamagi-quake2-core.
set -euo pipefail

source_dir="${1:?Pass the licensed Quake II (Original) baseq2 directory}"
root="${GAME_HOST_GAMES_DIR:-/opt/playbound-host/games}"
dest="$root/quake-ii-original"
engine=/usr/lib/yamagi-quake2/q2ded
game_module=/usr/lib/yamagi-quake2/baseq2/game.so

[[ -f "$source_dir/pak0.pak" ]] || { echo "Original baseq2/pak0.pak not found" >&2; exit 1; }
[[ -x "$engine" && -f "$game_module" ]] || { echo "Install Ubuntu's yamagi-quake2-core package first" >&2; exit 1; }
[[ ! -e "$dest" ]] || { echo "Destination exists: $dest" >&2; exit 1; }

install -d -o playbound -g playbound "$root"
stage="$(mktemp -d "$root/.quake-ii-original.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
install -d -m 750 -o playbound -g playbound "$stage/baseq2"
found=0
for pak in "$source_dir"/pak*.pak; do
  [[ -f "$pak" ]] || continue
  install -m 640 -o playbound -g playbound "$pak" "$stage/baseq2/$(basename "$pak")"
  found=$((found + 1))
done
[[ "$found" -gt 0 ]] || { echo "No Original .pak files found" >&2; exit 1; }
ln -s "$game_module" "$stage/baseq2/game.so"
chown playbound:playbound "$stage"
mv -- "$stage" "$dest"
echo "Quake II Original server data installed at $dest"
