#!/usr/bin/env bash
# Narrow helper installation only. No package changes, env reads or restarts.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
test -f /sys/fs/cgroup/cgroup.controllers || { echo 'cgroup v2 is required'; exit 1; }
command -v busctl >/dev/null
python3 -m py_compile "$source_dir/customer-resources.py"
install -d -o root -g root -m 755 /usr/local/libexec
install -o root -g root -m 755 "$source_dir/customer-resources.py" /usr/local/libexec/playbound-customer-resources
rule="$(mktemp)"
trap 'rm -f "$rule"' EXIT
printf '%s\n' 'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-resources attach *' > "$rule"
visudo -cf "$rule"
install -o root -g root -m 440 "$rule" /etc/sudoers.d/playbound-customer-resources
echo 'Installed customer resource-placement helper; no running games were changed'
