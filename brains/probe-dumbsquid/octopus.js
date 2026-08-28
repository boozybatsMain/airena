// DEGENERACY PROBE (reviewer), the mirror of probe-dumbape: an octopus that
// never READS the gorilla. It never looks at e.casting, never reacts to a
// telegraph. It just fires on cooldown, blinks away on cooldown when the ape is
// close, hops on cooldown when the ape is close, and otherwise backs off.
function think(p, api) {
  const e = p.enemy, s = p.self;
  api.faceAt(e.x, e.z);
  if (e.dist < 5 && api.ready('blink')) { const a = V.away(s, e); api.use('blink', a.x, a.z); return; }
  if (e.dist < 5 && api.ready('jump')) { const a = V.away(s, e); api.move(a.x, a.z); api.use('jump'); return; }
  if (e.visible && e.dist < 23 && api.ready('laser')) { api.use('laser'); }
  if (e.dist < 11) { const a = V.away(s, e); api.move(a.x, a.z); }
  else api.moveTo(e.x, e.z);
}
