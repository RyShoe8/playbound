#!/usr/bin/env bash
# Fixed opt-in runtime handoff. No account migration or game restarts.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root'; exit 1; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
python3 -m py_compile "$source_dir/customer-xonotic-assets.py"
install -o root -g root -m 755 "$source_dir/customer-xonotic-assets.py" /usr/local/libexec/playbound-customer-xonotic-assets
java_profiles="$source_dir/../customerJavaProfiles.json"
if test -f "$source_dir/customerJavaProfiles.json"; then java_profiles="$source_dir/customerJavaProfiles.json"; fi
install -o root -g root -m 644 "$java_profiles" /usr/local/libexec/playbound-customer-java-profiles.json
doom_profile="$source_dir/../customerFreedoomAssets.json"
if test -f "$source_dir/customerFreedoomAssets.json"; then doom_profile="$source_dir/customerFreedoomAssets.json"; fi
install -o root -g root -m 644 "$doom_profile" /usr/local/libexec/playbound-customer-freedoom-assets.json
asset_profile="$source_dir/../customerHurryAssets.json"
if test -f "$source_dir/customerHurryAssets.json"; then asset_profile="$source_dir/customerHurryAssets.json"; fi
install -o root -g root -m 644 "$asset_profile" /usr/local/libexec/playbound-customer-hurry-assets.json
ac_profile="$source_dir/../customerAssaultCubeAssets.json"
if test -f "$source_dir/customerAssaultCubeAssets.json"; then ac_profile="$source_dir/customerAssaultCubeAssets.json"; fi
install -o root -g root -m 644 "$ac_profile" /usr/local/libexec/playbound-customer-assaultcube-assets.json
python3 -m py_compile "$source_dir/customer-game-assets.py"
install -o root -g root -m 755 "$source_dir/customer-game-assets.py" /usr/local/libexec/playbound-customer-game-assets

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
# Install the reviewed display dependencies without enrolling a game or loading
# any AppArmor policy. A missing enforced per-UID policy still refuses launch.
for helper in corekeeper rvgl display display-entry display-policy; do
  python3 -m py_compile "$source_dir/customer-$helper.py"
  install -o root -g root -m 755 "$source_dir/customer-$helper.py" "/usr/local/libexec/playbound-customer-$helper"
done
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

python3 -m py_compile "$source_dir/customer-factorio-bootstrap.py"
install -o root -g root -m 755 "$source_dir/customer-factorio-bootstrap.py" /usr/local/libexec/playbound-customer-factorio-bootstrap

python3 -m py_compile "$source_dir/customer-openra.py"
install -o root -g root -m 755 "$source_dir/customer-openra.py" /usr/local/libexec/playbound-customer-openra

python3 -m py_compile "$source_dir/customer-rimworld.py" "$source_dir/customer-rimworld-bootstrap.py"
install -o root -g root -m 755 "$source_dir/customer-rimworld.py" /usr/local/libexec/playbound-customer-rimworld
install -o root -g root -m 755 "$source_dir/customer-rimworld-bootstrap.py" /usr/local/libexec/playbound-customer-rimworld-bootstrap

python3 -m py_compile "$source_dir/customer-ss14.py"
install -o root -g root -m 755 "$source_dir/customer-ss14.py" /usr/local/libexec/playbound-customer-ss14

python3 -m py_compile "$source_dir/customer-dst.py"
install -o root -g root -m 755 "$source_dir/customer-dst.py" /usr/local/libexec/playbound-customer-dst
python3 -m py_compile "$source_dir/customer-openfortress.py"
install -o root -g root -m 755 "$source_dir/customer-openfortress.py" /usr/local/libexec/playbound-customer-openfortress
python3 -m py_compile "$source_dir/customer-source.py"
install -o root -g root -m 755 "$source_dir/customer-source.py" /usr/local/libexec/playbound-customer-source
python3 -m py_compile "$source_dir/customer-trackmania.py"
install -o root -g root -m 755 "$source_dir/customer-trackmania.py" /usr/local/libexec/playbound-customer-trackmania
python3 -m py_compile "$source_dir/customer-unturned.py"
install -o root -g root -m 755 "$source_dir/customer-unturned.py" /usr/local/libexec/playbound-customer-unturned
python3 -m py_compile "$source_dir/customer-battlefield.py"
install -o root -g root -m 755 "$source_dir/customer-battlefield.py" /usr/local/libexec/playbound-customer-battlefield
python3 -m py_compile "$source_dir/customer-bombsquad.py"
install -o root -g root -m 755 "$source_dir/customer-bombsquad.py" /usr/local/libexec/playbound-customer-bombsquad
python3 -m py_compile "$source_dir/customer-morrowind.py"
install -o root -g root -m 755 "$source_dir/customer-morrowind.py" /usr/local/libexec/playbound-customer-morrowind
install -o root -g root -m 444 "$source_dir/../tes3mp/playboundAdmin.lua" /usr/local/libexec/playbound-customer-morrowind-admin.lua
python3 -m py_compile "$source_dir/customer-barotrauma.py"
install -o root -g root -m 755 "$source_dir/customer-barotrauma.py" /usr/local/libexec/playbound-customer-barotrauma
python3 -m py_compile "$source_dir/customer-veloren.py"
install -o root -g root -m 755 "$source_dir/customer-veloren.py" /usr/local/libexec/playbound-customer-veloren
