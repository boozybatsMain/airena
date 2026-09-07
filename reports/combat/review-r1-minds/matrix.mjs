import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const OUT = '/Users/boozybats/Public/Repos/work/Airena/reports/combat/bakeoff';
const rows = [];
for (const dir of readdirSync(OUT).sort()) {
  const full = join(OUT, dir);
  let st; try { st = require('node:fs').statSync(full); } catch { continue; }
}
import { statSync } from 'node:fs';
for (const dir of readdirSync(OUT).sort()) {
  const full = join(OUT, dir);
  if (!statSync(full).isDirectory()) continue;
  for (const f of readdirSync(full)) {
    if (!f.endsWith('.json')) continue;
    const rec = JSON.parse(readFileSync(join(full, f), 'utf8'));
    if (!rec.admitted) continue;
    const src = readFileSync(join(full, f.replace('.json', '.js')), 'utf8');
    const c = (re) => (src.match(re) || []).length;
    const literalDist = c(/\b(dist|d|distance|dE|distanceToEnemy|distNow|en\.dist|enemy\.dist|e\.dist|E\.dist)\s*(<=?|>=?)\s*\d+(\.\d+)?/g);
    rows.push({
      mind: `${dir}/${f.replace('.json','')}`, chars: src.length,
      readsKit: c(/\.kit\b/g), enemyKit: c(/enemy\.kit|en\.kit|E\.kit|e\.kit|ekit|enemyKit/g),
      literalDist,
      immune: c(/\.immune\b/g), lead: c(/V\.lead/g), projectiles: c(/projectiles/g), zones: c(/\.zones/g),
      telegraph: c(/telegraph/g), castingRemaining: c(/casting\.(remaining|elapsed)/g), events: c(/p\.events/g), enemyStarted: c(/enemyStarted/g),
      visible: c(/\.visible/g), los: c(/api\.los/g), pathTo: c(/api\.pathTo/g), ray: c(/api\.ray/g), obstacles: c(/obstacles/g),
      status: c(/\.(stunned|rooted|silenced|blinded|burning|shield|invulnerable)\b/g),
      usePoint: c(/api\.use\([^)]*\{\s*x/g) + c(/api\.use\(\w+,\s*(aim|lead|pt|tgt|target|cl|castAt|blinkTo|clampArena|e0|plan\.aim|point|at|land|best|dest|dodgeTarget|esc)/g),
      useBare: c(/api\.use\(\s*['"]?\w+['"]?\s*\)/g), usePair: c(/api\.use\(\w+,\s*[\w.]+\.x,\s*[\w.]+\.z\)/g) + c(/api\.use\(\w+,\s*\w+,\s*\w+\)/g), useNumber: c(/api\.use\(\w+,\s*(a\.dist|d|dist|reach|metres|len)\)/g),
      remember: c(/api\.remember/g), state: /^(let|const|var)\s/m.test(src) ? 1 : 0,
      faceAt: c(/api\.face(At)?\(/g), say: c(/api\.say/g), burn: c(/p\.burn|timeLeft|burnStartsIn/g),
      turnRate: c(/turnRate/g), maxSpeed: c(/maxSpeed/g), heading: c(/enemy\.heading|en\.heading|E\.heading|e\.heading/g),
    });
  }
}
const cols = Object.keys(rows[0]);
console.log(cols.join('\t'));
for (const r of rows) console.log(cols.map((k) => r[k]).join('\t'));
// totals
const n = rows.length;
console.log('\nshare of minds using each (of ' + n + '):');
for (const k of cols.slice(2)) console.log(`  ${k}: ${rows.filter((r) => r[k] > 0).length}/${n}`);
