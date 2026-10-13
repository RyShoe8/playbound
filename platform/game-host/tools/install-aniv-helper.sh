#!/usr/bin/env bash
# Install only the scoped helper. Does not restart the agent or touch .env files.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
python3 -m py_compile "$source_dir/aniv-host.py"
install -d -o root -g root -m 755 /usr/local/libexec
install -o root -g root -m 755 "$source_dir/aniv-host.py" /usr/local/libexec/playbound-aniv-host
install -d -o root -g root -m 700 /var/lib/playbound-aniv-control
temporary_rule="$(mktemp)"
trap 'rm -f "$temporary_rule"' EXIT
printf '%s\n' 'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-aniv-host *' > "$temporary_rule"
visudo -cf "$temporary_rule"
install -o root -g root -m 440 "$temporary_rule" /etc/sudoers.d/playbound-aniv-host
echo 'Installed ANEURISM namespace helper; game-host service was not restarted'
