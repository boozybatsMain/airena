/**
 * Стенд VFX — каждая доставка на каждом элементе, по очереди и по кругу.
 *
 * Дев-инструмент, только в дев-вьювере (`?vfx=1`). В продуктовый бандл не
 * входит: `tools/checkscope.mjs` обходит бандл от страницы игрока, и этот
 * файл в него не попадает.
 *
 * Зачем он вообще нужен. Эффект, который смотрят только в бою, проверяется
 * тем, что бой его когда-нибудь покажет: восемь доставок на пять элементов —
 * сорок сочетаний, и половина не встретится ни разу за час. Стенд показывает
 * все сорок за две минуты, с подписью, что именно сейчас на экране, и
 * позволяет снять их по кадрам с разных ракурсов — то есть сделать
 * визуальную проверку проверкой, а не впечатлением.
 *
 *   /viewer/?vfx=1            все сочетания по кругу
 *   /viewer/?vfx=1&only=zone  одна доставка на всех элементах
 *   /viewer/?vfx=1&hold=2.5   секунд на сочетание
 */

const params = new URLSearchParams(location.search);
if (params.get('vfx')) {
  const ELEMENTS = ['kinetic', 'ember', 'frost', 'arc', 'void'];
  const DELIVERIES = ['beam', 'cone', 'bolt', 'lob', 'zone', 'dash', 'blink', 'self', 'wall', 'impact', 'status'];
  const only = params.get('only');
  const HOLD = Number(params.get('hold') || 1.6);

  const list = [];
  for (const d of (only ? [only] : DELIVERIES)) for (const el of ELEMENTS) list.push([d, el]);

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
    const [kind, element] = current;
    label.textContent = `${kind} · ${element}   [${(i % list.length) + 1}/${list.length}]`;

    const centre = { x: 0, z: 0 };
    const h = Math.PI * 0.25;
    const base = { kind, element, who: 'octopus', t: 0, skill: 'k1' };
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
      impact: { ...base, x: centre.x, z: centre.z },
      status: { ...base, effect: 'burn' },
    };
    const e = shapes[kind];
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
