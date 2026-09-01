import { DatabaseSync } from 'node:sqlite';
import { runIsolated } from '../src/server/sandbox/index.js';
import { compileKit } from '../src/skills/compile.js';

const db = new DatabaseSync('data/airena.db');
const rows = db.prepare("select id, archetype, rating, kit_json, kit_active, brain_source, adaptations, is_library from creature where state='active' and brain_source is not null and kit_json is not null order by rating desc").all();
const kitOfForced = (c) => { try { const out = compileKit(JSON.parse(c.kit_json||'[]')); return out.problems.length? null : out.defs; } catch { return null; } };
const good = rows.filter(r => kitOfForced(r));
console.log('существ с КОМПИЛИРУЕМЫМ набором:', good.length, 'из', rows.length);
for (const r of good.slice(0,10)) console.log('  ', r.id, r.archetype, Math.round(r.rating), 'adapt=', r.adaptations, 'kit_active=', r.kit_active,
  JSON.parse(r.kit_json).map(s=>`${s.delivery}:${(s.effects||[]).join('+')}`).join(' | '));
