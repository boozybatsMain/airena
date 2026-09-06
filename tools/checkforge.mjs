/**
 * Инструкция для модели обязана собираться — гейт по A5.
 *
 * `packages/forge` написан на TypeScript и собирается esbuild'ом ПРИ ПЕРВОЙ
 * ГЕНЕРАЦИИ, в рантайме. Это осознанный выбор (см. `loadForge`), но у него
 * есть цена: опечатка в инструкции не видна ни линтеру, ни `npm test`, ни
 * человеку — она видна только тому игроку, который первым нажал «создать».
 *
 * Цена оказалась не теоретической. Правка одного абзаца поставила обратную
 * кавычку внутрь шаблонной строки, инструкция перестала собираться, и
 * генерация тела упала с 15 из 15 до 0 из 15 — на всех моделях сразу, с
 * одинаковым `throw`. Ни один из восемнадцати гейтов этого не заметил, потому
 * что ни один из них не собирал этот пакет.
 *
 * Гейт делает ровно то, что делает сервер, и проверяет, что инструкция не
 * только собралась, но и осталась инструкцией: пустая строка или строка в
 * двести символов собирается прекрасно и не годится никуда.
 *
 *   node tools/checkforge.mjs
 */

import { loadForge } from '../src/server/forge/body.js';

let bad = 0;
const ok = (what, cond, note = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

console.log('\n  ИНСТРУКЦИЯ ДЛЯ ТЕЛА\n');

let forge = null;
try {
  forge = await loadForge();
  ok('пакет packages/forge собирается', true);
} catch (e) {
  ok('пакет packages/forge собирается', false, String(e.message).split('\n')[0].slice(0, 120));
}

if (forge) {
  const parts = ['FORGE_SCOPE', 'FORGE_CONVENTION'];
  for (const p of parts) {
    const v = forge[p];
    ok(`${p} — непустая строка`, typeof v === 'string' && v.length > 200, typeof v === 'string' ? `${v.length} символов` : typeof v);
  }
  /* Обещания инструкции должны совпадать с фасадом: перечислять модели то,
     чего в песочнице нет, — это платить за отказ её же деньгами. */
  const { THREE_ALLOWED } = await import('../src/viewer/loadbody.js');
  const scope = String(forge.FORGE_SCOPE || '');
  const promised = scope.match(/\b(?:Mesh|SkinnedMesh|Bone|Skeleton|Sprite|InstancedMesh|Group|Points|Line|Object3D|Vector3|Quaternion|Euler|Matrix4|Color|Curve|CatmullRomCurve3|Box3|MathUtils)\b/g) || [];
  const missing = [...new Set(promised)].filter((n) => !THREE_ALLOWED.includes(n));
  ok('всё, что инструкция обещает, есть в фасаде', missing.length === 0, missing.length ? `нет: ${missing.join(', ')}` : `${new Set(promised).size} имён`);
  ok('инструкция называет то, чего в песочнице НЕТ', /lights|Texture|Loader/.test(scope));

  /*
   * ── ИНСТРУКЦИЯ ОБЯЗАНА НАЗЫВАТЬ СТЕНЫ, ПО КОТОРЫМ ЕЁ СУДЯТ ────────────────
   *
   * Замерено на пятнадцати живых отказах: `write_unknown` — неявная глобаль —
   * дал 4 из 15, больше любой другой причины. Правило есть в `analyseBody` и
   * не было ни в одной строке инструкции. По критерию основателя «ошибки не по
   * нашей вине» это НАША вина: мы судим по правилу, которого не сказали.
   *
   * Проверяется не красота формулировки, а наличие каждого правила, которое
   * умеет отвергнуть тело. Список привязан к кодам отказа `analyseBody`: когда
   * там появится новая стена, этот гейт заставит дописать инструкцию.
   */
  const WALLS = [
    ['неявная глобаль (write_unknown)', /implicit global|declare everything|Declare everything/i],
    ['синхронность (async)', /\basync\b|\bawait\b/i],
    ['модули и eval (import, constructor)', /\bimport\b[\s\S]{0,80}\brequire\b|new Function|constructor/i],
    ['таймеры', /setTimeout|requestAnimationFrame|timers/i],
    /* `\bDate\b` ловилось словом из соседнего абзаца — стена «детерминизм»
       переживала удаление всего блока стен. Ищется связка: запрет + причина. */
    ['детерминизм (Date, random)', /No Date, no Math\.random/i],
    ['запись в чужое', /Do not write to|only to your own/i],
  ];
  const conv = String(forge.FORGE_CONVENTION || '');
  const both = `${scope}\n${conv}`;
  for (const [what, re] of WALLS) ok(`инструкция называет стену: ${what}`, re.test(both));
}

// ── промпт кузницы называет закрытые списки форм (docs/VFX-PLAN.md §7.5) ───
{
  /* Без этой строки E1 молча подменял бы стихию у умения игрока: модель не
     знала бы, что «временного луча» не бывает. С 04.09 проверка перестала
     быть вакуумной: пять стихий выпущены, и у всех пяти список форм закрыт,
     то есть каждая обязана назвать свои формы в промпте кузницы. */
  const { grammar, DELIVERIES } = await import('../src/skills/registry.js');
  const g = grammar();
  const { parseUserPrompt } = await import('../src/server/forge/pipeline.js');
  const txt = parseUserPrompt(g);
  for (const el of Object.values(g.elements)) {
    if (!Array.isArray(el.forms) || el.forms.length >= Object.keys(DELIVERIES).length) continue;
    /* The prompt is English since the §9 sweep; the phrase the gate pins moved
       with it («только доставки» → "deliveries only"). Reworded, not deleted. */
    ok(`промпт кузницы называет формы «${el.ru}»`, txt.includes(`${el.id} (${el.ru}; deliveries only `));
  }
  /*
   * КАЛИТКА, А НЕ ЖИЛЕЦ (та же правка, что в `checkgrammar` 04.09). Здесь
   * стоял список имён четырёх тогда-нерелизных стихий, и выпуск сделал его
   * ложным. Проверяется механизм: стихия, помеченная `unreleased`, из
   * промпта пропадает — флаг ставится временно и снимается в `finally`.
   */
  const { ELEMENTS } = await import('../src/skills/registry.js');
  ELEMENTS.acid.unreleased = true;
  try {
    const hidden = parseUserPrompt(grammar());
    ok('промпт кузницы не предлагает нерелизную стихию',
      !/\bacid \(/.test(hidden) && /\bacid \(/.test(txt), 'grammar() отдаёт только выпущенные');
  } finally { delete ELEMENTS.acid.unreleased; }
}

console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
