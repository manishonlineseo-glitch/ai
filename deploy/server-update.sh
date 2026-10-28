#!/usr/bin/env bash
# Runs ON THE SERVER. Pulls the latest code from GitHub and copies server/ into the live site.
# Never touches config.php, the database or uploaded files. Rolls back by itself if the site stops answering.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/manishonlineseo-glitch/ai.git}"
BRANCH="${BRANCH:-main}"
REPO="${REPO:-$HOME/jarvis_repo}"
LIVE="${LIVE:-$HOME/domains/udaypurgroup.in/public_html/ai}"
SITE="${SITE:-https://ai.udaypurgroup.in}"
STATE="$HOME/jarvis_backups"
mkdir -p "$STATE"

if [ ! -d "$REPO/.git" ]; then
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$REPO"
fi
git -C "$REPO" fetch --quiet origin "$BRANCH"
NEW=$(git -C "$REPO" rev-parse "origin/$BRANCH")
OLD=$(cat "$STATE/deployed_commit" 2>/dev/null || echo none)
if [ "$NEW" = "$OLD" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "Already up to date ($NEW)."
  exit 0
fi
git -C "$REPO" reset --hard --quiet "origin/$BRANCH"
SRC="$REPO/server"

echo "1/4 PHP syntax check"
bad=0
while IFS= read -r -d '' f; do
  php -l "$f" >/dev/null 2>&1 || { echo "  SYNTAX ERROR: $f"; bad=1; }
done < <(find "$SRC" -name '*.php' -not -path '*/knowledge/*' -print0)
[ "$bad" = 0 ] || { echo "Aborted: nothing was changed on the live site."; exit 1; }

echo "2/4 Backup of the live code"
BK="$STATE/ai_code_$(date +%Y%m%d_%H%M%S).tgz"
tar czf "$BK" -C "$LIVE" --exclude=./knowledge --exclude=./data --exclude=./.git .
ls -1t "$STATE"/ai_code_*.tgz | tail -n +11 | xargs -r rm -f

echo "3/4 Copying files (config.php, database, logs and uploads are left alone)"
rsync -a --exclude 'config.php' --exclude '.git' --exclude 'data/*.sqlite*' --exclude 'data/*.log' --exclude 'data/library' "$SRC/" "$LIVE/"

echo "4/4 Checking the site answers"
code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -H 'X-Requested-With: jarvis' "$SITE/api.php?r=state" || echo 000)
if [ "$code" != 200 ]; then
  echo "Site returned $code: rolling back to $BK"
  tar xzf "$BK" -C "$LIVE"
  exit 1
fi
echo "$NEW" > "$STATE/deployed_commit"
echo "Deployed ${NEW:0:8} (backup: $BK)"
