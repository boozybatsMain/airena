/**
 * Сквозная проверка ПУТИ ТЕЛА: промпт игрока → модель → стены → база → кадр.
 *
 * Отдельно от `tools/forge.mjs`, и это не дублирование. Тот инструмент —
 * лаборатория: он пишет файл на диск, чтобы человек посмотрел на картинку.
 * Этот проверяет ПРОДУКТОВЫЙ путь: ту же инструкцию зовёт сервер, ответ
 * проходит A1 для тела, и в базу ложатся две колонки — исходник и
 * обезвреженный вариант. Между этими двумя путями помещается вся разница
 * между «модель умеет рисовать» и «игра умеет показать нарисованное».
 *
 *   node tools/checkforgebody.mjs "стеклянная медуза"
 *   node tools/checkforgebody.mjs "боевой краб" --model=google/gemini-3.7-flash
 *   node tools/checkforgebody.mjs --dry     только показать, что будет вызвано
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { forgeBody, loadForge } from '../src/server/forge/body.js';
import { buildCatalog } from '../src/server/forge/models.js';

/*
 * БЕЗ КЛЮЧА — ПРОПУСК, А НЕ ПРОВАЛ.
 *
 * Гейт ходит к настоящей модели. Без ключа обе попытки падали `no_key`,
 * `LlmError` уходил непойманным, и процесс валился стектрейсом с кодом 1 —
 * то есть выглядел как найденная поломка. Гейт, который нельзя прогнать без
 * живого ключа, обязан сказать «пропущено, нужен ключ», иначе он приучает
 * не верить красному.
 */
if (!process.env.OPENROUTER_API_KEY) {
  console.log('\n  ГЕЙТ ТЕЛА ЧЕРЕЗ МОДЕЛЬ: пропущен — нет OPENROUTER_API_KEY.');
  console.log('  Он ходит к настоящей модели; без ключа проверять нечего.\n');
  process.exit(0);
}


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : (process.argv.includes(`--${n}`) ? true : d);
};
const prompt = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'стеклянная медуза';

const forge = await loadForge();
const msgs = forge.buildMessages(prompt, forge.DEFAULT_STYLE);
console.log(`\n  промпт игрока : «${prompt}»`);
console.log(`  инструкция    : ${msgs.system.length} символов, стиль «${forge.DEFAULT_STYLE}»`);

const { bundles } = await buildCatalog();
const wanted = arg('model', null);
const bundle = wanted
  ? bundles.find((b) => b.modelId === wanted || b.bundle === wanted)
  : bundles.find((b) => b.tier === 'free') || bundles[0];
if (!bundle) {
  console.log(`  нет такой связки. Доступно: ${bundles.map((b) => b.bundle).join(', ')}`);
  process.exit(1);
}
console.log(`  связка        : ${bundle.bundle} (${bundle.modelId}, размышление ${bundle.thinkBudget}, ${bundle.tier})`);

if (arg('dry', false)) { console.log('\n  --dry: вызова не было\n'); process.exit(0); }

console.log('\n  зову модель…');
const t0 = Date.now();
const r = await forgeBody({
  prompt,
  bundle,
  onAttempt: (a) => console.log(`    попытка ${a.attempt + 1}: ${a.ok ? 'принята' : 'отклонена'}`
    + `, ${a.chars} символов, $${(a.costUsd || 0).toFixed(4)}, ${Math.round(a.elapsedMs / 1000)} с`
    + (a.error ? `, ошибка ${a.error}` : '')),
});
const secs = Math.round((Date.now() - t0) / 1000);

if (!r.ok) {
  console.log(`\n  ✗ тело не собралось за ${secs} с: ${r.message}`);
  for (const p of (r.problems || []).slice(0, 6)) console.log(`      ${p.message}${p.at ? ` @${p.at}` : ''}`);
  console.log(`  потрачено $${r.costUsd.toFixed(4)}\n`);
  process.exit(1);
}

const out = join(ROOT, 'forge', `product-${Date.now().toString(36)}.js`);
writeFileSync(out, r.source);
console.log(`\n  ✓ тело собралось за ${secs} с, $${r.costUsd.toFixed(4)}`);
console.log(`    исходник        ${r.source.length} символов`);
console.log(`    после разметки  ${r.safe.length} символов (в браузер уезжает этот)`);
console.log(`    записано        ${out.replace(ROOT + '/', '')}`);
console.log(`\n  поставить его существу:  node tools/bodyinstall.mjs <id> ${out.replace(ROOT + '/', '')}\n`);
