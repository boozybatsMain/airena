/**
 * Склейка неподвижных частей тела — ради кадров.
 *
 * ── ЧТО ЗАМЕРЕНО ───────────────────────────────────────────────────────────
 *
 * В настоящем Chrome, на живом бою, дев-сервер, два эталонных тела:
 *
 *   8408 вызовов отрисовки → 18.5 кадра в секунду
 *   4194 вызова (тела убраны из сцены) → 33.8
 *     41 вызов (только арена) → 119
 *
 * То есть кадр стоит примерно 6 микросекунд на вызов отрисовки, и вся цена —
 * в их числе. Разрешение не влияет вовсе: уменьшение канваса вчетверо дало
 * 33.9 против 34.0. Упирается процессор, а не видеокарта.
 *
 * Наши эталонные тела — 2115 и 2039 мешей. Сгенерированные моделями — от 107
 * до 546. То есть медленные тела у нас СВОИ, а не чужие.
 *
 * ── ЗАЧЕМ ЭТО РАБОТАЕТ ─────────────────────────────────────────────────────
 *
 * Замерено там же: поза шевелит 101 узел из 2281 у осьминога и 84 из 2174 у
 * гориллы. Четыре процента. Остальные 96% стоят неподвижно относительно своего
 * родителя — и существуют как отдельные вызовы отрисовки только потому, что их
 * так написали.
 *
 * Значит их можно слить в одну геометрию на каждого «живого» предка и на
 * каждый материал. Силуэт не меняется ни на пиксель: вершины пересчитываются в
 * систему координат предка, а предок продолжает двигаться как двигался. Тень
 * тоже остаётся своей — в отличие от заменителя-эллипсоида, который дал бы
 * похожий выигрыш, но превратил бы тень существа в пятно.
 *
 * ── ПОЧЕМУ СВОЙ КОД, А НЕ `BufferGeometryUtils` ────────────────────────────
 *
 * Аддон живёт в `three/examples` и в наш бандл не входит. Втащить его значит
 * добавить вес к первому кадру — а он под гейтом (`checkboot`). Нужного здесь
 * — слияние позиций, нормалей, UV и индексов — восемьдесят строк, и они
 * полностью наши.
 *
 * ── ГЛАВНОЕ: ЭТО ПРОВЕРЯЕТ СЕБЯ ───────────────────────────────────────────
 *
 * Поза — чужой код. Она может обращаться к детям по индексу, и тогда удаление
 * слитых мешей её сломает. Предугадать это нельзя, а проверить можно: до
 * склейки снимается «отпечаток» позы (что она двигает и на сколько), после —
 * снимается снова. Разошлись — склейка ОТМЕНЯЕТСЯ целиком, тело остаётся
 * прежним, и в консоль уходит строка. Медленное тело лучше сломанного.
 */

/**
 * Состояния, в которых снимается отпечаток позы. Крайние точки контракта.
 *
 * Экспортируется ради гейта: поза может копить состояние (интегрировать по
 * `dt`), поэтому сравнивать склеенное тело с нетронутым можно только после
 * ОДИНАКОВОЙ истории вызовов. Без этого разница в габарите достигала 0.23 м —
 * честный ответ на неверный вопрос.
 */
export const PROBE = (() => {
  /*
   * Выборка обязана покрыть ВЕСЬ контракт позы, а не «крайние точки».
   *
   * Сначала здесь было четыре состояния — покой, бег, удар, смерть, — и этого
   * не хватило: у гориллы нашлась часть, которая двигается на действиях, куда
   * выборка не заглянула, её сочли неподвижной и приклеили. Замерено гейтом:
   * постановка на пол уехала на 8.5 см. Осьминог при этом сходился побитово,
   * то есть ошибка молчала бы через раз.
   *
   * Здесь все восемь действий контракта, две фазы у каждого и несколько
   * значений `t`: анимация обычно синусоидальная, и четыре отсчёта её просто
   * не увидят. Стоит это десятков вызовов позы один раз при загрузке.
   */
  const actions = [null, 'attack', 'fire', 'hit', 'jump', 'die', 'block', 'signal', 'land'];
  const out = [];
  let t = 0;
  for (const action of actions) {
    for (const phase of [0.15, 0.65]) {
      t += 0.37;
      out.push({
        t, dt: 1 / 60,
        speed: action === null ? (out.length % 2 ? 0 : 5.5) : 2.5,
        stride: action === null ? (out.length % 2 ? 0 : 0.8) : 0.4,
        turn: out.length % 3 === 0 ? 1 : -1,
        grounded: action !== 'jump',
        health: action === 'die' ? 0 : (action === 'hit' ? 0.35 : 1),
        action, phase,
      });
    }
  }
  return out;
})();

/*
 * Преобразуются только эти два: позиция едет матрицей, нормаль — нормальной
 * матрицей. Всё остальное — данные вершины, не зависящие от того, где вершина
 * стоит (`uv`, `aEdge` у гориллы, цвета), и копируется как есть.
 *
 * Сначала здесь стоял белый список из трёх имён, и горилла не склеилась ВООБЩЕ:
 * её материал читает собственный атрибут `aEdge`, и белый список отверг все
 * 1501 меш разом. Белый список на данные, которых мы не писали, — это способ
 * не работать с половиной тел.
 */
const SPATIAL = new Set(['position', 'normal']);

const localOf = (o) => `${o.position.x},${o.position.y},${o.position.z},`
  + `${o.rotation.x},${o.rotation.y},${o.rotation.z},`
  + `${o.scale.x},${o.scale.y},${o.scale.z},${o.visible ? 1 : 0}`;

/**
 * Отпечаток позы: что и на сколько она двигает, снятое по МИРОВЫМ матрицам
 * тех узлов, которые переживут склейку.
 *
 * Мировые, а не локальные: после склейки промежуточных узлов может не стать, и
 * сравнивать локальные было бы сравнением разных деревьев. Мир — то, что видит
 * зритель, и он обязан не измениться.
 */
function fingerprint(root, keep) {
  const out = [];
  for (const s of PROBE) {
    try { root.userData.pose(s); } catch (e) { return { failed: e.message }; }
    root.updateMatrixWorld(true);
    for (const o of keep) out.push(o.matrixWorld.elements.map((v) => Math.round(v * 1e4)).join(','));
  }
  return { rows: out };
}

/** Узлы, чьё локальное положение поза меняет хоть в одном из состояний. */
function movingNodes(root) {
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  let base;
  try { root.userData.pose(PROBE[0]); } catch { return null; }
  base = nodes.map(localOf);
  const moved = new Set();
  for (const s of PROBE.slice(1)) {
    try { root.userData.pose(s); } catch { return null; }
    nodes.forEach((o, i) => { if (localOf(o) !== base[i]) moved.add(o); });
  }
  return moved;
}

/** Ближайший предок, который двигается (или сам корень). */
function anchorOf(o, moving, root) {
  let n = o.parent;
  while (n && n !== root) {
    if (moving.has(n)) return n;
    n = n.parent;
  }
  return root;
}

/** Можно ли слить этот меш: обычный, видимый, с понятными атрибутами. */
function mergeable(o, moving) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return false;
  if (!o.geometry || !o.geometry.attributes.position) return false;
  if (o.visible === false || moving.has(o)) return false;
  if (o.geometry.morphAttributes && Object.keys(o.geometry.morphAttributes).length) return false;
  if (Array.isArray(o.material)) return false;
  /* Атрибуты могут быть любыми, но целочисленные не сливаем: у них своя
     семантика (индексы костей, флаги), и складывать их со смещением нельзя. */
  for (const a of Object.values(o.geometry.attributes)) {
    if (!(a.array instanceof Float32Array)) return false;
  }
  return true;
}

/**
 * Слить группу мешей в одну геометрию в системе координат якоря.
 *
 * Позиции умножаются на матрицу «меш относительно якоря», нормали — на её
 * нормальную матрицу, остальные атрибуты копируются как есть.
 */
function mergeGroup(THREE, list, anchor) {
  /* Набор атрибутов обязан совпадать у всех участников: буфер один, и половина
     группы без `uv` поехала бы текстурой. Расходится — не сливаем вовсе. */
  const names = Object.keys(list[0].geometry.attributes).sort();
  const sig = names.map((n) => `${n}:${list[0].geometry.attributes[n].itemSize}`).join('|');
  for (const o of list) {
    const ns = Object.keys(o.geometry.attributes).sort();
    if (ns.join('|') !== names.join('|')) return null;
    if (ns.map((n) => `${n}:${o.geometry.attributes[n].itemSize}`).join('|') !== sig) return null;
  }

  const inv = new THREE.Matrix4().copy(anchor.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();

  let verts = 0; let idx = 0;
  for (const o of list) {
    const g = o.geometry;
    verts += g.attributes.position.count;
    idx += g.index ? g.index.count : g.attributes.position.count;
  }
  if (verts > 65535 * 16) return null; // разумный предел на одну склейку

  const buf = {};
  for (const n of names) buf[n] = new Float32Array(verts * list[0].geometry.attributes[n].itemSize);
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);

  let vo = 0; let io = 0;
  for (const o of list) {
    const g = o.geometry;
    rel.multiplyMatrices(inv, o.matrixWorld);
    nm.getNormalMatrix(rel);
    const count = g.attributes.position.count;
    for (const n of names) {
      const a = g.attributes[n];
      const size = a.itemSize;
      const dst = buf[n];
      if (SPATIAL.has(n) && n === 'position') {
        for (let i = 0; i < count; i++) {
          v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(rel);
          dst[(vo + i) * 3] = v.x; dst[(vo + i) * 3 + 1] = v.y; dst[(vo + i) * 3 + 2] = v.z;
        }
      } else if (SPATIAL.has(n)) {
        for (let i = 0; i < count; i++) {
          v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix3(nm).normalize();
          dst[(vo + i) * 3] = v.x; dst[(vo + i) * 3 + 1] = v.y; dst[(vo + i) * 3 + 2] = v.z;
        }
      } else {
        for (let i = 0; i < count; i++) {
          for (let k = 0; k < size; k++) dst[(vo + i) * size + k] = a.array[i * size + k];
        }
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.getX(i) + vo;
    } else {
      for (let i = 0; i < count; i++) index[io + i] = i + vo;
    }
    vo += count;
    io += g.index ? g.index.count : count;
  }

  const out = new THREE.BufferGeometry();
  for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(buf[n], list[0].geometry.attributes[n].itemSize));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();

  /*
   * ЧАСТИ ЗАПОМИНАЮТСЯ ОРИЕНТИРОВАННЫМИ, а не коробками.
   *
   * Одна коробка на склейку грубее, чем много маленьких: при повороте якоря
   * общая разрастается сильнее суммы прежних. Замерено: габарит осьминога
   * вырос на 0.23 м, а по нему тело ставится на пол — существо повисло бы над
   * своей тенью.
   *
   * Первая попытка чинить это хранила коробки частей — и осталась неточной по
   * той же причине этажом ниже: коробка повёрнутой части в системе склейки
   * снова разрастается. Замерено на горилле: 8.5 см.
   *
   * Поэтому хранится не коробка, а центр и три вектора полуосей, уже
   * повёрнутые. Размах вдоль любого направления `d` для такой части считается
   * точно: `c·d ± (|u·d| + |v·d| + |w·d|)`. Четыре скалярных произведения
   * вместо одного — и ноль расхождения.
   */
  const sub = [];
  const rel2 = new THREE.Matrix4();
  for (const o of list) {
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    rel2.multiplyMatrices(inv, o.matrixWorld);
    const e = rel2.elements;
    const hx = (bb.max.x - bb.min.x) * 0.5;
    const hy = (bb.max.y - bb.min.y) * 0.5;
    const hz = (bb.max.z - bb.min.z) * 0.5;
    const c = bb.getCenter(new THREE.Vector3()).applyMatrix4(rel2);
    sub.push({
      c,
      u: new THREE.Vector3(e[0] * hx, e[1] * hx, e[2] * hx),
      v: new THREE.Vector3(e[4] * hy, e[5] * hy, e[6] * hy),
      w: new THREE.Vector3(e[8] * hz, e[9] * hz, e[10] * hz),
    });
  }
  return { geometry: out, sub };
}

/**
 * Склеить неподвижные части. Возвращает отчёт; тело меняется на месте.
 *
 * @param {object} THREE  тот же namespace, которым построено тело
 * @param {THREE.Object3D} root
 * @returns {{before:number, after:number, groups:number, reverted:boolean, why?:string}}
 */
export function bakeStatic(THREE, root) {
  const countMeshes = () => { let n = 0; root.traverse((o) => { if (o.isMesh && o.geometry) n++; }); return n; };
  const before = countMeshes();
  if (typeof root.userData.pose !== 'function') return { before, after: before, groups: 0, reverted: false, why: 'без позы' };

  const moving = movingNodes(root);
  if (!moving) return { before, after: before, groups: 0, reverted: false, why: 'поза не отработала' };

  root.updateMatrixWorld(true);

  /* Якоря переживают склейку по определению, и по ним же снимается отпечаток:
     это ровно те узлы, чьё движение зритель видит. */
  const anchors = new Set([root, ...moving]);
  const keep = [...anchors];
  const fpBefore = fingerprint(root, keep);
  if (fpBefore.failed) return { before, after: before, groups: 0, reverted: false, why: `поза бросила: ${fpBefore.failed}` };

  /* Группы: якорь × материал. */
  const groups = new Map();
  root.traverse((o) => {
    if (!mergeable(o, moving)) return;
    const anchor = anchorOf(o, moving, root);
    const key = `${anchor.uuid}|${o.material.uuid}`;
    if (!groups.has(key)) groups.set(key, { anchor, material: o.material, list: [] });
    groups.get(key).list.push(o);
  });

  /*
   * ── ГРУППЫ ДЕЛЯТСЯ НА КОМПАКТНЫЕ КУСКИ ────────────────────────────────────
   *
   * Слить весь материал одного якоря в одну геометрию — заманчиво и неверно.
   * Вершины от этого не меняются, а вот ГАБАРИТ меняется: у одного меша своя
   * тесная коробка, а у склейки — одна общая, и при повороте якоря она
   * разрастается сильнее, чем сумма прежних. Замерено на осьминоге: коробка
   * тела выросла на 0.23 м.
   *
   * Это не косметика. По той же коробке (`spanY`) тело ставится на пол, и
   * лишние двадцать сантиметров — это существо, висящее над своей тенью.
   *
   * Поэтому куски держатся КОМПАКТНЫМИ: меши сортируются вдоль длинной оси
   * группы и набираются в кусок, пока его диагональ не превысит доли от
   * диагонали всего тела. Вызовов отрисовки становится немного больше, чем при
   * слиянии «всё в одно», и заметно меньше, чем без склейки.
   */
  const bodyBox = new THREE.Box3().setFromObject(root);
  const bodyDiag = bodyBox.getSize(new THREE.Vector3()).length() || 1;
  /* 0.5 — компромисс между числом вызовов и размером буфера. Точность оценки
     от него больше не зависит (коробки частей хранятся отдельно), а слишком
     крупные склейки хуже работают с отсечением по пирамиде видимости. */
  const CHUNK_SPAN = 0.5;

  const chunksOf = (list) => {
    if (list.length < 2) return [list];
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    const centres = list.map((o) => {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      return o.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);
    });
    const spread = new THREE.Box3();
    centres.forEach((p) => spread.expandByPoint(p));
    const size = spread.getSize(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
    const order = list.map((o, i) => i).sort((i, j) => centres[i][axis] - centres[j][axis]);

    const out = [];
    let cur = [];
    box.makeEmpty();
    for (const i of order) {
      const o = list[i];
      const probe = box.clone();
      o.geometry.boundingBox.getCenter(c).applyMatrix4(o.matrixWorld);
      probe.expandByPoint(c);
      if (cur.length && probe.getSize(new THREE.Vector3()).length() > bodyDiag * CHUNK_SPAN) {
        out.push(cur); cur = []; box.makeEmpty();
      }
      cur.push(o);
      o.geometry.boundingBox.getCenter(c).applyMatrix4(o.matrixWorld);
      box.expandByPoint(c);
    }
    if (cur.length) out.push(cur);
    return out;
  };

  const undo = [];
  let made = 0;
  const chunks = [];
  for (const g of groups.values()) for (const list of chunksOf(g.list)) chunks.push({ ...g, list });
  for (const g of chunks) {
    if (g.list.length < 2) continue;
    const merged = mergeGroup(THREE, g.list, g.anchor);
    if (!merged) continue;
    const geom = merged.geometry;
    const mesh = new THREE.Mesh(geom, g.material);
    mesh.userData.subParts = merged.sub;
    mesh.castShadow = g.list[0].castShadow;
    mesh.receiveShadow = g.list[0].receiveShadow;
    mesh.name = `baked:${g.list.length}`;
    const parents = g.list.map((o) => o.parent);
    g.list.forEach((o) => o.parent && o.parent.remove(o));
    g.anchor.add(mesh);
    undo.push({ mesh, anchor: g.anchor, list: g.list, parents, geom });
    made++;
  }

  const fpAfter = fingerprint(root, keep);
  const same = !fpAfter.failed && fpBefore.rows.length === fpAfter.rows.length
    && fpBefore.rows.every((v, i) => v === fpAfter.rows[i]);
  if (!same) {
    /* Откат целиком: половина склеенного тела хуже, чем несклеенное. */
    for (const u of undo) {
      u.anchor.remove(u.mesh);
      u.geom.dispose();
      u.list.forEach((o, i) => u.parents[i] && u.parents[i].add(o));
    }
    return { before, after: before, groups: 0, reverted: true, why: fpAfter.failed || 'поза повела себя иначе' };
  }

  /*
   * Оригиналы уходят из памяти — но только те, что больше никому не нужны.
   *
   * В горилле 239 геометрий используются НЕСКОЛЬКИМИ мешами сразу. Освободить
   * такую значит сломать всех, кто на неё ещё смотрит; замечено это было бы
   * не сразу и не здесь.
   */
  const stillUsed = new Set();
  root.traverse((o) => { if (o.isMesh && o.geometry) stillUsed.add(o.geometry); });
  for (const u of undo) for (const o of u.list) if (!stillUsed.has(o.geometry)) o.geometry.dispose();

  return { before, after: countMeshes(), groups: made, reverted: false };
}
