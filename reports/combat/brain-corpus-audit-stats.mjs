import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/airena.db', { readOnly: true });
const creatures = db.prepare("select id, name, brain_model, state, kit_active, kit_json from creature").all();
const q = db.prepare("select a_id, b_id, a_slot, b_slot, winner, reason, seconds, result_json from match where (a_id = ? or b_id = ?) and result_json is not null and kind='ladder' order by started_at desc limit 150");
const out = [];
for (const c of creatures) {
  const rows = q.all(c.id, c.id);
  const agg = { id: c.id, name: c.name, model: c.brain_model, state: c.state, kit_active: c.kit_active, n: rows.length, uses: {}, hits: {}, misses: {}, missReasons: {}, refused: {}, faults: 0, thinks: 0, said: 0, secs: 0, wins: 0, dmgDealt: 0, dmgTaken: 0, verbs: {}, evaded: 0, thinkMicros: 0 };
  for (const r of rows) {
    let j; try { j = JSON.parse(r.result_json); } catch { continue; }
    const slot = r.a_id === c.id ? r.a_slot : r.b_slot;
    const side = j[slot]; if (!side) continue;
    agg.secs += r.seconds || 0;
    if (r.winner === c.id || r.winner === slot) agg.wins++;
    agg.faults += side.faults || 0; agg.thinks += side.thinks || 0; agg.said += side.saidLines || 0;
    agg.dmgDealt += side.damageDealt || 0; agg.dmgTaken += side.damageTaken || 0; agg.evaded += side.evaded || 0;
    agg.thinkMicros += side.thinkMicros || 0;
    for (const [k, v] of Object.entries(side.uses || {})) agg.uses[k] = (agg.uses[k] || 0) + v;
    for (const [k, v] of Object.entries(side.hits || {})) agg.hits[k] = (agg.hits[k] || 0) + v;
    for (const [k, v] of Object.entries(side.misses || {})) agg.misses[k] = (agg.misses[k] || 0) + v;
    for (const [k, v] of Object.entries(side.verbs || {})) agg.verbs[k] = (agg.verbs[k] || 0) + v;
    for (const e of j.log || []) {
      if (e.who !== slot) continue;
      if (e.type === 'refused') { const key = `${e.skill}:${e.reason}`; agg.refused[key] = (agg.refused[key] || 0) + 1; }
      if (e.type === 'miss') { const key = `${e.skill}:${e.reason}`; agg.missReasons[key] = (agg.missReasons[key] || 0) + 1; }
    }
  }
  out.push(agg);
}
out.sort((a, b) => String(a.model).localeCompare(String(b.model)) || b.wins - a.wins);
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ');
for (const a of out) {
  if (!a.n) { console.log(`${a.model}\t${a.name}\t${a.id}\tNO MATCHES`); continue; }
  console.log(`${a.model}\t${a.name} (${a.id}) ${a.state} kit_active=${a.kit_active} n=${a.n} win=${(a.wins / a.n * 100).toFixed(0)}% avgSec=${(a.secs / a.n).toFixed(1)} faults/match=${(a.faults / a.n).toFixed(2)} say/match=${(a.said / a.n).toFixed(1)} dmg=${(a.dmgDealt / a.n).toFixed(0)}/${(a.dmgTaken / a.n).toFixed(0)} us/think=${(a.thinkMicros / Math.max(1, a.thinks)).toFixed(0)}`);
  console.log(`   uses/match: ${fmt(Object.fromEntries(Object.entries(a.uses).map(([k, v]) => [k, (v / a.n).toFixed(2)])))} | hits: ${fmt(a.hits)} | misses: ${fmt(a.missReasons)}`);
  console.log(`   refused: ${fmt(a.refused) || '-'} | verbs/match: ${fmt(Object.fromEntries(Object.entries(a.verbs).map(([k, v]) => [k, (v / a.n).toFixed(0)])))}`);
}
