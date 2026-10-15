#!/usr/bin/env bash
# Install only the read-only process scanner, not the agent or game binaries.
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo 'Run as root'; exit 1; }
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install -o root -g root -m 755 "$SCRIPT_DIR/playbound-update-scan" /usr/local/sbin/playbound-update-scan
SCANNER_RULE="$(mktemp)"
trap 'rm -f -- "$SCANNER_RULE"' EXIT
printf '%s\n' 'playbound ALL=(root) NOPASSWD: /usr/local/sbin/playbound-update-scan counter-strike-2, /usr/local/sbin/playbound-update-scan team-fortress-2, /usr/local/sbin/playbound-update-scan unturned, /usr/local/sbin/playbound-update-scan counter-strike-source, /usr/local/sbin/playbound-update-scan core-keeper, /usr/local/sbin/playbound-update-scan dont-starve-together, /usr/local/sbin/playbound-update-scan barotrauma, /usr/local/sbin/playbound-update-scan necesse, /usr/local/sbin/playbound-update-scan mindustry, /usr/local/sbin/playbound-update-scan openra, /usr/local/sbin/playbound-update-scan openhv, /usr/local/sbin/playbound-update-scan earth-2140-trilogy, /usr/local/sbin/playbound-update-scan hypersomnia' > "$SCANNER_RULE"
visudo -cf "$SCANNER_RULE"
install -o root -g root -m 440 "$SCANNER_RULE" /etc/sudoers.d/playbound-update-scan
