#!/usr/bin/env bash
# Install GoldenEye: Source 5.0.6 from its official Windows server archive.
# Run as root with the downloaded .7z path. The game-host agent stays stopped
# only for deployment; this script does not restart it or replace a live tree.
set -euo pipefail

archive="${1:?Pass the GoldenEye_Source_v5.0.6_full_server_windows.7z path}"
root="${GAME_HOST_GAMES_DIR:-/opt/playbound-host/games}"
dest="$root/goldeneye-source"
expected_sha=79643189e9d6549e13ed9545d2277cb34bac05fff645d44d9de1f0ab030610d3

[[ -f "$archive" ]] || { echo "Archive not found: $archive" >&2; exit 1; }
[[ ! -e "$dest" ]] || { echo "Destination exists: $dest" >&2; exit 1; }
for tool in /usr/games/steamcmd 7z wine xvfb-run xauth; do
  if [[ "$tool" == */* ]]; then [[ -x "$tool" ]] || { echo "Missing $tool" >&2; exit 1; }
  else command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }; fi
done
echo "$expected_sha  $archive" | sha256sum -c -

install -d -o playbound -g playbound "$root"
stage="$(mktemp -d "$root/.goldeneye-source.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
chown playbound:playbound "$stage"

runuser -u playbound -- /usr/games/steamcmd \
  +@sSteamCmdForcePlatformType windows \
  +force_install_dir "$stage" +login anonymous +app_update 310 validate +quit
[[ -f "$stage/srcds.exe" ]] || { echo "Steam app 310 did not provide srcds.exe" >&2; exit 1; }

7z x -y "$archive" "-o$stage" >/dev/null
[[ -f "$stage/gesource/gameinfo.txt" ]] || { echo "Archive did not provide gesource/gameinfo.txt" >&2; exit 1; }

cat > "$stage/run-server.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec xvfb-run -a wine srcds.exe "$@"
SH
chmod 755 "$stage/run-server.sh"
chown -R playbound:playbound "$stage"
mv -- "$stage" "$dest"
echo "GoldenEye: Source server files installed at $dest"
