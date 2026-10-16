#!/usr/bin/env bash
# Explicit operator build only; never executed by the game-host service.
# Does not replace an installed engine or change customer enrollment.
set -euo pipefail
test "$#" = 0 || { echo 'No arguments are accepted'; exit 1; }
test "$(id -u)" != 0 || { echo 'Build as an unprivileged staging user'; exit 1; }
source_dir="$(cd "$(dirname "$0")" && pwd)"
build_root=/opt/playbound-host/staging/stk-isolation-build-1.4
revision=bea5b530a56296e6110e7755a56d79742bd94176
test -d "$build_root" && test ! -L "$build_root"
test "$(stat -c %u "$build_root")" = "$(id -u)"
if test ! -e "$build_root/source"; then
  git clone --depth=1 --branch=1.4 https://github.com/supertuxkart/stk-code.git "$build_root/source"
fi
test "$(git -C "$build_root/source" rev-parse HEAD)" = "$revision"
test "$(git -C "$build_root/source" remote get-url origin)" = https://github.com/supertuxkart/stk-code.git
if git -C "$build_root/source" diff --quiet; then
  git -C "$build_root/source" apply --check "$source_dir/stk-isolated-network.patch"
  git -C "$build_root/source" apply "$source_dir/stk-isolated-network.patch"
fi
# A resumed build may contain exactly this reviewed patch and nothing else.
git -C "$build_root/source" diff --binary > "$build_root/current.patch"
git -C "$build_root/source" apply --reverse --check "$source_dir/stk-isolated-network.patch"
test "$(git -C "$build_root/source" diff --name-only)" = "$(printf 'src/network/network_config.cpp\nsrc/network/stk_host.cpp')"
test "$(git -C "$build_root/source" diff --no-ext-diff --binary | sha256sum | cut -d' ' -f1)" = 4b414016c67e623dc02096cccb4d2fca55f98201f517197e23cb60cc107e8255
cmake -S "$build_root/source" -B "$build_root/build" -DSERVER_ONLY=ON \
  -DCHECK_ASSETS=OFF -DCMAKE_BUILD_TYPE=Release -DUSE_CRYPTO_OPENSSL=ON \
  -DSTK_INSTALL_DATA_DIR=/usr/share/games/supertuxkart
cmake --build "$build_root/build" --parallel 2
echo 'Staging build completed. Root-owned promotion and isolated acceptance are still required.'
