#!/usr/bin/env node
/**
 * Render the brain prompt for two sample grammar kits and save it.
 *
 *   node reports/combat/renderprompt.mjs
 *
 * Kit A (blue):   lob:damage · zone:burn · blink:cleanse
 * Kit B (orange): bolt:damage · cone:damage+knock · self:shield
 *
 * Output: reports/combat/prompt-rendered.txt (the blue prompt, kit A vs kit B,
 * default bodies), plus a short header with the compiled numbers of both kits
 * so the reader can compare the prose against the live definitions.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { brainPrompt } = await import(join(ROOT, 'src/brain/prompt.js'));
const { compileKit } = await import(join(ROOT, 'src/skills/compile.js'));

const KIT_A = [
  { delivery: 'lob', effects: ['damage'], element: 'ember' },
  { delivery: 'zone', effects: ['burn'], element: 'acid' },
  { delivery: 'blink', effects: ['cleanse'], element: 'void' },
];
const KIT_B = [
  { delivery: 'bolt', effects: ['damage'], element: 'arc' },
  { delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' },
  { delivery: 'self', effects: ['shield'], element: 'frost' },
];

const a = compileKit(KIT_A);
const b = compileKit(KIT_B);
if (a.problems.length || b.problems.length) {
  console.error(JSON.stringify({ a: a.problems, b: b.problems }, null, 2));
  process.exit(1);
}

const own = a.defs;
const enemy = b.defs;
const text = brainPrompt('blue', { own, enemy }, null);

const dump = (defs) => Object.entries(defs).map(([k, d]) => {
  const { grammar, palette, ...rest } = d;
  return `${k}: ${JSON.stringify(rest)}`;
}).join('\n');

const header = [
  '### COMPILED KIT A (own, blue)',
  dump(own),
  '',
  '### COMPILED KIT B (enemy, orange)',
  dump(enemy),
  '',
  `### PROMPT LENGTH: ${text.length} chars, ${text.split('\n').length} lines`,
  '',
  '### PROMPT AS HANDED TO THE MODEL (blue, kit A vs kit B)',
  '',
].join('\n');

const out = join(ROOT, 'reports/combat/prompt-rendered.txt');
writeFileSync(out, header + text + '\n');
console.log(`wrote ${out}: ${text.length} chars`);

/* Second render, the other way round, so the bolt/cone/self side's own-kit
   sections (and the absence of the lob argument paragraph) can be read. */
const text2 = brainPrompt('orange', { own: enemy, enemy: own }, null);
const out2 = join(ROOT, 'reports/combat/prompt-rendered-orange.txt');
writeFileSync(out2, text2 + '\n');
console.log(`wrote ${out2}: ${text2.length} chars`);
