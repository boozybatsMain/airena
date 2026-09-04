/**
 * РАЗОВАЯ ПРОВЕРКА ПОСЛЕ ЗАКАЗА 04.09: генерация по описаниям, которые
 * раньше дали бы время или бессмысленное сближение.
 *
 * Проверяет ровно три вещи основателя разом: времени в наборе быть не может;
 * мозг читает живой набор из перцепции, а не вписывает дальность числом;
 * у навеса мозг называет дальность.
 */
import { buildCatalog } from '../../src/server/forge/models.js';
import { forgeCreature } from '../../src/server/forge/pipeline.js';
import { validateKit } from '../../src/skills/registry.js';

const CASES = [
  'Травильщик: разъедает броню едкой жижей, оставляет за собой лужи, которые жгут.',
  'Домна: пышет огнём, поджигает всё вокруг, сама раскалена докрасна.',
  'Прореха: рвёт пространство, затягивает в пустоту, гасит всё живое.',
];
const catalog = await buildCatalog();
const bundle = catalog.bundles.find((b) => b.bundle === 'google/gemini-3.7-flash:plain');
let spent = 0;
for (const prompt of CASES) {
  const out = await forgeCreature({ bundle, prompt });
  spent += out.costUsd || 0;
  const kit = out.kit || [];
  const els = [...new Set(kit.map((k) => k.element))];
  const src = out.brain?.source || out.brainSource || '';
  const readsKit = /p?\.?self\.kit|\.kit\s*[.[]/.test(src);
  const hardcoded = (src.match(/dist\w*\s*[<>]=?\s*\d+\.\d+/g) || []).length;
  const lobRange = /use\(\s*['"]k\d['"]\s*,\s*[^)]/.test(src);
  console.log('\n──', prompt.slice(0, 46), '…');
  console.log('   набор:', kit.map((k) => `${k.delivery}/${k.element}`).join(' '));
  console.log('   стихии:', els.join(', '), '| время в наборе:', els.includes('time'));
  console.log('   грамматика:', JSON.stringify(validateKit(kit)));
  console.log('   мозг читает живой набор:', readsKit, '| вписанных дистанций:', hardcoded,
    '| зовёт use с аргументом:', lobRange);
  console.log('   потрачено всего: $' + spent.toFixed(3));
}
