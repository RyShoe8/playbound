#!/usr/bin/env bash
# Install only the fixed account-allocation API. No game or service changes.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
test -x /usr/sbin/useradd
test -x /usr/sbin/groupadd
test -x /usr/sbin/nologin
python3 -m py_compile "$source_dir/customer-identities.py"
install -d -o root -g root -m 755 /usr/local/libexec
install -o root -g root -m 755 "$source_dir/customer-identities.py" /usr/local/libexec/playbound-customer-identities
rule="$(mktemp)"
trap 'rm -f "$rule"' EXIT
printf '%s\n' 'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-identities ensure *' > "$rule"
visudo -cf "$rule"
install -o root -g root -m 440 "$rule" /etc/sudoers.d/playbound-customer-identities
echo 'Installed identity allocation helper; runtime identities were not changed'
