#!/usr/bin/env bash
#
# Install the PlayBound LAN discovery reflector on the VPS.
#
# Run this AFTER NetBird self-hosting is up and this machine has joined the
# overlay as a peer. See README.md in this directory for the order.
#
# Idempotent: re-running updates the script and restarts the service.
#
set -euo pipefail

SERVICE=playbound-reflector
UNIT=/etc/systemd/system/${SERVICE}.service
ENV_FILE=/etc/playbound/reflector.env
INSTALL_DIR=/opt/playbound/reflector
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (raw sockets need it)." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found — install it first (apt install -y python3)." >&2
  exit 1
fi

# Catch a broken script here rather than in a crash loop under systemd.
python3 -m py_compile "${SRC}/discovery-reflector.py"
echo "reflector syntax OK"

install -d -m 0755 "${INSTALL_DIR}"
install -m 0755 "${SRC}/discovery-reflector.py" "${INSTALL_DIR}/discovery-reflector.py"

# The env file holds the NetBird token, so it is root-only and is never
# overwritten once written — re-running must not clobber a real token.
install -d -m 0700 /etc/playbound
if [[ ! -f "${ENV_FILE}" ]]; then
  cat >"${ENV_FILE}" <<'EOF'
# Management API base, including /api
NETBIRD_API_URL=https://netbird.playbound.club/api
# Service-user personal access token. Same value as Vercel's NETBIRD_API_TOKEN.
NETBIRD_API_TOKEN=REPLACE_ME
# Discovery port. 27015 is HoloCure's; add more instances for other games.
DISCOVERY_PORT=27015
EOF
  chmod 0600 "${ENV_FILE}"
  echo "wrote ${ENV_FILE} — put the real token in it before starting"
else
  echo "${ENV_FILE} already exists, leaving it alone"
fi

cat >"${UNIT}" <<EOF
[Unit]
Description=PlayBound LAN discovery reflector
Documentation=https://github.com/RyShoe8/playbound/blob/main/docs/playbound-connect.md
# Pointless without the overlay it mirrors across.
After=network-online.target netbird.service
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/python3 ${INSTALL_DIR}/discovery-reflector.py
Restart=always
RestartSec=5
# Raw sockets with a chosen source address; no other privilege is needed.
AmbientCapabilities=CAP_NET_RAW
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE}"

if grep -q "REPLACE_ME" "${ENV_FILE}"; then
  echo
  echo "Not starting yet: ${ENV_FILE} still has REPLACE_ME."
  echo "Put the NetBird token in it, then: systemctl start ${SERVICE}"
else
  systemctl restart "${SERVICE}"
  systemctl --no-pager --lines=15 status "${SERVICE}" || true
fi
