import { DatabaseSync } from 'node:sqlite';
import { panel, score } from '../src/server/adapt.js';
import { kitOf } from '../src/server/arena-loop.js';

const db = new DatabaseSync('data/airena.db');
const rows = db.prepare("select id, archetype, rating, kit_json, kit_active, brain_source, is_library, adaptations from creature where state='active' and brain_source is not null and kit_json is not null order by rating desc").all();
console.log('активных с мозгом и набором:', rows.length);
for (const r of rows.slice(0,8)) console.log(' ', r.id, r.archetype, Math.round(r.rating), 'kit_active=', r.kit_active, 'lib=', r.is_library, 'адаптаций=', r.adaptations);
const me = rows[0];
const opp = panel(db, me, 6);
console.log('панель:', opp.length);
const mySlot = me.archetype === 'gorilla' ? 'gorilla' : 'octopus';
const oppSlot = mySlot === 'octopus' ? 'gorilla' : 'octopus';
const kits = { [mySlot]: kitOf(me), [oppSlot]: (o) => kitOf(o) };
const t0 = Date.now();
const s = await score(me.brain_source, me.archetype, opp, 60, kits);
const ms = Date.now() - t0;
console.log('СТЕНД 60 боёв:', JSON.stringify(s), 'время', ms, 'мс, на бой', (ms/Math.max(1,s.rounds)).toFixed(0), 'мс');
process.exit(0);
