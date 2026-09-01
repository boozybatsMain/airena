/**
 * Заселить библиотеку НАСТОЯЩИМИ существами — через продуктовый путь целиком.
 *
 * Зачем отдельно от `tools/seed.mjs`. Тот берёт мозги из `brains/`: они
 * написаны заранее, лежат файлами и никуда не ходят. Этого хватало, пока
 * библиотека была только спарринг-партнёром. Но библиотека — ещё и ВИТРИНА:
 * из неё берутся показательные бои и три существа, между которыми выбирает
 * гость. А там она обязана показывать игру, а не заготовку:
 *
 *   — существа с набором из грамматики были только рукописные, значит
 *     показательный бой либо показывал §8 и не показывал тезис «мозг пишет
 *     нейросеть», либо наоборот;
 *   — гостю в стартовой тройке доставались те же рукописные эталоны.
 *
 * Здесь существо делается ровно так, как его сделает игрок: `forgeCreature`,
 * то есть разбор промпта, тело и мозг параллельно, допуск через A1, карточка
 * тактики. Разница одна — итог помечается библиотечным.
 *
 *   node tools/seedlive.mjs                        три существа по умолчанию
 *   node tools/seedlive.mjs "стеклянная медуза"    одно, по своему промпту
 *   node tools/seedlive.mjs --dry                  показать план и цену
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from '../src/server/db.js';
import { create as createCreature } from '../src/server/creatures.js';
import { buildCatalog } from '../src/server/forge/models.js';
import { forgeCreature } from '../src/server/forge/pipeline.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : (process.argv.includes(`--${n}`) ? true : d);
};

/* Три промпта разного характера: дальний, ближний и порча чувств — те же три
   роли, что у стартовых наборов, чтобы витрина показывала разные игры. */
const DEFAULT_PROMPTS = [
  'стеклянная медуза, бьёт издалека и уходит, когда подошли',
  'бронированный краб, входит в упор и не даёт разорвать дистанцию',
  'мотылёк из пепла, слепит и путает того, с кем дерётся',
];

const prompts = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const list = prompts.length ? prompts : DEFAULT_PROMPTS;

const { bundles } = await buildCatalog();
/*
 * `--bundle=<id>` — чтобы можно было заселить витрину не самой дешёвой связкой.
 *
 * По умолчанию берётся бесплатная: библиотека должна показывать то, что
 * получит игрок без денег. Но проверять СВЯЗНОСТЬ существа на ней нельзя —
 * замерено, что дешёвая модель не собирает тело и часто не проходит пятую
 * стену допуска, и тогда неясно, чей это провал: конвейера или модели.
 */
const want = (process.argv.find((a) => a.startsWith('--bundle=')) || '').split('=')[1];
const bundle = (want && bundles.find((b) => b.bundle === want || b.modelId === want))
  || bundles.find((b) => b.tier === 'free') || bundles[0];
if (want && bundle.bundle !== want && bundle.modelId !== want) {
  console.log(`\n  связки «${want}» нет; доступны: ${bundles.map((b) => b.modelId).join(', ')}`);
}
if (!bundle) { console.log('  каталог пуст — нет ключа?'); process.exit(1); }

console.log(`\n  связка: ${bundle.bundle} (${bundle.modelId})`);
console.log(`  существ к созданию: ${list.length}\n`);
for (const p of list) console.log(`    «${p}»`);

if (arg('dry', false)) { console.log('\n  --dry: ничего не создано\n'); process.exit(0); }

const db = openDb(join(ROOT, 'data/airena.db'));
let spent = 0; let made = 0;

for (const prompt of list) {
  console.log(`\n  ── «${prompt}»`);
  const t0 = Date.now();
  let out;
  try {
    out = await forgeCreature({
      prompt, bundle, catalog: bundles,
      onStage: (s, f) => process.stdout.write(`\r     ${s} ${Math.round(f * 100)}%    `),
    });
  } catch (e) {
    console.log(`\r     упало: ${e.message}`.padEnd(60));
    continue;
  }
  spent += out.costUsd || 0;
  if (!out.ok) {
    console.log(`\r     не собралось: ${out.message}`.padEnd(64));
    for (const pr of (out.problems || []).slice(0, 3)) console.log(`       ${pr.message || pr}`);
    continue;
  }
  /*
   * ДЛЯ БИБЛИОТЕКИ ГОДНОСТЬ — ЗАПРЕТ, А НЕ ПРЕДУПРЕЖДЕНИЕ.
   *
   * Библиотека это витрина: из неё берутся показательные бои и три существа,
   * между которыми выбирает гость. Витрина не имеет права показывать бой, в
   * котором ничего не происходит, — а именно это и было: пять библиотечных
   * существ с нулём побед, у трёх больше половины боёв ничьи, то есть две
   * фигуры ходят пятьдесят секунд и умирают от арены.
   *
   * Игроку в его замысле мы отказать не вправе (он меняет набор мгновенно и
   * бесплатно), а себе — обязаны.
   */
  const unviable = (out.note || []).find((n) => n.kind === 'kit_unviable');
  if (unviable) {
    console.log(`     набор не годен: ${unviable.message} — в библиотеку не беру`);
    continue;
  }

  const c = createCreature(db, {
    ownerId: null,
    name: out.name, archetype: out.archetype, bodyRef: out.bodyRef,
    bodySource: out.bodySource, bodySafe: out.bodySafe,
    kit: out.kit, brainSource: out.brainSource, brainModel: out.brainModel,
    constantsVersion: out.constantsVersion, prompt,
    unfit: out.unfit, tacticsCard: out.tacticsCard,
    /* Декорация умений (§9.2). Библиотечные существа — витрина, и показывать
       витрину без того слоя, который игрок получит, значит показывать не игру. */
    vfxIr: out.vfxIr,
    /* §5.1 и D78: что пошло не так при рождении, живёт вместе с существом.
       Игрокский путь заметку писал, витрина — нет, а витрина и есть первый
       экран: гость выбирал «стеклянную медузу» и получал стандартного
       осьминога молча. */
    birthNote: out.note,
    size: out.size,
    /* Промпт этого мозга описывал именно этот набор — значит набор боевой. */
    kitActive: true,
    isLibrary: true,
    /* Рейтинг библиотечного не двигается (см. bump в arena-loop.js), поэтому
       он ставится здесь и означает «примерно такой силы соперник». */
    rating: 1200,
  });
  made++;
  console.log(`\r     ✓ ${c.name} · ${out.archetype} · ${Math.round((Date.now() - t0) / 1000)} с · $${(out.costUsd || 0).toFixed(4)}`.padEnd(70));
  console.log(`       тело: ${out.bodySafe ? `${out.bodySource.length} символов` : 'не собралось, носит тело архетипа'}`);
  console.log(`       набор: ${out.kitReadable.join(' · ')}`);
  for (const n of (out.note || [])) console.log(`       примечание: ${n.message || n.kind}`);
}

console.log(`\n  создано ${made} из ${list.length}, потрачено $${spent.toFixed(4)}\n`);
db.close();
