#!/bin/sh
# polish.sh <name> [cams|all] — capture 0.06,0.12,0.38,0.8,1.5 of the lightning beam into
# reports/vfx/polish-<name> and print actual vs moment. Since 03.09 the capture tool splits
# close moments into separate casts itself (see `groupMoments` in tools/vfxshot.mjs), so this
# is one command instead of the three merged runs it used to be.
S=$(cd "$(dirname "$0")/../.." && pwd)
OUT=reports/vfx/polish-$1; CAMS=${2:-broadcast,side}
cd "$S" || exit 1
rm -rf "$OUT"
C=""; [ "$CAMS" != "all" ] && C="--cams=$CAMS"
for i in 1 2 3; do tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam $C --moments=0.06,0.12,0.38,0.8,1.5 --out="$OUT" 2>&1 | tail -1; [ -f "$OUT/index.json" ] && break; sleep 3; done
python3 - "$OUT" <<'PY'
import json, sys
m = json.load(open(sys.argv[1] + '/index.json'))
print('fps', m.get('fps'), 'errors', m.get('errors'), 'casts', m.get('casts'))
for s in m['shots']: print('  %-9s cast %d  %.2f -> %.3f %s' % (s['cam'], s.get('cast', 0), s['moment'], s['actual'], 'DRIFT' if abs(s['actual'] - s['moment']) > 0.08 else ''))
PY
