#!/usr/bin/env bash
# Operator-only first enrollment. Existing installations use the update queue.
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo 'Run as an operator'; exit 1; }
root=/opt/playbound-host/games
dest="$root/combined-arms"
[[ "$(realpath -- "$root")" == "$root" && ! -e "$dest" && ! -L "$dest" ]] || {
  echo 'Existing or noncanonical installation requires review'; exit 1;
}
stage="$(mktemp -d "$root/.combined-arms.XXXXXXXX")"
cleanup() {
  [[ "$stage" == "$root"/.combined-arms.* && "$(realpath -- "$stage")" == "$stage" ]] || return
  rm -rf -- "$stage"
}
trap cleanup EXIT
curl --fail --location --proto '=https' --proto-redir '=https' --max-time 300 \
  'https://github.com/Inq8/CAmod/releases/download/1.09/CombinedArms-1.09-x86_64.AppImage' \
  --output "$stage/OpenRA.Server"
[[ "$(stat -c %s "$stage/OpenRA.Server")" == 223889912 ]] || { echo 'Package size differs from review'; exit 1; }
printf '%s  %s\n' '09a56e835cdc22de896bd3731bf975442cbe31769cb04a54f9c444f28ed8049c' "$stage/OpenRA.Server" | sha256sum --check --status
chmod 755 "$stage" "$stage/OpenRA.Server"
chown playbound:playbound "$stage" "$stage/OpenRA.Server"
# Atomic no-clobber activation; never merge a download into an existing install.
[[ ! -e "$dest" && ! -L "$dest" ]] || exit 1
mv --no-clobber --no-target-directory -- "$stage" "$dest"
[[ ! -e "$stage" ]] || { echo 'Concurrent enrollment refused'; exit 1; }
trap - EXIT
echo 'Combined Arms 1.09 enrolled. Hosting eligibility was not changed.'
