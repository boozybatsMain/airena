#!/bin/sh
# Прогон снимков ПО ОЧЕРЕДИ: один headless Chrome на GPU за раз. Несколько
# агентов, снимающих параллельно, сдвигают моменты друг друга на 0.1–0.5 с
# (замер 02.09: 0.3 → 0.5, 0.6 → 0.9). Замок — атомарный mkdir.
#   tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam --moments=0.1,0.3,0.6 --out=reports/vfx/x
LOCK=${TMPDIR:-/tmp}/airena-vfxshot.lock
i=0
while ! mkdir "$LOCK" 2>/dev/null; do
  i=$((i+1)); [ $i -gt 900 ] && { echo "vfxshot-lock: не дождался замка" >&2; exit 2; }
  sleep 2
done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT INT TERM
node "$(dirname "$0")/vfxshot.mjs" "$@"
