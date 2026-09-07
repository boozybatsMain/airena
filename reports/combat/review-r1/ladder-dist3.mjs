import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/Users/boozybats/Public/Repos/work/Airena/data/airena.db', { readOnly: true });
console.log('winner values', db.prepare("SELECT winner, count(*) n FROM match WHERE constants_version='c-d3c58948' GROUP BY 1").all().map(r => `${String(r.winner).slice(0,12)}:${r.n}`).join(' '));
const rows = db.prepare(`SELECT m.a_id, m.b_id, m.a_slot, m.b_slot, m.winner, m.reason, m.seconds, m.result_json, ca.kit_active ka, cb.kit_active kb, ca.brain_model ma, cb.brain_model mb, ca.name na, cb.name nb
  FROM match m LEFT JOIN creature ca ON ca.id=m.a_id LEFT JOIN creature cb ON cb.id=m.b_id WHERE m.constants_version=? AND m.kind='ladder' ORDER BY m.started_at DESC`).all('c-d3c58948');
const pct = (a,b)=>`${(100*a/Math.max(1,b)).toFixed(0)}%`;
function analyse(label, rs) {
  const dec = {}; let fixtureWins=0, fixtureGames=0, kittedWins=0;
  for (const r of rs) {
    const rj = JSON.parse(r.result_json); const log = rj.log||[];
    const deathAt={}, burnedAt={}, fireAt={};
    for (const ev of log) { if (ev.type==='death') deathAt[ev.who]=ev.t; else if (ev.type==='burned') burnedAt[ev.who]=ev.t; else if (ev.type==='burnedOut') fireAt[ev.who]=ev.t; }
    // winner: creature id or slot?
    let winSlot = null;
    if (r.winner === r.a_id) winSlot = r.a_slot; else if (r.winner === r.b_id) winSlot = r.b_slot; else if (r.winner==='blue'||r.winner==='orange') winSlot = r.winner; else if (r.winner==='a') winSlot=r.a_slot; else if (r.winner==='b') winSlot=r.b_slot;
    const cause = (side) => deathAt[side]==null ? 'nodeath' : (burnedAt[side]!=null && Math.abs(burnedAt[side]-deathAt[side])<0.05 ? 'arena' : (fireAt[side]!=null && Math.abs(fireAt[side]-deathAt[side])<0.05 ? 'fire' : 'hit'));
    let d; if (r.reason==='kill' && winSlot) d = cause(winSlot==='blue'?'orange':'blue'); else if (r.reason==='double-ko') d='double'; else d = r.reason+'?';
    dec[d]=(dec[d]||0)+1;
    if ((!r.ka) !== (!r.kb)) { fixtureGames++; const fixtureIsA = !r.ka; if (winSlot && ((fixtureIsA && winSlot===r.a_slot) || (!fixtureIsA && winSlot===r.b_slot))) fixtureWins++; }
  }
  console.log(`\n${label}: ${rs.length} matches; decided by ${Object.entries(dec).map(([k,v])=>`${k} ${v} (${pct(v,rs.length)})`).join(', ')}`);
  if (fixtureGames) console.log(`  fixture-vs-kitted games ${fixtureGames}: fixture side won ${fixtureWins} (${pct(fixtureWins,fixtureGames)})`);
}
analyse('c-d3c58948 ALL ladder', rows);
analyse('c-d3c58948 kitted vs kitted', rows.filter(r=>r.ka&&r.kb));
analyse('c-d3c58948 one fixture side', rows.filter(r=>(!r.ka)!==(!r.kb)));
analyse('c-d3c58948 both fixture', rows.filter(r=>!r.ka&&!r.kb));
// which fixture creatures fight most
const fx = {}; for (const r of rows) { if (!r.ka) fx[r.na]=(fx[r.na]||0)+1; if (!r.kb) fx[r.nb]=(fx[r.nb]||0)+1; }
console.log('\nfixture fighters on the current ladder:', Object.entries(fx).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>`${k} ${v}`).join(', '));
db.close();
