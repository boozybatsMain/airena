function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!en.alive) { api.stop(); return; }

  // track enemy dashes
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && (ev.skill === 'k2' || ev.skill === 'k3')) {
      api.remember('edash', p.t);
      const toMe = V.away({ x: en.x, z: en.z }, { x: me.x, z: me.z });
      api.remember('edashDir', { x: en.x + toMe.x * 9, z: en.z + toMe.z * 9 });
    }
    if (ev.type === 'refused') api.remember('refused' + ev.skill, p.t);
  }

  const dist = en.dist;
  const myDir = V.fromHeading(me.heading);
  const toEn = V.toward(me, en);
  const justDashed = (p.t - (api.recall('edash', -99)) < 0.9);
  const offCD1 = api.cooldown('k1') <= 0;
  const offCD2 = api.cooldown('k2') <= 0;
  const offCD3 = api.cooldown('k3') <= 0;

  // if enemy is winding up a cone close to us, hop isn't available; dodge sideways
  if (en.casting && en.casting.skill === 'k1' && en.casting.telegraph && dist < 4.502) {
    const perp = V.perp(toEn);
    const side = (api.rand() < 0.5 ? 1 : -1);
    api.move(V.scale(perp, side).x * 4, V.scale(perp, side).z * 4);
    api.faceAt(en.x, en.z);
    if (dist < 2.788 && offCD1 && me.heading !== null) {
      const ang = V.angleTo(me.heading, toEn);
      if (Math.abs(ang) < 0.492) api.use('k1');
    }
    return;
  }

  // charge k3 when facing them, in range-ish, and my dash line is clear
  if (offCD3 && dist < 9.504 && dist > 1.2 && !me.busy && !en.airborne) {
    const ang = V.angleTo(me.heading, toEn);
    if (Math.abs(ang) < 0.25) {
      const ray = api.ray(toEn.x, toEn.z, dist);
      if (!ray.hit || ray.dist > dist + en.radius) {
        api.use('k3');
        api.say('Держись, лапы в дело идут!');
        return;
      }
    }
  }

  // dash k2 as gap closer or finisher
  if (offCD2 && dist < 12 && dist > 2 && !me.busy && !en.airborne) {
    const ang = V.angleTo(me.heading, toEn);
    if (Math.abs(ang) < 0.25) {
      const ray = api.ray(toEn.x, toEn.z, dist);
      if (!ray.hit || ray.dist > dist + en.radius) {
        api.use('k2');
        return;
      }
    }
  }

  // cone when very close
  if (offCD1 && dist < 3.67 && !me.busy && !en.airborne && en.visible) {
    const ang = V.angleTo(me.heading, toEn);
    if (Math.abs(ang) < 0.738) {
      api.use('k1');
      return;
    }
  }

  // if enemy busy (recovering/dashing toward nothing), press in
  // chase: route around obstacles
  if (en.visible && dist < 17) {
    api.move(toEn.x, toEn.z);
    api.faceAt(en.x, en.z);
    if (dist < 2.6 && !me.busy) {
      // stay glued
    }
  } else {
    const route = api.pathTo(en.x, en.z);
    if (route && route.points.length > 1) {
      const wp = route.points[1];
      const d = V.toward(me, wp);
      api.move(d.x, d.z);
      api.faceAt(en.x, en.z);
    } else {
      api.move(toEn.x, toEn.z);
      api.faceAt(en.x, en.z);
    }
  }

  // burn awareness: keep pressure, never camp
  if (p.burn > 0 && p.t % 5 < 0.2) {
    api.say('Горит всё — жми скорей!');
  }
}