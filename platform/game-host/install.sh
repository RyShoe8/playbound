#!/usr/bin/env bash
# Install the PlayBound game-host agent and dedicated binaries on Ubuntu 24.04.
# Run as root on the Contabo VPS:
#   sudo bash install.sh
# Optional: sudo bash install.sh --with-heavy   (legacy; Xonotic installs by default)
# Skip Xonotic with: sudo SKIP_XONOTIC=1 bash install.sh
# ET: Legacy dedicated is installed by default (etlded + etmain assets).
# YSoccer: downloads the PlayBound release jar, or builds from upstream if 404.

set -euo pipefail

WITH_HEAVY=0
PUBLIC_IP="${GAME_HOST_PUBLIC_IP:-}"
for arg in "$@"; do
  case "$arg" in
    --with-heavy) WITH_HEAVY=1 ;;
    --ip=*) PUBLIC_IP="${arg#--ip=}" ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_SRC="$SCRIPT_DIR"
INSTALL_ROOT="/opt/playbound-host"
GAMES_DIR="$INSTALL_ROOT/games"
AGENT_DIR="$INSTALL_ROOT/agent"
ENV_FILE="/etc/playbound-game-host.env"
HOME_DIR="/var/lib/playbound-host"
MIRROR_ARCHIVE_DIR="$INSTALL_ROOT/archive"

export DEBIAN_FRONTEND=noninteractive

echo "==> packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl wget unzip tar xz-utils \
  ufw jq coturn git \
  openjdk-17-jre-headless \
  openttd \
  hedgewars \
  warzone2100 \
  bzflag-server \
  teeworlds-server \
  supertuxkart \
  openarena-server \
  0ad \
  chocolate-doom

# Optional on some mirrors — do not fail the whole install if missing.
apt-get install -y --no-install-recommends wesnoth-server wesnoth flightgear || true

# SteamCMD & Source Dedicated Server (TF2 / CS2) 32-bit & 64-bit runtime libraries
apt-get install -y --no-install-recommends \
  lib32gcc-s1 lib32stdc++6 libtinfo5 libncurses5 libcurl4-gnutls-dev:i386 \
  || apt-get install -y --no-install-recommends lib32gcc-s1 lib32stdc++6 || true

# ET: Legacy etlded runtime libraries (Ubuntu 24.04).
apt-get install -y --no-install-recommends \
  libsdl2-2.0-0 libcurl4 libopenal1 libjpeg-turbo8 libpng16-16 libfreetype6 zlib1g \
  || echo "WARN: some ET runtime packages unavailable"

# Luanti was still Minetest on Ubuntu 24.04.
if apt-cache show luanti-server >/dev/null 2>&1; then
  apt-get install -y --no-install-recommends luanti-server
else
  apt-get install -y --no-install-recommends minetest-server || true
fi

# Package units bind UDP 30000 and collide with PlayBound party hosts.
systemctl stop minetest-server.service luanti-server.service 2>/dev/null || true
systemctl disable minetest-server.service luanti-server.service 2>/dev/null || true
# Some distros ship a socket-activated unit instead.
systemctl stop minetest-server.socket luanti-server.socket 2>/dev/null || true
systemctl disable minetest-server.socket luanti-server.socket 2>/dev/null || true
pkill -x minetestserver 2>/dev/null || true
pkill -x luantiserver 2>/dev/null || true
fuser -k 30000/udp 30000/tcp 2>/dev/null || true

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]]; then
  echo "==> Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

id -u playbound >/dev/null 2>&1 || useradd --system --home "$HOME_DIR" --shell /usr/sbin/nologin playbound
mkdir -p "$HOME_DIR" "$GAMES_DIR" "$AGENT_DIR" "$MIRROR_ARCHIVE_DIR"
chown -R playbound:playbound "$HOME_DIR" "$MIRROR_ARCHIVE_DIR"
# Archive contents are intentionally public through the read-only mirror
# container, so its top-level directory must be traversable by that service.
chmod 755 "$MIRROR_ARCHIVE_DIR"

echo "==> copy agent"
# Every module index.js imports has to be listed here. This is an explicit list
# rather than a glob, so a newly added file stays invisible until someone adds
# it — and the agent then dies at startup importing a module that was never
# copied. platform/src/lib/gameHost/chain.test.ts checks the two agree.
cp -f "$AGENT_SRC/index.js" "$AGENT_SRC/recipes.js" "$AGENT_SRC/ensureGame.js" \
  "$AGENT_SRC/etLegacyInstall.js" "$AGENT_SRC/metrics.js" "$AGENT_SRC/spawnTests.js" \
  "$AGENT_SRC/gameVersions.js" "$AGENT_SRC/rcon.js" "$AGENT_SRC/roomRestart.js" \
  "$AGENT_SRC/package.json" "$AGENT_DIR/"
mkdir -p "$AGENT_DIR/assets"
cp -f "$AGENT_SRC/assets/et-playbound.cfg" "$AGENT_DIR/assets/" 2>/dev/null || true
chown -R playbound:playbound "$AGENT_DIR"

if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -4 -fsS --max-time 8 https://ifconfig.me || true)"
fi
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -4 -fsS --max-time 8 https://api.ipify.org || true)"
fi

# You pick the secret (same value as Vercel GAME_HOST_SECRET).
# If unset and no env file exists yet, one is generated.
SECRET="${GAME_HOST_SECRET:-}"
if [[ -z "$SECRET" && -f "$ENV_FILE" ]]; then
  SECRET="$(grep -E '^GAME_HOST_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)"
fi
if [[ -z "$SECRET" ]]; then
  SECRET="$(openssl rand -hex 32)"
fi

cat > "$ENV_FILE" <<EOF
GAME_HOST_SECRET=${SECRET}
GAME_HOST_PUBLIC_IP=${PUBLIC_IP}
GAME_HOST_PORT=8741
GAME_HOST_MAX_ROOMS=8
GAME_HOST_GAMES_DIR=${GAMES_DIR}
GAME_HOST_IDLE_MS=14400000
MIRROR_ARCHIVE_DIR=${MIRROR_ARCHIVE_DIR}
MIRROR_ARCHIVE_MAX_BYTES=$((20 * 1024 * 1024 * 1024))
HOME=${HOME_DIR}
EOF
chmod 640 "$ENV_FILE"
chown root:playbound "$ENV_FILE"
echo "==> wrote $ENV_FILE"

echo "==> OpenRA dedicated"
OPENRA_DIR="$GAMES_DIR/openra"
mkdir -p "$OPENRA_DIR"
if [[ ! -x "$OPENRA_DIR/OpenRA.Server" || ! -d "$OPENRA_DIR/mods/cnc" || ! -d "$OPENRA_DIR/mods/d2k" ]]; then
  API="https://api.github.com/repos/OpenRA/OpenRA/releases/latest"
  TAG="$(curl -fsSL "$API" | jq -r '.tag_name // "release-20250330"')"
  if [[ -z "$TAG" || "$TAG" == "null" ]]; then
    TAG="release-20250330"
  fi

  for mod_img in "OpenRA-Red-Alert-x86_64.AppImage" "OpenRA-Tiberian-Dawn-x86_64.AppImage" "OpenRA-Dune-2000-x86_64.AppImage"; do
    URL="https://github.com/OpenRA/OpenRA/releases/download/${TAG}/${mod_img}"
    echo "Fetching $mod_img..."
    if curl -fL --retry 3 -o /tmp/openra.AppImage "$URL"; then
      chmod +x /tmp/openra.AppImage
      (cd /tmp && ./openra.AppImage --appimage-extract >/dev/null 2>&1)
      ROOT="/tmp/squashfs-root"
      if [[ -d "$ROOT/usr/lib/openra" ]]; then
        ROOT="$ROOT/usr/lib/openra"
      fi
      if [[ -x "$ROOT/OpenRA.Server" && ! -x "$OPENRA_DIR/OpenRA.Server" ]]; then
        cp -a "$ROOT/." "$OPENRA_DIR/"
      elif [[ -d "$ROOT/mods" ]]; then
        mkdir -p "$OPENRA_DIR/mods"
        cp -an "$ROOT/mods/." "$OPENRA_DIR/mods/"
      fi
      rm -rf /tmp/openra.AppImage /tmp/squashfs-root
    else
      echo "WARN: Failed to download $mod_img"
    fi
  done
fi
if [[ -x "$OPENRA_DIR/OpenRA.Server" ]]; then
  cat > "$OPENRA_DIR/run-server" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec ./OpenRA.Server "$@"
EOF
  chmod +x "$OPENRA_DIR/run-server"
fi

echo "==> Mindustry dedicated"
MIN_DIR="$GAMES_DIR/mindustry"
mkdir -p "$MIN_DIR"
if [[ ! -f "$MIN_DIR/server-release.jar" ]]; then
  MIN_API="https://api.github.com/repos/Anuken/Mindustry/releases/latest"
  MIN_URL="$(curl -fsSL "$MIN_API" | jq -r '.assets[] | select(.name=="server-release.jar") | .browser_download_url' | head -n1)"
  if [[ -z "$MIN_URL" || "$MIN_URL" == "null" ]]; then
    MIN_URL="https://github.com/Anuken/Mindustry/releases/download/v146/server-release.jar"
  fi
  curl -fL --retry 3 -o "$MIN_DIR/server-release.jar" "$MIN_URL"
fi

echo "==> Freeciv dedicated (match PlayBound client ${FREECIV_VERSION:-3.2.5})"
FREECIV_VERSION="${FREECIV_VERSION:-3.2.5}"
FREECIV_DIR="$GAMES_DIR/freeciv"
mkdir -p "$FREECIV_DIR"
if [[ ! -x "$FREECIV_DIR/run-server" ]]; then
  apt-get install -y --no-install-recommends \
    build-essential \
    meson ninja-build pkg-config \
    libcurl4-gnutls-dev libssl-dev libsqlite3-dev \
    libicu-dev libreadline-dev zlib1g-dev libxml2-dev
  FREECIV_TAR="/tmp/freeciv-${FREECIV_VERSION}.tar.xz"
  curl -fL --retry 3 -o "$FREECIV_TAR" \
    "https://files.freeciv.org/stable/freeciv-${FREECIV_VERSION}.tar.xz"
  FREECIV_SRC="/tmp/freeciv-build-${FREECIV_VERSION}"
  rm -rf "$FREECIV_SRC"
  mkdir -p "$FREECIV_SRC"
  tar -xJf "$FREECIV_TAR" -C "$FREECIV_SRC" --strip-components=1
  meson setup "$FREECIV_SRC/build" "$FREECIV_SRC" \
    --prefix="$FREECIV_DIR" \
    -Dclients=[] \
    -Dfcmp=[] \
    -Daudio=none \
    -Dtools=[] \
    -Dserver=enabled
  meson compile -C "$FREECIV_SRC/build"
  meson install -C "$FREECIV_SRC/build"
  rm -rf "$FREECIV_TAR" "$FREECIV_SRC"
  if [[ ! -x "$FREECIV_DIR/bin/freeciv-server" ]]; then
    echo "ERROR: Freeciv ${FREECIV_VERSION} server build did not produce bin/freeciv-server"
    exit 1
  fi
  echo "  installed Freeciv ${FREECIV_VERSION} server under $FREECIV_DIR"
fi
# Always refresh wrapper — meson installs libfreeciv.so under lib/, not on the default loader path.
if [[ -x "$FREECIV_DIR/bin/freeciv-server" ]]; then
  cat > "$FREECIV_DIR/run-server" <<'EOF'
#!/usr/bin/env bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
for libdir in "$ROOT/lib/x86_64-linux-gnu" "$ROOT/lib"; do
  if [[ -d "$libdir" ]]; then
    export LD_LIBRARY_PATH="$libdir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    break
  fi
done
exec "$ROOT/bin/freeciv-server" "$@"
EOF
  chmod +x "$FREECIV_DIR/run-server"
fi

echo "==> YSoccer dedicated"
YSOCCER_DIR="$GAMES_DIR/ysoccer"
mkdir -p "$YSOCCER_DIR"
YSOCCER_JAR_URL="${YSOCCER_SERVER_JAR_URL:-https://github.com/RyShoe8/playbound/releases/download/ysoccer-online-latest/ysoccer-server.jar}"
if [[ -s "$YSOCCER_DIR/ysoccer-server.jar" ]]; then
  echo "  (keeping existing ysoccer-server.jar)"
elif curl -fL --retry 2 -o "$YSOCCER_DIR/ysoccer-server.jar" "$YSOCCER_JAR_URL"; then
  echo "  downloaded ysoccer-server.jar"
else
  rm -f "$YSOCCER_DIR/ysoccer-server.jar"
  echo "  release asset missing — building dedicated server from upstream source"
  apt-get install -y --no-install-recommends openjdk-21-jdk-headless 2>/dev/null \
    || apt-get install -y --no-install-recommends openjdk-17-jdk-headless
  YBUILD="/tmp/ysoccer-build-$$"
  rm -rf "$YBUILD"
  mkdir -p "$YBUILD"
  git clone --depth 1 https://git.code.sf.net/p/ysoccer/code "$YBUILD/upstream"
  PATCH_JS=""
  for cand in \
    "$SCRIPT_DIR/../../.github/scripts/patch-ysoccer.mjs" \
    "$SCRIPT_DIR/../../../.github/scripts/patch-ysoccer.mjs" \
    "/opt/playbound/.github/scripts/patch-ysoccer.mjs"; do
    if [[ -f "$cand" ]]; then PATCH_JS="$cand"; break; fi
  done
  if [[ -n "$PATCH_JS" ]]; then
    node "$PATCH_JS" "$YBUILD/upstream"
  else
    echo "  WARN: patch-ysoccer.mjs not found; building unpatched upstream server"
  fi
  (cd "$YBUILD/upstream/java" && ./gradlew --no-daemon server:jar)
  BUILT="$(find "$YBUILD/upstream/java/server/build/libs" -name '*.jar' ! -name '*-sources.jar' | head -n1)"
  if [[ -z "$BUILT" || ! -s "$BUILT" ]]; then
    echo "ERROR: YSoccer server jar build produced no artifact"
    rm -rf "$YBUILD"
    exit 1
  fi
  cp -f "$BUILT" "$YSOCCER_DIR/ysoccer-server.jar"
  rm -rf "$YBUILD"
  echo "  built ysoccer-server.jar from source"
fi

echo "==> Xonotic dedicated (large download; skip with SKIP_XONOTIC=1)"
XON_DIR="$GAMES_DIR/xonotic"
mkdir -p "$XON_DIR"
if [[ "${SKIP_XONOTIC:-0}" == "1" ]]; then
  echo "  SKIP_XONOTIC=1 — leaving xonotic untouched"
elif [[ "$WITH_HEAVY" -eq 1 || ! -x "$XON_DIR/xonotic-linux64-dedicated" ]]; then
  if [[ ! -x "$XON_DIR/xonotic-linux64-dedicated" ]]; then
    curl -fL --retry 3 -o /tmp/xonotic.zip "https://dl.xonotic.org/xonotic-0.8.6.zip"
    unzip -q /tmp/xonotic.zip -d /tmp/xonotic-extract
    cp -a /tmp/xonotic-extract/Xonotic/. "$XON_DIR/"
    rm -rf /tmp/xonotic.zip /tmp/xonotic-extract
  fi
fi

# Legacy flag still accepted for ops who used --with-heavy only for Xonotic.
if [[ "$WITH_HEAVY" -eq 1 ]]; then
  echo "==> --with-heavy: Xonotic handled above (Unvanquished still manual)"
fi

echo "==> BombSquad dedicated"
BOMBSQUAD_DIR="$GAMES_DIR/bombsquad"
mkdir -p "$BOMBSQUAD_DIR"
if [[ ! -f "$BOMBSQUAD_DIR/bombsquad_server" ]]; then
  BOMBSQUAD_URL="$(curl -fsSL https://ballistica.net/downloads \
    | grep -oE 'https://files\.ballistica\.net/bombsquad/builds/BombSquad_Server_Linux_x86_64_[^"<]+\.tar\.gz' \
    | head -n1 || true)"
  if [[ -z "$BOMBSQUAD_URL" ]]; then
    echo "WARN: could not resolve the current BombSquad server build" >&2
  else
    BOMBSQUAD_TMP="$(mktemp -d)"
    if curl -fL --retry 3 "$BOMBSQUAD_URL" | tar -xz --strip-components=1 -C "$BOMBSQUAD_TMP"; then
      cp -a "$BOMBSQUAD_TMP/." "$BOMBSQUAD_DIR/"
      sed -i '1s|^#!.*$|#!/usr/bin/env -S python3 -OB|' "$BOMBSQUAD_DIR/bombsquad_server"
      chmod +x "$BOMBSQUAD_DIR/bombsquad_server"
    else
      echo "WARN: BombSquad server download or extraction failed" >&2
    fi
    rm -rf -- "$BOMBSQUAD_TMP"
  fi
fi
if [[ -f "$BOMBSQUAD_DIR/bombsquad_server" ]]; then
  cat > "$BOMBSQUAD_DIR/run-server" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:?port required}"
PARTY_NAME="${2:-PlayBound Party}"
MAX_PLAYERS="${3:-8}"
ROOM="$(printf '%s' "${4:-room}" | tr -cd 'A-Za-z0-9_-')"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "invalid BombSquad port" >&2; exit 2; }
[[ "$MAX_PLAYERS" =~ ^[0-9]+$ ]] || MAX_PLAYERS=8
(( MAX_PLAYERS < 1 )) && MAX_PLAYERS=1
(( MAX_PLAYERS > 8 )) && MAX_PLAYERS=8
STATE_DIR="$BASE/state/${ROOM:-room}"
mkdir -p "$STATE_DIR/root"
CONFIG="$STATE_DIR/config.json"
jq -n \
  --arg party_name "$PARTY_NAME" \
  --argjson port "$PORT" \
  --argjson max_players "$MAX_PLAYERS" \
  '{party_name:$party_name,party_is_public:false,port:$port,max_party_size:($max_players+1),session_max_players_override:$max_players,session_type:"teams",show_tutorial:false}' \
  > "$CONFIG"
cd "$BASE"
exec /usr/bin/env python3 -OB ./bombsquad_server \
  --config "$CONFIG" --root "$STATE_DIR/root" --noninteractive --no-auto-restart
EOF
  chmod +x "$BOMBSQUAD_DIR/run-server"
fi

echo "==> Wolfenstein: Enemy Territory (ET: Legacy dedicated)"
ET_DIR="$GAMES_DIR/wolfenstein-enemy-territory"
mkdir -p "$ET_DIR"
# Linux x86_64 archive from https://www.etlegacy.com/download (file id may bump on new releases).
ET_URL="${ET_LEGACY_LINUX_URL:-https://www.etlegacy.com/download/file/728}"
if [[ ! -x "$ET_DIR/etlded" && ! -x "$ET_DIR/etlded.x86_64" ]]; then
  curl -fL --retry 3 -o /tmp/etlegacy-linux.tar.gz "$ET_URL" || \
    curl -fL --retry 3 -o /tmp/etlegacy-linux.zip "$ET_URL"
  mkdir -p /tmp/etlegacy-extract
  if [[ -f /tmp/etlegacy-linux.tar.gz ]]; then
    # Archive may be tar.gz or a zip mislabeled by Content-Disposition.
    if tar -tzf /tmp/etlegacy-linux.tar.gz &>/dev/null; then
      tar -xzf /tmp/etlegacy-linux.tar.gz -C /tmp/etlegacy-extract
    else
      unzip -q /tmp/etlegacy-linux.tar.gz -d /tmp/etlegacy-extract
    fi
    rm -f /tmp/etlegacy-linux.tar.gz
  else
    unzip -q /tmp/etlegacy-linux.zip -d /tmp/etlegacy-extract
    rm -f /tmp/etlegacy-linux.zip
  fi
  # Flatten a single top-level folder if present.
  if [[ "$(find /tmp/etlegacy-extract -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ]]; then
    INNER="$(find /tmp/etlegacy-extract -mindepth 1 -maxdepth 1 -type d | head -n1)"
    if [[ -n "$INNER" ]]; then
      cp -a "$INNER"/. "$ET_DIR/"
    else
      cp -a /tmp/etlegacy-extract/. "$ET_DIR/"
    fi
  else
    cp -a /tmp/etlegacy-extract/. "$ET_DIR/"
  fi
  rm -rf /tmp/etlegacy-extract
  # Prefer a stable name the recipe looks for first.
  if [[ ! -x "$ET_DIR/etlded" ]]; then
    for cand in etlded.x86_64 etl.x86_64.ded; do
      if [[ -x "$ET_DIR/$cand" ]]; then
        ln -sfn "$cand" "$ET_DIR/etlded"
        break
      fi
    done
  fi
  chmod +x "$ET_DIR"/etlded* "$ET_DIR"/etl* 2>/dev/null || true
fi
# Official 2.60b etmain assets — required pak0.pk3; overlay when missing, not when etmain merely non-empty.
ET_OVERLAY_URL="${ET_LEGACY_OVERLAY_URL:-https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher-packages/games/wolfenstein-enemy-territory/ET-260b-Base-Data.zip}"
if [[ ! -f "$ET_DIR/etmain/pak0.pk3" ]]; then
  curl -fL --retry 3 -o /tmp/et-base.zip "$ET_OVERLAY_URL"
  mkdir -p "$ET_DIR/etmain"
  unzip -qo /tmp/et-base.zip -d /tmp/et-base-extract
  if [[ -d /tmp/et-base-extract/etmain ]]; then
    cp -a /tmp/et-base-extract/etmain/. "$ET_DIR/etmain/"
  else
    cp -a /tmp/et-base-extract/. "$ET_DIR/etmain/"
  fi
  rm -rf /tmp/et-base.zip /tmp/et-base-extract
fi
# Move loose paks into etmain and copy server cfg beside etlded.
for pak in pak0.pk3 pak1.pk3 pak2.pk3; do
  if [[ -f "$ET_DIR/$pak" && ! -f "$ET_DIR/etmain/$pak" ]]; then
    mv -f "$ET_DIR/$pak" "$ET_DIR/etmain/$pak"
  fi
done
if [[ -f "$AGENT_SRC/assets/et-playbound.cfg" ]]; then
  cp -f "$AGENT_SRC/assets/et-playbound.cfg" "$ET_DIR/et-playbound.cfg"
fi
mkdir -p "$HOME_DIR/et"
chown playbound:playbound "$HOME_DIR/et"
chmod 755 "$HOME_DIR/et"

echo "==> OpenTTD OpenGFX (required for -D dedicated server)"
OTT_BASESET="$HOME_DIR/.openttd/baseset"
mkdir -p "$OTT_BASESET" "$HOME_DIR/logs" "$HOME_DIR/luanti-worlds"
if ! compgen -G "$OTT_BASESET/*.grf" >/dev/null; then
  if apt-cache show openttd-opengfx >/dev/null 2>&1; then
    apt-get install -y --no-install-recommends openttd-opengfx || true
    if compgen -G "/usr/share/games/openttd/baseset/*.grf" >/dev/null; then
      cp -a /usr/share/games/openttd/baseset/. "$OTT_BASESET/"
    fi
  fi
fi
if ! compgen -G "$OTT_BASESET/*.grf" >/dev/null; then
  apt-get install -y --no-install-recommends unzip || true
  OPENGFX_ZIP="/tmp/opengfx-all.zip"
  curl -fL --retry 3 -o "$OPENGFX_ZIP" \
    "https://cdn.openttd.org/opengfx-releases/7.1/opengfx-7.1-all.zip"
  rm -rf /tmp/opengfx-extract
  mkdir -p /tmp/opengfx-extract
  unzip -qo "$OPENGFX_ZIP" -d /tmp/opengfx-extract
  tar -xf /tmp/opengfx-extract/opengfx-"*"/*.tar -C "$OTT_BASESET" 2>/dev/null || \
    tar -xf /tmp/opengfx-extract/*.tar -C "$OTT_BASESET" 2>/dev/null || true
  rm -rf "$OPENGFX_ZIP" /tmp/opengfx-extract
fi
chown -R playbound:playbound "$HOME_DIR/.openttd" "$HOME_DIR/logs" "$HOME_DIR/luanti-worlds"

echo "==> Warzone 2100 (AppArmor bwrap profile for Ubuntu 24.04+)"
if [[ ! -f /etc/apparmor.d/bwrap ]]; then
  cat > /etc/apparmor.d/bwrap <<'BWRAP'
abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
BWRAP
  systemctl reload apparmor 2>/dev/null || true
fi

echo "==> Warzone 2100 (run-server wrapper — skip apt bwrap, no /dev/dri on VPS)"
WZ_DIR="$GAMES_DIR/warzone-2100"
mkdir -p "$WZ_DIR"
WZ_REAL=""
for cand in /usr/games/warzone2100.real \
            /usr/lib/warzone2100/warzone2100.real \
            /usr/lib/x86_64-linux-gnu/warzone2100/warzone2100.real; do
  if [[ -x "$cand" ]]; then
    WZ_REAL="$cand"
    break
  fi
done
if [[ -n "$WZ_REAL" ]]; then
  cat > "$WZ_DIR/run-server" <<EOF
#!/usr/bin/env bash
exec "$WZ_REAL" "\$@"
EOF
  chmod +x "$WZ_DIR/run-server"
  echo "  Warzone run-server -> $WZ_REAL"
else
  echo "  WARN: warzone2100.real not found — dedicated hosting may fail on headless VPS"
fi

echo "==> Warzone 2100 autohost config"
WZ_CONFIG="$HOME_DIR/warzone"
mkdir -p "$WZ_CONFIG/autohost"
cat > "$WZ_CONFIG/config" <<'EOF'
masterserver_name=nomasterserverplease
UPnP=0
EOF
cat > "$WZ_CONFIG/autohost/playbound-default.json" <<'EOF'
{
  "locked": {
    "alliances": true,
    "scavengers": true,
    "bases": true
  },
  "challenge": {
    "map": "Sk-Mountain",
    "maxPlayers": 8,
    "scavengers": 0,
    "alliances": 0,
    "powerLevel": 1,
    "bases": 2,
    "name": "PlayBound Warzone",
    "techLevel": 1,
    "spectatorHost": true,
    "openSpectatorSlots": 4,
    "blindMode": "none"
  }
}
EOF
chown -R playbound:playbound "$WZ_CONFIG"

systemctl disable --now bzflag-server 2>/dev/null || true
systemctl mask bzflag-server 2>/dev/null || true
pkill -x bzfs 2>/dev/null || true

echo "==> TripleA headless (requires Java 25+)"
TRIPLEA_JAVA_DIR="$INSTALL_ROOT/jre/temurin-25"
if [[ ! -x "$TRIPLEA_JAVA_DIR/bin/java" ]]; then
  mkdir -p "$INSTALL_ROOT/jre"
  curl -fL --retry 3 -o /tmp/temurin25-jre.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jre/hotspot/normal/eclipse"
  rm -rf /tmp/temurin25-jre-extract
  mkdir -p /tmp/temurin25-jre-extract
  tar -xzf /tmp/temurin25-jre.tar.gz -C /tmp/temurin25-jre-extract
  rm -rf "$TRIPLEA_JAVA_DIR"
  mv /tmp/temurin25-jre-extract/* "$TRIPLEA_JAVA_DIR"
  rm -rf /tmp/temurin25-jre.tar.gz /tmp/temurin25-jre-extract
  echo "  installed Temurin 25 JRE under $TRIPLEA_JAVA_DIR"
fi

TRIPLEA_DIR="$GAMES_DIR/triplea"
mkdir -p "$TRIPLEA_DIR"
HEADLESS_JAR="$(find "$TRIPLEA_DIR" -maxdepth 3 -name '*.jar' ! -name '*-sources.jar' | head -n1)"
if [[ -z "$HEADLESS_JAR" ]]; then
  TRIPLEA_API="https://api.github.com/repos/triplea-game/triplea/releases/latest"
  TRIPLEA_ZIP_URL="$(curl -fsSL "$TRIPLEA_API" | jq -r '.assets[] | select(.name == "game-headless.zip") | .browser_download_url' | head -n1)"
  if [[ -n "$TRIPLEA_ZIP_URL" && "$TRIPLEA_ZIP_URL" != "null" ]]; then
    curl -fL --retry 3 -o /tmp/triplea-headless.zip "$TRIPLEA_ZIP_URL"
    rm -rf /tmp/triplea-headless-extract
    mkdir -p /tmp/triplea-headless-extract
    unzip -qo /tmp/triplea-headless.zip -d /tmp/triplea-headless-extract
    cp -a /tmp/triplea-headless-extract/* "$TRIPLEA_DIR/"
    rm -rf /tmp/triplea-headless.zip /tmp/triplea-headless-extract
  fi
  HEADLESS_JAR="$(find "$TRIPLEA_DIR" -maxdepth 3 -name '*.jar' ! -name '*-sources.jar' | head -n1)"
fi
if [[ -n "$HEADLESS_JAR" && -x "$TRIPLEA_JAVA_DIR/bin/java" ]]; then
  cat > "$TRIPLEA_DIR/run-server" <<EOF
#!/usr/bin/env bash
ROOT="\$(cd "\$(dirname "\$0")" && pwd)"
JAR="\$(find "\$ROOT" -maxdepth 3 -name '*.jar' ! -name '*-sources.jar' | head -n1)"
PORT="\${1:?port required}"
MAPS="\$ROOT/downloadedMaps"
mkdir -p "\$MAPS"
export BOT_COMMENT=automated_host
export BOT_NAME="Bot_PB_\$PORT"
export BOT_PORT="\$PORT"
export BOT_LOBBY_URI=https://prod2-lobby.triplea-game.org
export MAPS_FOLDER="\$MAPS"
exec "${TRIPLEA_JAVA_DIR}/bin/java" -server -Xmx512M -Djava.awt.headless=true -jar "\$JAR" \\
  -Ptriplea.server=true \\
  -Ptriplea.server.password=
EOF
  chmod +x "$TRIPLEA_DIR/run-server"
  echo "  TripleA headless ready under $TRIPLEA_DIR"
elif [[ -z "$HEADLESS_JAR" ]]; then
  echo "  WARN: TripleA headless jar not found — party hosting unavailable until installed"
elif [[ ! -x "$TRIPLEA_JAVA_DIR/bin/java" ]]; then
  echo "  WARN: Temurin 25 JRE missing — TripleA headless cannot start"
fi

chown -R playbound:playbound "$GAMES_DIR" "$INSTALL_ROOT/jre"

echo "==> OpenMOHAA dedicated binary"
OPENMOHAA_DIR="$GAMES_DIR/openmohaa"
OPENMOHAA_VERSION="${OPENMOHAA_VERSION:-v0.82.1}"
mkdir -p "$OPENMOHAA_DIR"
if [[ ! -x "$OPENMOHAA_DIR/omohaaded" ]]; then
  OPENMOHAA_ZIP="/tmp/openmohaa-${OPENMOHAA_VERSION}.zip"
  curl -fL --retry 3 -o "$OPENMOHAA_ZIP" \
    "https://github.com/openmoh/openmohaa/releases/download/${OPENMOHAA_VERSION}/openmohaa-${OPENMOHAA_VERSION}-linux-amd64.zip"
  unzip -qo "$OPENMOHAA_ZIP" -d "$OPENMOHAA_DIR"
  rm -f "$OPENMOHAA_ZIP"
fi
if [[ ! -f "$OPENMOHAA_DIR/main/Pak0.pk3" ]]; then
  echo "  WARN: OpenMOHAA needs licensed main/Pak*.pk3 assets copied into $OPENMOHAA_DIR"
fi

chown -R playbound:playbound "$OPENMOHAA_DIR"

echo "==> Freedoom (Zandronum 3.2.1 dedicated + Freedoom IWADs)"
FREEDOOM_DIR="$GAMES_DIR/freedoom"
mkdir -p "$FREEDOOM_DIR"
ZAN_VERSION="3.2.1"
ZAN_VER_FILE="$FREEDOOM_DIR/.zandronum-version"
if [[ ! -x "$FREEDOOM_DIR/zandronum-server" || "$(<"$ZAN_VER_FILE" 2>/dev/null)" != "$ZAN_VERSION" ]]; then
  ZAN_URL="${ZANDRONUM_LINUX_URL:-https://zandronum.com/downloads/zandronum${ZAN_VERSION}-linux-x86_64.tar.bz2}"
  echo "Fetching Zandronum ${ZAN_VERSION} dedicated server..."
  if curl -fL --retry 3 -o /tmp/zandronum.tar.bz2 "$ZAN_URL"; then
    tar -xf /tmp/zandronum.tar.bz2 -C "$FREEDOOM_DIR" || true
    chmod +x "$FREEDOOM_DIR/zandronum-server" 2>/dev/null || true
    echo "$ZAN_VERSION" > "$ZAN_VER_FILE"
    rm -f /tmp/zandronum.tar.bz2
  fi
fi

if [[ ! -f "$FREEDOOM_DIR/freedoom2.wad" && -f "/usr/share/games/doom/freedoom2.wad" ]]; then
  cp -f /usr/share/games/doom/*.wad "$FREEDOOM_DIR/" 2>/dev/null || true
fi

if [[ ! -f "$FREEDOOM_DIR/freedoom2.wad" ]]; then
  FREE_URL="${FREEDOOM_IWADS_URL:-https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip}"
  echo "Fetching Freedoom IWADs..."
  if curl -fL --retry 3 -o /tmp/freedoom.zip "$FREE_URL"; then
    rm -rf /tmp/freedoom-extract
    mkdir -p /tmp/freedoom-extract
    unzip -qo /tmp/freedoom.zip -d /tmp/freedoom-extract
    find /tmp/freedoom-extract -name "*.wad" -exec cp -f {} "$FREEDOOM_DIR/" \;
    rm -rf /tmp/freedoom.zip /tmp/freedoom-extract
  fi
fi
chown -R playbound:playbound "$FREEDOOM_DIR"

echo "==> Hurry Curry dedicated server"
HC_DIR="$GAMES_DIR/hurry-curry"
mkdir -p "$HC_DIR"

HC_NEEDS_BUILD=1
if [[ -x "$HC_DIR/hurrycurry-server" ]]; then
  if "$HC_DIR/hurrycurry-server" --help >/dev/null 2>&1; then
    HC_NEEDS_BUILD=0
  else
    echo "  existing hurrycurry-server binary is incompatible with host glibc"
  fi
fi

if [[ "$HC_NEEDS_BUILD" -eq 1 ]]; then
  echo "Building Hurry Curry server for Ubuntu host..."
  if command -v docker >/dev/null 2>&1 && systemctl is-active --quiet docker; then
    docker run --rm -v "$HC_DIR:/out" rust:1-bookworm sh -c "
      git clone --depth 1 https://codeberg.org/hurrycurry/hurrycurry /build &&
      cd /build &&
      cargo build --release --bin hurrycurry-server &&
      cp target/release/hurrycurry-server /out/hurrycurry-server &&
      chmod 755 /out/hurrycurry-server
    " || true
  fi

  if [[ ! -x "$HC_DIR/hurrycurry-server" ]] || ! "$HC_DIR/hurrycurry-server" --help >/dev/null 2>&1; then
    if ! command -v cargo >/dev/null 2>&1; then
      apt-get install -y --no-install-recommends cargo rustc libssl-dev pkg-config || true
    fi
    TMP_BUILD="/tmp/hurrycurry-build-$$"
    rm -rf "$TMP_BUILD"
    if git clone --depth 1 https://codeberg.org/hurrycurry/hurrycurry "$TMP_BUILD"; then
      (cd "$TMP_BUILD" && cargo build --release --bin hurrycurry-server) || true
      if [[ -x "$TMP_BUILD/target/release/hurrycurry-server" ]]; then
        cp -f "$TMP_BUILD/target/release/hurrycurry-server" "$HC_DIR/hurrycurry-server"
        chmod 755 "$HC_DIR/hurrycurry-server"
      fi
    fi
    rm -rf "$TMP_BUILD"
  fi
fi

if [[ ! -d "$HC_DIR/data" ]]; then
  echo "Fetching Hurry Curry game data..."
  if curl -fL --retry 3 -o /tmp/hc-data.zip "https://hurrycurry-download.metamuffin.org/data.zip"; then
    unzip -qo /tmp/hc-data.zip -d "$HC_DIR" || true
    rm -f /tmp/hc-data.zip
  fi
fi
chown -R playbound:playbound "$HC_DIR"

echo "==> firewall"
ufw allow OpenSSH || true
ufw allow 8741/tcp comment "playbound-game-host" || true

# Game listen ranges come from recipes.js so the firewall and the host agent
# cannot disagree. That drift was not hypothetical: OpenRA was listed as UDP
# while its server speaks TCP, so the dedicated process came up healthy and
# every client's handshake was dropped by the firewall.
# (Ranges must also be open in the Contabo panel if it has its own firewall.)
while read -r range proto slug; do
  ufw allow "${range}/${proto}" comment "${slug}" || true
done < <(node --input-type=module -e '
  const { pathToFileURL } = await import("node:url");
  const { recipes } = await import(pathToFileURL(process.argv[1]).href);
  for (const [slug, r] of Object.entries(recipes)) {
    const protos = r.protocol === "both" ? ["tcp", "udp"] : [r.protocol];
    const range = r.portStart === r.portEnd ? String(r.portStart) : r.portStart + ":" + r.portEnd;
    for (const proto of protos) console.log(range + " " + proto + " " + slug);
  }
' "$AGENT_DIR/recipes.js")

ufw allow 3478/udp comment "coturn-stun" || true
ufw allow 3478/tcp comment "coturn-turn" || true
ufw allow 49152:50152/udp comment "coturn-relay" || true
ufw --force enable || true

echo "==> coturn STUN/TURN configuration"
# Ubuntu's package fails if TLS ports are enabled without certs, or if the
# turnserver user cannot write the log file. Use syslog + plain 3478 only.
EXTERNAL_IP_LINE=""
if [[ -n "${PUBLIC_IP:-}" ]]; then
  EXTERNAL_IP_LINE="external-ip=${PUBLIC_IP}"
fi
cat > /etc/turnserver.conf <<EOF
listening-port=3478
listening-ip=0.0.0.0
relay-ip=0.0.0.0
${EXTERNAL_IP_LINE}
min-port=49152
max-port=50152
fingerprint
lt-cred-mech
user=playbound_guest:guest_session_token
realm=playbound.club
total-quota=100
no-cli
no-tls
no-dtls
no-multicast-peers
syslog
simple-log
EOF

mkdir -p /etc/systemd/system/coturn.service.d
cat <<'EOF' > /etc/systemd/system/coturn.service.d/override.conf
[Service]
MemoryMax=512M
MemoryHigh=400M
CPUQuota=100%
EOF

# Package enable flag — sed is not enough when the line is commented differently.
if [[ -f /etc/default/coturn ]]; then
  if grep -q '^TURNSERVER_ENABLED=' /etc/default/coturn; then
    sed -i 's/^TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  else
    echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
  fi
else
  echo 'TURNSERVER_ENABLED=1' > /etc/default/coturn
fi

echo "==> systemd"
cp -f "$AGENT_SRC/playbound-game-host.service" /etc/systemd/system/playbound-game-host.service
systemctl daemon-reload

# Free :3478 — a leftover turnserver from a prior config probe (or a failed
# unit) will make systemd start fail with errno=98 (EADDRINUSE).
systemctl stop coturn 2>/dev/null || true
pkill -x turnserver 2>/dev/null || true
sleep 1
if ss -ulnp 2>/dev/null | grep -q ':3478'; then
  echo "  WARN: something still listening on UDP 3478:"
  ss -ulnp | grep ':3478' || true
  fuser -k 3478/udp 2>/dev/null || true
  fuser -k 3478/tcp 2>/dev/null || true
  sleep 1
fi

# Config sanity check without leaving a process behind.
if timeout 2s turnserver -c /etc/turnserver.conf --log-file=stdout -n >/tmp/coturn-check.log 2>&1; then
  echo "  coturn config OK"
else
  # timeout exits 124 on success-path (still running when killed) — that is fine.
  code=$?
  if [[ "$code" -eq 124 ]]; then
    echo "  coturn config OK"
  else
    echo "  WARN: coturn config check exited $code:"
    head -n 40 /tmp/coturn-check.log || true
  fi
fi
pkill -x turnserver 2>/dev/null || true

systemctl reset-failed coturn 2>/dev/null || true
if ! systemctl enable coturn; then
  echo "  WARN: could not enable coturn"
fi
if ! systemctl restart coturn; then
  echo "  WARN: coturn failed to start — party WebRTC TURN may be degraded."
  journalctl -u coturn -n 40 --no-pager || true
  ss -ulnp | grep ':3478' || true
else
  systemctl --no-pager --full status coturn | head -n 15 || true
fi

systemctl enable playbound-game-host
systemctl restart playbound-game-host

sleep 1
systemctl --no-pager --full status playbound-game-host || true

echo
echo "========================================"
echo "Game host is installed."
echo
echo "Public IP:  ${PUBLIC_IP:-unknown}"
echo "Agent URL:  http://${PUBLIC_IP:-YOUR_IP}:8741"
echo "Secret:     (in $ENV_FILE as GAME_HOST_SECRET)"
echo
echo "Set these on Vercel (Production):"
echo "  GAME_HOST_URL=http://${PUBLIC_IP:-YOUR_IP}:8741"
echo "  GAME_HOST_SECRET=<same value as GAME_HOST_SECRET in $ENV_FILE>"
echo "  GAME_HOST_PUBLIC_IP=${PUBLIC_IP:-YOUR_IP}"
echo
echo "Also open the same ports in the Contabo firewall/panel if it has one."
echo "Health check:  curl http://${PUBLIC_IP:-127.0.0.1}:8741/health"
echo "========================================"
