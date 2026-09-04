import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
x0,y0,x1,y1 = [int(v) for v in sys.argv[2].split(',')]
s = int(sys.argv[4]) if len(sys.argv)>4 else 3
im.crop((x0,y0,x1,y1)).resize(((x1-x0)*s,(y1-y0)*s), Image.NEAREST).save(sys.argv[3])
print(sys.argv[3])
