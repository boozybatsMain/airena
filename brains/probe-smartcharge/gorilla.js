// DIAGNOSTIC PROBE: dumbape, but charge ONLY into a punish window — the octopus
// is committed to something (busy / casting / stunned) so it cannot juke, and
// its blink is not the thing it is doing. This is the best case for the skill.
function think(p, api) {
  const e = p.enemy, s = p.self;
  api.faceAt(e.x, e.z);
  api.moveTo(e.x, e.z);
  if (s.busy) return;
  if (e.dist < 4.0 && api.ready('smash')) { api.use('smash'); return; }
  const punish = e.busy || e.stunned;
  if (punish && e.dist >= 3.5 && e.dist < 12 && api.ready('charge')) {
    const tof = 0.30 + Math.max(0, e.dist - 2.2) / 15;
    api.faceAt(e.x + e.vx * tof, e.z + e.vz * tof);
    api.use('charge'); return;
  }
}
