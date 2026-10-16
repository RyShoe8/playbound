#!/usr/bin/env bash
# Fixed opt-in runtime handoff. No account migration or game restarts.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
java_profiles="$source_dir/../reviewedJavaProfiles.json"
if test -f "$source_dir/reviewedJavaProfiles.json"; then java_profiles="$source_dir/reviewedJavaProfiles.json"; fi
install -o root -g root -m 644 "$java_profiles" /usr/local/libexec/playbound-customer-java-profiles.json
test -x /usr/local/libexec/playbound-customer-identities
test -x /usr/local/libexec/playbound-customer-resources
test -f /usr/local/libexec/playbound-package-native/nativePackageProfiles.json
python3 -I -c 'import ctypes; ctypes.CDLL("libseccomp.so.2")'
python3 -m py_compile "$source_dir/customer-runtime.py"
python3 -m py_compile "$source_dir/customer-native-engine.py"
python3 -m py_compile "$source_dir/customer-seccomp.py"
python3 -m py_compile "$source_dir/customer-host-network.py"
python3 -m py_compile "$source_dir/customer-bind-policy.py"
install -o root -g root -m 755 "$source_dir/customer-bind-policy.py" /usr/local/libexec/playbound-customer-bind-policy
install -o root -g root -m 755 "$source_dir/customer-host-network.py" /usr/local/libexec/playbound-customer-host-network
install -o root -g root -m 755 "$source_dir/customer-seccomp.py" /usr/local/libexec/playbound-customer-seccomp
install -o root -g root -m 755 "$source_dir/customer-native-engine.py" /usr/local/libexec/playbound-customer-native-engine
python3 -m py_compile "$source_dir/customer-data-migration.py"
python3 -m py_compile "$source_dir/customer-network-check.py"
install -o root -g root -m 755 "$source_dir/customer-runtime.py" /usr/local/libexec/playbound-customer-runtime
# Operator-only checkpoint preparation: intentionally absent from sudoers.
install -o root -g root -m 755 "$source_dir/customer-data-migration.py" /usr/local/libexec/playbound-customer-data-migration
install -o root -g root -m 755 "$source_dir/customer-network-check.py" /usr/local/libexec/playbound-customer-network-check
python3 -m py_compile "$source_dir/customer-world-backups.py"
install -o root -g root -m 755 "$source_dir/customer-world-backups.py" /usr/local/libexec/playbound-customer-world-backups
file_source="$source_dir/.."
if test -f "$source_dir/dedicatedFiles.js"; then file_source="$source_dir"; fi
install -d -o root -g root -m 755 /usr/local/libexec/playbound-customer-files
install -o root -g root -m 644 "$file_source/dedicatedFiles.js" /usr/local/libexec/playbound-customer-files/dedicatedFiles.js
install -o root -g root -m 644 "$file_source/dedicatedDataBackups.js" /usr/local/libexec/playbound-customer-files/dedicatedDataBackups.js
install -o root -g root -m 644 "$source_dir/customer-file-worker.mjs" /usr/local/libexec/playbound-customer-files/worker.mjs
printf '{"type":"module"}\n' > /usr/local/libexec/playbound-customer-files/package.json
chown root:root /usr/local/libexec/playbound-customer-files/package.json
chmod 644 /usr/local/libexec/playbound-customer-files/package.json
rule="$(mktemp)"
trap 'rm -f "$rule"' EXIT
printf '%s\n' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime run *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime run-native *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime stop *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime status *' > "$rule"
printf '%s\n' 'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-runtime migration *' >> "$rule"
printf '%s\n' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-world-backups list *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-world-backups create *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-world-backups restore *' \
  'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-customer-world-backups files *' >> "$rule"
# Interrupted restore recovery is direct-root operator only.
visudo -cf "$rule"
install -o root -g root -m 440 "$rule" /etc/sudoers.d/playbound-customer-runtime
echo 'Installed opt-in customer runtime handoff; live process users unchanged'
