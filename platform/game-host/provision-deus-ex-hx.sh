#!/usr/bin/env bash
# On the VPS, run after placing a legitimately acquired Deus Ex GOTY 1.112fm
# installation in a private directory. HX is downloaded from Hanfling's site;
# the game itself is never fetched, bundled, or served by PlayBound.
# Usage: sudo bash provision-deus-ex-hx.sh /path/to/Deus-Ex-GOTY
set -euo pipefail

if [[ "$(id -u)" -ne 0 || $# -ne 1 ]]; then
  echo "Usage: sudo bash provision-deus-ex-hx.sh /path/to/Deus-Ex-GOTY" >&2
  exit 2
fi

SOURCE="$(realpath "$1")"
TARGET="${GAME_HOST_GAMES_DIR:-/opt/playbound-host/games}/deus-ex"
TARGET="$(realpath -m "$TARGET")"
if [[ "$SOURCE" == "$TARGET" || "$SOURCE" == "$TARGET"/* ]]; then
  echo "Source must be outside the PlayBound Deus Ex target" >&2
  exit 2
fi
for file in System/DeusEx.u System/DeusEx.exe Maps/01_NYC_UNATCOIsland.dx; do
  if [[ ! -f "$SOURCE/$file" ]]; then
    echo "Missing base-game file: $SOURCE/$file" >&2
    exit 2
  fi
done

dpkg --add-architecture i386
apt-get update -y
apt-get install -y --no-install-recommends wine wine32:i386 wine64 ca-certificates curl unzip
command -v wine >/dev/null || { echo "wine is unavailable" >&2; exit 1; }

mkdir -p "$TARGET"
cp -a --reflink=auto "$SOURCE/." "$TARGET/"
ARCHIVE="$(mktemp --suffix=.zip)"
trap 'rm -f "$ARCHIVE"' EXIT
curl --fail --location --retry 3 --silent --show-error \
  'https://builds.hx.hanfling.de/testing/HX-0.9.89.4.zip' -o "$ARCHIVE"
echo '95fe3b1fcae3a834601b4fcdf5a6ca393aab1452f6165e82f345bd77769c3d5a  '"$ARCHIVE" | sha256sum -c -
unzip -qo "$ARCHIVE" -d "$TARGET"
for file in System/HCC.exe System/HX.u System/HXDefault.ini; do
  [[ -f "$TARGET/$file" ]] || { echo "HX file missing: $file" >&2; exit 1; }
done

cat > "$TARGET/run-server" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
exec wine HCC.exe "$@"
WRAPPER
chmod 755 "$TARGET/run-server"
chown -R playbound:playbound "$TARGET"
echo "HX 0.9.89.4 and Deus Ex GOTY are provisioned at $TARGET"
echo "Restart playbound-game-host after deploying the updated agent, then verify health.games.deus-ex-goty-edition.ready before enabling the site picker."
