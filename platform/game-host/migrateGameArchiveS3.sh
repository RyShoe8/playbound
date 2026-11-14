#!/usr/bin/env bash
# One-time, resumable migration of downloadable game packages. Never deletes a source.
set -euo pipefail

root="${MIRROR_ARCHIVE_DIR:-/opt/playbound-host/archive}"
script="${PLAYBOUND_S3_MIGRATOR:-/opt/playbound-host/migrateArchiveS3.mjs}"
log="${PLAYBOUND_S3_MIGRATION_LOG:-/var/log/playbound-s3-migrate.log}"
manifest="${PLAYBOUND_S3_MIGRATION_MANIFEST:-/opt/playbound-host/s3-migration-manifest.nul}"

if [[ ! -n "${GAME_HOST_SECRET:-}" || ! -f "$script" || ! -d "$root/games" || ! -d "$root/launcher-packages" ]]; then
  echo "Missing game archive, migrator, or GAME_HOST_SECRET" >&2
  exit 2
fi

find "$root/games" "$root/launcher-packages" -type f -print0 > "$manifest"
total=$(tr -cd '\0' < "$manifest" | wc -c)
echo "$(date -u +%FT%TZ) Starting S3 migration of $total game packages" >> "$log"
passed=0
failed=0
while IFS= read -r -d '' file; do
  relative="${file#"$root"/}"
  # The single-object migrator hashes the complete source and destination,
  # and refuses to overwrite an existing object with different bytes.
  if nice -n 15 ionice -c 3 node "$script" "$relative" >> "$log" 2>&1; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "$(date -u +%FT%TZ) FAILED: $relative" >> "$log"
  fi
done < "$manifest"
echo "$(date -u +%FT%TZ) Finished: $passed verified, $failed failed, $total listed; VPS sources retained" >> "$log"
(( failed == 0 ))
