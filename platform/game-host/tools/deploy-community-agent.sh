#!/usr/bin/env bash
# Run as root on the VPS after staging smoke. Refuses to interrupt party rooms.
set -euo pipefail

stage=/opt/playbound-host/staging/game-host
live=/opt/playbound-host/agent
unit=/etc/systemd/system/playbound-game-host.service
backup=/opt/playbound-host/agent.backup-community-20260924

test "$(id -u)" -eq 0
test -f "$stage/managedRegistry.js"
test -f "$stage/processMetrics.js"
test ! -e "$backup"

set -a
# shellcheck disable=SC1091
source /etc/playbound-game-host.env
set +a
rooms=$(curl -fsS -H "Authorization: Bearer $GAME_HOST_SECRET" http://127.0.0.1:8741/rooms)
ROOMS_JSON="$rooms" python3 - <<'PY'
import json, os
assert json.loads(os.environ['ROOMS_JSON'])['rooms'] == [], 'Live party rooms are active; aborting update'
PY

cp -a "$live" "$backup"
cp -a "$unit" "$backup/playbound-game-host.service.previous"

rollback() {
  systemctl stop playbound-game-host || true
  cp -a "$backup/." "$live/"
  cp "$backup/playbound-game-host.service.previous" "$unit"
  systemctl daemon-reload
  systemctl start playbound-game-host
  echo 'Agent update failed; restored previous release' >&2
}
trap rollback ERR

systemctl stop playbound-game-host
for src in "$stage"/*.js; do
  case "$src" in *.test.js) continue;; esac
  cp "$src" "$live/"
  chown playbound:playbound "$live/$(basename "$src")"
  chmod 644 "$live/$(basename "$src")"
done
cp -a "$stage/tes3mp" "$live/"
cp -a "$stage/netbird" "$live/"
cp -a "$stage/assets/." "$live/assets/"
chown -R playbound:playbound "$live/tes3mp" "$live/netbird" "$live/assets"
cp "$stage/playbound-game-host.service" "$unit"
systemctl daemon-reload

systemctl start playbound-game-host
curl --retry 8 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:8741/health >/dev/null
trap - ERR

echo 'Agent updated and healthy; automatic hosting remains disabled'
