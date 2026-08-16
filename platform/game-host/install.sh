#!/usr/bin/env bash
# Install the PlayBound game-host agent and dedicated binaries on Ubuntu 24.04.
# Run as root on the Contabo VPS:
#   sudo bash install.sh
# Optional: sudo bash install.sh --with-heavy   (Xonotic + Unvanquished)

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

export DEBIAN_FRONTEND=noninteractive

echo "==> packages"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl wget unzip tar xz-utils \
  ufw jq coturn \
  openjdk-17-jre-headless \
  openttd \
  hedgewars \
  warzone2100 \
  freeciv-server \
  bzflag-server \
  supertuxkart \
  openarena-server \
  wesnoth-server \
  0ad

# Luanti was still Minetest on Ubuntu 24.04.
if apt-cache show luanti-server >/dev/null 2>&1; then
  apt-get install -y --no-install-recommends luanti-server
else
  apt-get install -y --no-install-recommends minetest-server || true
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 18 ]]; then
  echo "==> Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

id -u playbound >/dev/null 2>&1 || useradd --system --home "$HOME_DIR" --shell /usr/sbin/nologin playbound
mkdir -p "$HOME_DIR" "$GAMES_DIR" "$AGENT_DIR"
chown -R playbound:playbound "$HOME_DIR"

echo "==> copy agent"
cp -f "$AGENT_SRC/index.js" "$AGENT_SRC/recipes.js" "$AGENT_SRC/package.json" "$AGENT_DIR/"
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
HOME=${HOME_DIR}
EOF
chmod 640 "$ENV_FILE"
chown root:playbound "$ENV_FILE"
echo "==> wrote $ENV_FILE"

echo "==> OpenRA dedicated"
OPENRA_DIR="$GAMES_DIR/openra"
mkdir -p "$OPENRA_DIR"
if [[ ! -x "$OPENRA_DIR/OpenRA.Server" ]]; then
  API="https://api.github.com/repos/OpenRA/OpenRA/releases/latest"
  ASSET_URL="$(curl -fsSL "$API" | jq -r '.assets[] | select(.name | test("Red-Alert.*x86_64\\.AppImage$")) | .browser_download_url' | head -n1)"
  if [[ -z "$ASSET_URL" || "$ASSET_URL" == "null" ]]; then
    ASSET_URL="https://github.com/OpenRA/OpenRA/releases/download/release-20250330/OpenRA-Red-Alert-x86_64.AppImage"
  fi
  curl -fL --retry 3 -o /tmp/openra.AppImage "$ASSET_URL"
  chmod +x /tmp/openra.AppImage
  (cd /tmp && ./openra.AppImage --appimage-extract >/dev/null)
  if [[ -x /tmp/squashfs-root/usr/lib/openra/OpenRA.Server ]]; then
    cp -a /tmp/squashfs-root/usr/lib/openra/. "$OPENRA_DIR/"
  elif [[ -x /tmp/squashfs-root/OpenRA.Server ]]; then
    cp -a /tmp/squashfs-root/. "$OPENRA_DIR/"
  else
    echo "WARN: could not extract OpenRA.Server from AppImage; copy it into $OPENRA_DIR later"
  fi
  rm -rf /tmp/openra.AppImage /tmp/squashfs-root
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

if [[ "$WITH_HEAVY" -eq 1 ]]; then
  echo "==> Xonotic dedicated (large download)"
  XON_DIR="$GAMES_DIR/xonotic"
  mkdir -p "$XON_DIR"
  if [[ ! -x "$XON_DIR/xonotic-linux64-dedicated" ]]; then
    curl -fL --retry 3 -o /tmp/xonotic.zip "https://dl.xonotic.org/xonotic-0.8.6.zip"
    unzip -q /tmp/xonotic.zip -d /tmp/xonotic-extract
    cp -a /tmp/xonotic-extract/Xonotic/. "$XON_DIR/"
    rm -rf /tmp/xonotic.zip /tmp/xonotic-extract
  fi
fi

chown -R playbound:playbound "$GAMES_DIR"

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
    for (const proto of protos) console.log(r.portStart + ":" + r.portEnd + " " + proto + " " + slug);
  }
' "$AGENT_DIR/recipes.js")

ufw allow 3478/udp comment "coturn-stun" || true
ufw allow 3478/tcp comment "coturn-turn" || true
ufw allow 49152:50152/udp comment "coturn-relay" || true
ufw --force enable || true

echo "==> coturn STUN/TURN configuration"
cat <<'EOF' > /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
min-port=49152
max-port=50152
fingerprint
lt-cred-mech
user=playbound_guest:guest_session_token
realm=playbound.club
total-quota=100
max-bps=0
no-cli
log-file=/var/log/turnserver.log
simple-log
EOF

mkdir -p /etc/systemd/system/coturn.service.d
cat <<'EOF' > /etc/systemd/system/coturn.service.d/override.conf
[Service]
MemoryMax=512M
MemoryHigh=400M
CPUQuota=100%
EOF

sed -i 's/TURNSERVER_ENABLED=0/TURNSERVER_ENABLED=1/' /etc/default/coturn || true

echo "==> systemd"
cp -f "$AGENT_SRC/playbound-game-host.service" /etc/systemd/system/playbound-game-host.service
systemctl daemon-reload
systemctl enable --now coturn || true
systemctl restart coturn || true
systemctl enable --now playbound-game-host

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
