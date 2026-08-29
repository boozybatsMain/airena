/**
 * Рукописный эталон для грамматики §8 — сторона осьминога.
 *
 * Тот же смысл, что у `brains/stub`: настоящий, слабый, открыто помеченный
 * спарринг-партнёр (§7.3). Отличие одно и оно в том, ради чего он написан —
 * он читает СВОЙ НАБОР из перцепции (`p.self.kit`, F10) и не знает ни одного
 * имени умения заранее. Смена набора его не ломает и не требует
 * перегенерации: он спрашивает, что у него есть, каждый тик.
 *
 * Он не оптимален и не должен быть: его работа — быть честным полом, на
 * котором новичок выигрывает и понимает почему. И быть тем, на чём видно,
 * что грамматика работает, — без единого вызова модели.
 */

let lastSay = -99;

function think(p, api) {
  const me = p.self;
  const en = p.enemy;
  if (!me || !me.alive || !en) return;

  /* Молча стоять, когда заткнули, — худшее, что можно сделать: игрок увидит
     сломанное существо, а не сработавшее умение противника. Двигаемся. */
  if (me.silenced) {
    api.moveTo(0, 0);
    if (p.t - lastSay > 6) { api.say('нечем ответить'); lastSay = p.t; }
    return;
  }

  const kit = me.kit || {};
  const names = me.skills.filter(function (n) { return n !== 'jump' && kit[n]; });

  /* Ослеплённому нельзя верить своим глазам про врага — он про это знает,
     и держится подальше, пока не пройдёт. */
  if (me.blinded) {
    const away = V.away({ x: me.x, z: me.z }, { x: en.x, z: en.z });
    api.moveTo(me.x + away.x * 6, me.z + away.z * 6);
    if (p.t - lastSay > 8) { api.say('вижу вчерашний день'); lastSay = p.t; }
    return;
  }

  api.faceAt(en.x, en.z);

  /* Активные умения по порядку: первое, что готово и достаёт. Пассивные
     не трогаем — они сработают сами, на то они и пассивные. */
  let best = null;
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    const k = kit[n];
    if (k.trigger !== 'active') continue;
    if (!api.ready(n)) continue;
    const reach = k.range !== undefined ? k.range
      : (k.distance !== undefined ? k.distance : 2.5);
    if (en.dist > reach) continue;
    /* Луч и конус требуют чистой линии; болт и лоб — нет. */
    if ((k.kind === 'beam' || k.kind === 'cone') && !en.visible) continue;
    if (!best || reach < best.reach) best = { name: n, reach: reach, k: k };
  }

  if (best) {
    if (p.t - lastSay > 7) { api.say('держи'); lastSay = p.t; }
    api.use(best.name, en.x - me.x, en.z - me.z);
    return;
  }

  /* Ничего не готово — держим удобную дистанцию. Удобная это чуть меньше
     самой длинной досягаемости, какая есть в наборе. */
  let far = 4;
  for (let i = 0; i < names.length; i++) {
    const k = kit[names[i]];
    const r = k.range !== undefined ? k.range : (k.distance !== undefined ? k.distance : 0);
    if (r > far) far = r;
  }
  const want = far * 0.7;
  const to = V.toward({ x: me.x, z: me.z }, { x: en.x, z: en.z });
  if (en.dist > want + 1.5) api.moveTo(en.x - to.x * want, en.z - to.z * want);
  else if (en.dist < want - 1.5) api.moveTo(me.x - to.x * 4, me.z - to.z * 4);
  else {
    const side = V.perp(to);
    api.moveTo(me.x + side.x * 4, me.z + side.z * 4);
  }
}
