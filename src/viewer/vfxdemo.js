/**
 * Стенд VFX — каждая доставка на каждом элементе, по очереди и по кругу.
 *
 * Дев-инструмент, только в дев-вьювере (`?vfx=1`). В продуктовый бандл не
 * входит: `tools/checkscope.mjs` обходит бандл от страницы игрока, и этот
 * файл в него не попадает.
 *
 * Зачем он вообще нужен. Эффект, который смотрят только в бою, проверяется
 * тем, что бой его когда-нибудь покажет: девять доставок на пять элементов —
 * сорок пять сочетаний, и половина не встретится ни разу за час. Стенд показывает
 * все сорок пять за две минуты, с подписью, что именно сейчас на экране, и
 * позволяет снять их по кадрам с разных ракурсов — то есть сделать
 * визуальную проверку проверкой, а не впечатлением.
 *
 *   /viewer/?vfx=1            все сочетания по кругу
 *   /viewer/?vfx=1&only=zone  одна доставка на всех элементах
 *   /viewer/?vfx=1&hold=2.5   секунд на сочетание
 */

const params = new URLSearchParams(location.search);
/* `?sweep=1` — прогон снимков (`tools/vfxshot.mjs`): ему нужны ручки
   `?vfx=1`, но не карусель и не подпись поверх кадра. */
if (params.get('vfx') && !params.get('sweep')) {
  const ELEMENTS = ['kinetic', 'ember', 'frost', 'arc', 'void'];
  const DELIVERIES = ['beam', 'cone', 'bolt', 'lob', 'zone', 'dash', 'blink', 'self', 'jump', 'wall', 'impact', 'status'];
  const only = params.get('only');
  const HOLD = Number(params.get('hold') || 1.6);

  /*
   * Четырнадцать атомов — четырнадцать разных ударов (§9.2: эффект владеет
   * ударом). Значит и на стенде «impact» это не одна карточка, а четырнадцать:
   * проверять надо разнообразие, а ради этого стенд и существует.
   */
  const ATOMS = ['damage', 'burn', 'knock', 'pull', 'stun', 'root', 'shield',
    'heal', 'cleanse', 'blind', 'silence', 'boost', 'weaken', 'wall'];

  const list = [];
  for (const d of (only ? [only] : DELIVERIES)) {
    if (d === 'impact') {
      /* Удары перебираются по атомам, а элемент фиксируется: иначе
         четырнадцать умножается на пять и стенд идёт семь минут. */
      for (const atom of ATOMS) list.push([d, only ? (params.get('el') || 'ember') : 'ember', atom]);
      continue;
    }
    /* `?el=` сужает и обычные доставки, а не только удары: с появлением
       элементо-зависимых силуэтов (молния у `arc`, D163) смотреть одно
       сочетание стало нужнее, чем перебирать пять. */
    const wanted = params.get('el');
    for (const el of (wanted && ELEMENTS.includes(wanted) ? [wanted] : ELEMENTS)) list.push([d, el]);
  }

  /*
   * ДЕКОРАЦИЯ УРОВНЯ 1 НА СТЕНДЕ.
   *
   *   ?vfx=1&ir=1   read-kit + декорация
   *   ?vfx=1        только read-kit
   *
   * Два режима нужны именно парой. Вопрос, на который отвечает стенд, — не
   * «красиво ли», а «ВИДНО ЛИ РАЗНИЦУ»: декорация, неотличимая от её
   * отсутствия, стоит денег генерации и не даёт ничего. Сравнить это можно
   * только двумя снимками одного и того же сочетания.
   *
   * IR здесь наши, не модельные, и это правильно: проверяется интерпретатор и
   * читаемость, а не вкус конкретной модели. Что напишет модель, проверяет
   * гейт `tools/checkvfx.mjs` — он гоняет ВСЕ 480 сочетаний частей.
   */
  const IR = params.get('ir') === '1';
  const IR_BY_DELIVERY = {
    beam: { layers: [{ emitter: 'trail', motion: 'ease_out', sprite: 'streak', decal: 'none', from: 0, to: 2, count: 40, life: 0.5, delay: 0, speed: 6, size: 0.22 }] },
    cone: { layers: [{ emitter: 'cone', motion: 'gravity', sprite: 'shard', decal: 'scorch', from: 1, to: 2, count: 46, life: 0.9, delay: 0.05, speed: 8, size: 0.26 }] },
    bolt: { layers: [{ emitter: 'spiral', motion: 'swirl', sprite: 'spark', decal: 'none', from: 0, to: 1, count: 36, life: 0.7, delay: 0, speed: 5, size: 0.16 }] },
    lob: { layers: [{ emitter: 'rain', motion: 'gravity', sprite: 'dot', decal: 'ring', from: 1, to: 2, count: 44, life: 1.1, delay: 0.1, speed: 4, size: 0.2 }] },
    zone: { layers: [{ emitter: 'ring', motion: 'rise', sprite: 'spark', decal: 'ring', from: 0, to: 2, count: 50, life: 1.4, delay: 0, speed: 2, size: 0.24 }] },
    dash: { layers: [{ emitter: 'trail', motion: 'linear', sprite: 'streak', decal: 'none', from: 2, to: 0, count: 42, life: 0.6, delay: 0, speed: 3, size: 0.3 }] },
    blink: { layers: [{ emitter: 'burst', motion: 'ease_out', sprite: 'shard', decal: 'cross', from: 0, to: 2, count: 38, life: 0.55, delay: 0, speed: 9, size: 0.2 }] },
    self: { layers: [{ emitter: 'spiral', motion: 'rise', sprite: 'spark', decal: 'ring', from: 1, to: 0, count: 40, life: 1.2, delay: 0, speed: 2.5, size: 0.18 }] },
    wall: { layers: [{ emitter: 'rain', motion: 'gravity', sprite: 'shard', decal: 'scorch', from: 2, to: 1, count: 34, life: 0.9, delay: 0, speed: 3, size: 0.26 }] },
    impact: { layers: [{ emitter: 'burst', motion: 'gravity', sprite: 'spark', decal: 'scorch', from: 0, to: 2, count: 48, life: 0.8, delay: 0, speed: 7, size: 0.2 }], screen: 'shake', screenAmount: 0.08 },
    status: { layers: [{ emitter: 'ring', motion: 'rise', sprite: 'dot', decal: 'none', from: 1, to: 2, count: 24, life: 1.3, delay: 0, speed: 1.2, size: 0.14 }] },
  };
  const irFor = (kind) => IR_BY_DELIVERY[kind] || null;

  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:50%;top:96px;transform:translateX(-50%);z-index:40;'
    + 'font:600 15px/1.4 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;'
    + 'color:#cfe6ee;background:rgba(8,14,22,.8);padding:8px 16px;text-align:center';
  document.body.appendChild(label);

  /* Кадры отдаёт тот же путь, что и настоящий бой: сообщение сокета. Стенд
     не рисует ничего сам — иначе он проверял бы себя, а не игру. */
  /*
   * Сочетание держится `hold` секунд и ПОВТОРЯЕТСЯ внутри этого времени
   * каждые `rate`. Одиночный выстрел длиной в полсекунды на четырёхсекундном
   * шаге не поймать ни снимком, ни глазом: три четверти времени экран пуст,
   * и проверка превращается в лотерею. Повтор заодно и честнее — эффект
   * оценивают по тому, как он выглядит в бою, а в бою он не один.
   */
  const RATE = Number(params.get('rate') || 0.7);
  let i = 0;
  let current = null;

  const fire = () => {
    const [kind, element, atom] = current;
    label.textContent = `${kind} · ${element}${atom ? ` · ${atom}` : ''}${IR ? ' · +IR' : ''}   [${(i % list.length) + 1}/${list.length}]`;

    const centre = { x: 0, z: 0 };
    const h = Math.PI * 0.25;
    /* Кастует синяя сторона: `who` — это сторона, а не вид, и стенду нужна
       ровно одна, чтобы цвет эффекта был определён. */
    const base = { kind, element, who: 'blue', t: 0, skill: 'k1' };
    const shapes = {
      beam: { ...base, x0: -6, z0: -6, x1: 8, z1: 8, hit: true },
      cone: { ...base, x: -3, z: -3, h, range: 6, halfAngle: 0.96, hit: true },
      bolt: { ...base, x: -8, z: -8, h, range: 18, speed: 14 },
      lob: { ...base, x: -8, z: -8, h, range: 15, speed: 10 },
      zone: { ...base, x: centre.x, z: centre.z, r: 3.2, duration: 3 },
      dash: { ...base, x0: -7, z0: -7, x1: 4, z1: 4, hit: true },
      blink: { ...base, x0: -5, z0: 4, x1: 5, z1: -4 },
      self: { ...base, x: centre.x, z: centre.z },
      wall: { ...base, x: 2, z: 2, w: 4, d: 1 },
      impact: { ...base, x: centre.x, z: centre.z, effects: atom ? [atom] : ['damage'] },
      status: { ...base, effect: 'burn' },
    };
    const e = shapes[kind];
    if (e && IR) e.__demoVfx = irFor(kind, element, atom);
    if (e) dispatchEvent(new CustomEvent('airena:demofx', { detail: e }));
  };

  const advance = () => {
    current = list[i % list.length];
    i++;
    fire();
  };

  /* Стенду не нужен бой: эффекты рисуются в пустой арене, и это ПРАВИЛЬНО —
     проверяется эффект, а не то, при каких обстоятельствах он случился.
     Ждём только, пока соберётся сцена, — по появлению канваса. */
  const start = () => {
    if (!document.querySelector('canvas')) { setTimeout(start, 200); return; }
    advance();
    setInterval(advance, HOLD * 1000);
    setInterval(() => { if (current) fire(); }, RATE * 1000);
  };
  setTimeout(start, 400);

  console.log(`vfx-стенд: ${list.length} сочетаний, ${HOLD} с на каждое`);
}
