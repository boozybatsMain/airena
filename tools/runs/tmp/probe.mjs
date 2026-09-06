import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
function readPng(path) {
  const buf = readFileSync(path);
  let off = 8, w = 0, h = 0, bd = 8, ct = 6; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 2;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch; const out = Buffer.alloc(h * stride); let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, y * stride + stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev ? prev[x] : 0, c = (prev && x >= ch) ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function LAB(r, g, b) {
  const R = toLin(r / 255), G = toLin(g / 255), B = toLin(b / 255);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  return [116 * labF(Y) - 16, 500 * (labF(X) - labF(Y)), 200 * (labF(Y) - labF(Z))];
}
const [file, ...args] = process.argv.slice(2);
const img = readPng(file);
console.log(`${file}  ${img.w}x${img.h}`);
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
for (const arg of args) {
  const [x0, y0, x1, y1] = arg.split(',').map(Number);
  const rs = [], gs = [], bs = [], Ls = [], As = [], Bs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * img.w + x) * img.ch; const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const [L, A, B] = LAB(r, g, b);
    rs.push(r); gs.push(g); bs.push(b); Ls.push(L); As.push(A); Bs.push(B);
  }
  const a = med(As), b = med(Bs);
  const hex = '#' + [med(rs), med(gs), med(bs)].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  console.log(`  [${arg}] n=${Ls.length} ${hex} L*${med(Ls).toFixed(1)} a*${a.toFixed(1)} b*${b.toFixed(1)} C*${Math.hypot(a, b).toFixed(1)} labh ${(Math.atan2(b, a) * 180 / Math.PI).toFixed(1)}`);
}
