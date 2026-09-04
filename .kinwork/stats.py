#!/usr/bin/env python3
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.int16)
x0,y0,x1,y1 = [int(v) for v in sys.argv[2].split(',')]
A = a[y0:y1, x0:x1].reshape(-1,3)
lum = A.mean(axis=1); sat = A.max(axis=1)-A.min(axis=1)
print("%-46s box %s n=%d min%s max%s mean%s std%s | lum std=%.1f | sat mean=%.1f max=%d" % (
  sys.argv[1].split('/')[-1], sys.argv[2], A.shape[0], tuple(int(v) for v in A.min(axis=0)), tuple(int(v) for v in A.max(axis=0)),
  tuple(round(float(v),1) for v in A.mean(axis=0)), tuple(round(float(v),1) for v in A.std(axis=0)), float(lum.std()), float(sat.mean()), int(sat.max())))
