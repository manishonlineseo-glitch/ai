#!/usr/bin/env bash
# Runs ON THE SERVER (cron, nightly). Makes a consistent copy of the Jarvis database and keeps the last 14.
# VACUUM INTO writes a clean, complete copy even while the site is using the database.
set -euo pipefail
DB="${DB:-$HOME/jarvis_data/app.sqlite}"
OUT="${OUT:-$HOME/jarvis_backups/db}"
mkdir -p "$OUT"
chmod 700 "$OUT"
STAMP=$(date +%Y%m%d_%H%M%S)
php -r '
$p = new PDO("sqlite:" . $argv[1]);
$p->exec("PRAGMA busy_timeout = 20000");
$p->exec("VACUUM INTO " . $p->quote($argv[2]));
' "$DB" "$OUT/app_$STAMP.sqlite"
chmod 600 "$OUT/app_$STAMP.sqlite"
# a backup that cannot be opened is no backup
php -r '$p = new PDO("sqlite:" . $argv[1]); echo $p->query("PRAGMA integrity_check")->fetchColumn(), PHP_EOL;' "$OUT/app_$STAMP.sqlite" | grep -qx ok || { echo "integrity check FAILED for $OUT/app_$STAMP.sqlite"; exit 1; }
ls -1t "$OUT"/app_*.sqlite | tail -n +15 | xargs -r rm -f
echo "backup ok: $OUT/app_$STAMP.sqlite ($(du -h "$OUT/app_$STAMP.sqlite" | cut -f1))"
