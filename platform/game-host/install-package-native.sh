#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo 'Run as root'; exit 1; }
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST=/usr/local/libexec/playbound-package-native
install -d -o root -g root -m 755 "$DEST"
install -o root -g root -m 755 "$SOURCE/promote-package-native.py" "$DEST/promote-package-native.py"
install -o root -g root -m 644 "$SOURCE/nativePackageProfiles.json" "$DEST/nativePackageProfiles.json"
RULE="$(mktemp)"
trap 'rm -f -- "$RULE"' EXIT
# Python validates both fixed game names and the UUID; there are no path inputs.
printf '%s\n' 'playbound ALL=(root) NOPASSWD: /usr/local/libexec/playbound-package-native/promote-package-native.py bzflag *, /usr/local/libexec/playbound-package-native/promote-package-native.py hedgewars *, /usr/local/libexec/playbound-package-native/promote-package-native.py openttd *, /usr/local/libexec/playbound-package-native/promote-package-native.py luanti *' > "$RULE"
visudo -cf "$RULE"
install -o root -g root -m 440 "$RULE" /etc/sudoers.d/playbound-package-native
