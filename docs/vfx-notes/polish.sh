#!/bin/sh
# polish.sh <name> [cams|all]  — capture 0.06,0.15,0.3,0.6,1.2 in three runs whose moments
# are >= 0.45 s apart (a Page.captureScreenshot costs ~0.3 s and queues the next moment),
# merge into polish/r1/<name>, print actual vs moment and the metrics.
S=$(cd "$(dirname "$0")/../.." && pwd)
OUT=reports/vfx/polish-$1; CAMS=${2:-broadcast,side}
cd "$S" || exit 1
rm -rf $OUT $OUT-a $OUT-b $OUT-c
C=""; [ "$CAMS" != "all" ] && C="--cams=$CAMS"
for i in 1 2 3; do tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam $C --moments=0.06,0.6 --out=$OUT-a 2>&1 | tail -1; [ -f $OUT-a/index.json ] && break; sleep 3; done
for i in 1 2 3; do tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam $C --moments=0.15,1.2 --out=$OUT-b 2>&1 | tail -1; [ -f $OUT-b/index.json ] && break; sleep 3; done
for i in 1 2 3; do tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam $C --moments=0.3 --out=$OUT-c 2>&1 | tail -1; [ -f $OUT-c/index.json ] && break; sleep 3; done
mkdir -p $OUT; cp $OUT-a/*.png $OUT-b/*.png $OUT-c/*.png $OUT/
python3 - "$OUT" <<'PY'
import json, sys
o = sys.argv[1]
runs = [json.load(open(o + s + '/index.json')) for s in ('-a', '-b', '-c')]
m = dict(runs[0]); m['moments'] = sorted(sum((r['moments'] for r in runs), []))
m['shots'] = sorted(sum((r['shots'] for r in runs), []), key=lambda s: (s['cam'], s['moment']))
m['errors'] = sum((r.get('errors', []) for r in runs), []); m['fps'] = min(r.get('fps') or 60 for r in runs)
m['merged_from'] = ['a (0.06,0.6)', 'b (0.15,1.2)', 'c (0.3)']
m['note'] = 'Moments split into three casts: Page.captureScreenshot costs ~0.3 s on WebGPU and delays the next queued moment (one cast with 0.06,0.15,0.3 drifted to 0.06,0.43,0.78). `actual` is page time just before the screenshot call; the frame captured is the one presented then, so the effect clock and the capture agree within a frame.'
json.dump(m, open(o + '/index.json', 'w'), indent=2, ensure_ascii=False)
print('fps', m['fps'], 'errors', m['errors'])
for s in m['shots']: print('  %-9s %.2f -> %.3f %s' % (s['cam'], s['moment'], s['actual'], 'DRIFT' if abs(s['actual'] - s['moment']) > 0.08 else ''))
PY
rm -rf $OUT-a $OUT-b $OUT-c
