#!/usr/bin/env bash
# Install freely downloadable paid-plan server tools. Run on the VPS as root;
# SteamCMD itself runs as the unprivileged playbound service user.
set -uo pipefail

games_root="${GAME_HOST_GAMES_DIR:-/opt/playbound-host/games}"
steamcmd_bin="/usr/games/steamcmd"
if [[ ! -x "$steamcmd_bin" ]]; then
  echo "system SteamCMD is required at $steamcmd_bin" >&2
  exit 1
fi

install_app() {
  local slug="$1" appid="$2"
  local target="$games_root/$slug"
  install -d -o playbound -g playbound "$target"
  echo "Installing $slug (Steam app $appid)"
  if timeout 35m runuser -u playbound -- "$steamcmd_bin" \
      +force_install_dir "$target" +login anonymous +app_update "$appid" validate +quit; then
    echo "OK $slug"
  else
    echo "FAILED $slug" >&2
    return 1
  fi
}

failures=0
while read -r slug appid; do
  [[ -z "$slug" || "$slug" == \#* ]] && continue
  install_app "$slug" "$appid" || failures=$((failures + 1))
done <<'APPS'
counter-strike-source 232330
unturned 1110390
core-keeper 1963720
barotrauma 1026340
dont-starve-together 343050
necesse 1169370
aneurism-iv 2832030
APPS

echo "$failures Steam installations failed"
exit "$failures"
