#!/usr/bin/env bash
# Fixed opt-in runtime handoff. No account migration or game restarts.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
test -x /usr/local/libexec/playbound-customer-identities
test -x /usr/local/libexec/playbound-customer-resources
python3 -m py_compile "$source_dir/customer-runtime.py"
python3 -m py_compile "$source_dir/customer-data-migration.py"
install -o root -g root -m 755 "$source_dir/customer-runtime.py" /usr/local/libexec/playbound-customer-runtime
# Operator-only checkpoint preparation: intentionally absent from sudoers.
install -o root -g root -m 755 "$source_dir/customer-data-migration.py" /usr/local/libexec/playbound-customer-data-migration
rule="$(mktemp)"
trap 'rm -f "$rule"' EXIT
printf '%s\n' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime run *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime stop *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime status *' > "$rule"
visudo -cf "$rule"
install -o root -g root -m 440 "$rule" /etc/sudoers.d/playbound-customer-runtime
echo 'Installed opt-in customer runtime handoff; live process users unchanged'
