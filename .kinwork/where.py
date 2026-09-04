#!/usr/bin/env python3
"""where.py <frame.png> <bare.png> — bbox изменённой области и её объём."""
import sys, numpy as np
from PIL import Image
def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
f = load(sys.argv[1]); b = load(sys.argv[2])
d = np.abs(f-b).max(axis=2); m = d>25
n = int(m.sum())
if not n: print("%-46s НЕТ ИЗМЕНЕНИЙ (max=%d)" % (sys.argv[1].split('/')[-1], int(d.max()))); raise SystemExit
ys,xs = np.nonzero(m)
sel = f[m]; lum = sel.mean(axis=1)
print("%-46s >25=%d >60=%d bbox=%d,%d,%d,%d darkest%s mean%s" % (sys.argv[1].split('/')[-1], n, int((d>60).sum()), xs.min(), ys.min(), xs.max(), ys.max(), tuple(int(v) for v in sel[int(lum.argmin())]), tuple(int(v) for v in sel.mean(axis=0))))
