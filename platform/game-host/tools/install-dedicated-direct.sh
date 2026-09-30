#!/usr/bin/env bash
# Install public first-party dedicated distributions into the game-host tree.
# Each target is new; never replace a running installation in place.
set -uo pipefail
root="${GAME_HOST_GAMES_DIR:-/opt/playbound-host/games}"
work="$(mktemp -d /tmp/playbound-dedicated.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
failures=0

install_archive() {
  local slug="$1" url="$2" kind="$3" expected="$4" strip="${5:-0}"
  local dest="$root/$slug" stage="$work/$slug" archive="$work/$slug.archive"
  if [[ -e "$dest" ]]; then echo "SKIP $slug: destination exists"; return 0; fi
  mkdir -p "$stage"
  echo "Downloading $slug"
  if ! curl --fail --location --retry 3 --connect-timeout 20 --max-time 1800 \
      --silent --show-error "$url" -o "$archive"; then
    echo "FAILED $slug: download" >&2; return 1
  fi
  case "$kind" in
    zip) unzip -q "$archive" -d "$stage" || return 1 ;;
    tar.xz) tar -xJf "$archive" -C "$stage" --strip-components="$strip" || return 1 ;;
    tar.gz) tar -xzf "$archive" -C "$stage" --strip-components="$strip" || return 1 ;;
    *) echo "Unsupported archive type" >&2; return 1 ;;
  esac
  if [[ ! -e "$stage/$expected" ]]; then
    echo "FAILED $slug: expected $expected missing" >&2; return 1
  fi
  # Terraria's official ZIP does not preserve the Linux executable bit.
  if [[ "$slug" == "terraria" ]]; then chmod 755 "$stage/$expected"; fi
  chown -R playbound:playbound "$stage"
  install -d -o playbound -g playbound "$root"
  mv -- "$stage" "$dest"
  echo "OK $slug"
}

install_archive factorio \
  'https://factorio.com/get-download/stable/headless/linux64' tar.xz \
  bin/x64/factorio 1 || failures=$((failures + 1))
install_archive rimworld-together \
  'https://github.com/RimWorld-Together/Rimworld-Together/releases/download/26.8.31.1/Server-linux-x64.zip' \
  zip RTServer || failures=$((failures + 1))
install_archive terraria \
  'https://terraria.org/api/download/pc-dedicated-server/terraria-server-1458.zip' \
  zip 1458/Linux/TerrariaServer.bin.x86_64 || failures=$((failures + 1))
install_archive trackmania \
  'https://nadeo-download.cdn.ubi.com/trackmania/TrackmaniaServer_Latest.zip' \
  zip TrackmaniaServer || failures=$((failures + 1))

echo "$failures direct installations failed"
exit "$failures"
