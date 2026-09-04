#!/usr/bin/env python3
"""diff.py <frame.png> <bare.png> [x0,y0,x1,y1 ...]  — счёт изменённых пикселей."""
import sys, numpy as np
from PIL import Image
def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
f = load(sys.argv[1]); b = load(sys.argv[2])
boxes = sys.argv[3:] or ['0,0,%d,%d' % (f.shape[1], f.shape[0])]
for spec in boxes:
    x0,y0,x1,y1 = [int(v) for v in spec.split(',')]
    A = f[y0:y1, x0:x1]; B = b[y0:y1, x0:x1]
    d = np.abs(A-B).max(axis=2)
    mask = d>25
    out = "%-46s box %s (%dpx): >25=%d >60=%d" % (sys.argv[1].split('/')[-1], spec, d.size, int(mask.sum()), int((d>60).sum()))
    if mask.any():
        sel = A[mask]; lum = sel.mean(axis=1); sat = sel.max(axis=1)-sel.min(axis=1)
        out += " | darkest%s | maxsat%s=%d | mean%s" % (tuple(int(v) for v in sel[int(lum.argmin())]), tuple(int(v) for v in sel[int(sat.argmax())]), int(sat.max()), tuple(int(v) for v in sel.mean(axis=0)))
    print(out)
