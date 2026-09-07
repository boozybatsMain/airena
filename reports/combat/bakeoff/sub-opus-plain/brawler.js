function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const k = me.kit || {};
  const names = me.skills || [];
  const findKind = (kind) => names.find(n => k[n] && k[n].kind === kind);
  const dash = findKind('dash') || findKind('lunge') || findKind('blink') || findKind('leap');
  const cone = findKind('cone') || findKind('fan') || findKind('beam') || findKind('bolt') || findKind('melee');
  const selfBuff = names.find(n => k[n] && (k[n].aim === 'none' || k[n].kind === 'self' || k[n].kind === 'aura'));

  const d = en.dist;
  const coneReach = cone ? ((k[cone].range || 3) + en.radius) : 4;
  const dashReach = dash ? ((k[dash].distance || k[dash].range || 8) + me.radius + en.radius) : 8;

  if (me.stunned || me.busy) {
    if (!me.busy) api.stop();
    return;
  }

  // Defensive/heal skill
  const lowHp = me.hp / me.maxHp;
  if (selfBuff && api.ready(selfBuff)) {
    const wantShield = (en.casting && en.casting.telegraph && d < 7) || d < 4.5 || lowHp < 0.6;
    if (wantShield) {
      api.use(selfBuff);
      api.faceAt(en.x, en.z);
      return;
    }
  }

  api.faceAt(en.x, en.z);

  // Cone strike in close range
  if (cone && api.ready(cone) && p.enemy.visible && d <= coneReach + 0.4 && !en.airborne) {
    api.use(cone, { x: en.x, z: en.z });
    api.moveTo(en.x, en.z);
    return;
  }

  // Dash to close gap / hit
  if (dash && api.ready(dash) && p.enemy.visible && d > coneReach && d <= dashReach - 0.5) {
    const lead = { x: en.x + en.vx * 0.25, z: en.z + en.vz * 0.25 };
    api.use(dash, lead);
    api.say("Closing in.");
    return;
  }

  // Approach
  if (d > coneReach - 0.5) {
    api.moveTo(en.x, en.z);
  } else {
    // strafe while cone on cooldown
    const t = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    const s = V.perp(t);
    const dir = (Math.floor(p.t * 0.7) % 2 === 0) ? 1 : -1;
    api.move(s.x * dir + t.x * 0.3, s.z * dir + t.z * 0.3);
  }
}