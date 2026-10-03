#!/usr/bin/env bash
# Install the Battlefield 1942 Linux dedicated distribution for VPS testing.
# The archive is a community mirror of the DICE server; checksum is pinned.
# Existing installations are never replaced by this script.
set -euo pipefail

root="${GAME_HOST_GAMES_DIR:-/opt/playbound-host/games}"
dest="$root/battlefield-1942-anthology"
url='https://files.bf1942.online/server/linux/linux-bf1942-server.tar'
sha256='6b6a2fc293385636881474dff37f248b67df299431797d43050725c2f0938b8e'

if [[ -e "$dest" ]]; then
  echo "Battlefield 1942 already exists at $dest; leaving it unchanged"
  exit 0
fi

work="$(mktemp -d /tmp/playbound-bf1942.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
curl --fail --location --retry 3 --connect-timeout 20 --max-time 1800 \
  --silent --show-error "$url" -o "$work/server.tar"
printf '%s  %s\n' "$sha256" "$work/server.tar" | sha256sum --check --status

mkdir -p "$work/stage"
tar -xf "$work/server.tar" -C "$work/stage" --strip-components=1 --no-same-owner
test -f "$work/stage/mods/bf1942/settings/serversettings.con"
test -f "$work/stage/mods/bf1942/settings/maplist.con"
test -d "$work/stage/mods/bf1942/archives"
test -f "$work/stage/bf1942_lnxded.static"
chmod 755 "$work/stage/bf1942_lnxded.static" "$work/stage/bf1942_lnxded.dynamic"
install -d -o playbound -g playbound "$root"
chown -R playbound:playbound "$work/stage"
mv -- "$work/stage" "$dest"
echo "Battlefield 1942 dedicated files installed at $dest"
