#!/usr/bin/env node
/**
 * Rename legacy Russian creature names to English.
 *
 * The product is English-only (docs/REDESIGN.md §1). Creatures born before
 * that decision carry Russian names in the database; this renames them from a
 * curated map. Idempotent: names already correct are left alone.
 *
 *   node tools/anglicize.mjs                 # data/airena.db (or $AIRENA_DB)
 *   node tools/anglicize.mjs --dry           # print the plan only
 *
 * ── WHY THERE IS NO TRANSLITERATION ────────────────────────────────────────
 *
 * The first version of this tool transliterated whatever `MAP` did not know,
 * so that "no Cyrillic name survives". It worked exactly as written and that
 * was the defect: ОБЖИГ became OBZHIG, ТАРАН became TARAN, ГРОЗНЫЙ АРМЯН
 * became GRIM ARMYAN — Latin letters spelling Russian words, which `latinOnly()`
 * (§7.6) cannot catch and a reviewer reads as English. GRIM ARMYAN sat on the
 * ladder with 5,718 fights behind it. A name is copy; copy is translated by a
 * person, not by a letter table. So an unmapped name is now a HARD ERROR that
 * names itself and asks for an entry, and the run writes nothing until every
 * name has one.
 */

import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.AIRENA_DB || join(ROOT, 'data/airena.db');
const DRY = process.argv.includes('--dry');

const MAP = {
  'ЛЕДОКОЛ': 'ICEBREAKER', 'РАЗРЯДНИК': 'ARRESTER', 'КАМЕННЫЙ ГОЛЕМ': 'STONE GOLEM',
  'МЕТКА-92': 'MARK-92', 'РЕЗАК КИСЛОТНЫЙ': 'ACID CUTTER', 'ОСА-УБИЙЦА': 'KILLER WASP',
  'МОНОЦИКЛ-РЕЗАК': 'MONOCYCLE CUTTER', 'КОЛОДА-75': 'DECK-75', 'ЗЛОКРЕВЕТКА': 'VILE SHRIMP',
  'СТЫК-70': 'SEAM-70', 'ПРОРЕХА': 'THE RIFT', 'ТРАВИЛЬЩИК': 'ETCHER', 'ЁЖ-МИНА': 'MINE HEDGEHOG',
  'СТУЖА': 'COLDSNAP', 'МАГМАРЬ': 'MAGMAR', 'ПРЕСС-60': 'PRESS-60', 'ДОМНА': 'FURNACE',
  'ПЕПЕЛ': 'ASH', 'ОДИН': 'ODIN', 'ПЕПЕЛЬНЫЙ ВОЛК': 'ASH WOLF', 'БОЛИД': 'BOLIDE', 'ГРОЗА': 'STORM',
  'ЛИТЕЙНЫЙ КУЛАК': 'FOUNDRY FIST', 'ТЯЖЕЛЫЙ РЕАКТОР': 'HEAVY REACTOR', 'ТЯЖЁЛЫЙ РЕАКТОР': 'HEAVY REACTOR',
  'ГОНЕЦ': 'COURIER', 'ЗЕРНО-50': 'GRAIN-50', 'ВАЛ-50': 'SHAFT-50', 'КРЯЖ-50': 'RIDGE-50',
  'БОГОМОЛ-КОСИЛЬЩИК': 'MANTIS REAPER', 'РТУТНЫЙ УГОРЬ': 'MERCURY EEL', 'КУРГАН': 'BARROW',
  'ГРОЗОБОЙ': 'THUNDERSTRIKE', 'БАШНЯ': 'TOWER', 'ГРОЗНЫЙ АРМЯН': 'GRIM HIGHLANDER', 'ОСКТУС-86': 'OSKTUS-86',
  'РЕЗАК ЛАЗЕР': 'LASER CUTTER', 'СТЕКЛЯННАЯ МЕДУЗА': 'GLASS JELLYFISH', 'СОЛЯНОЙ БЫК': 'SALT BULL',
  'МОГИЛЬНИК': 'GRAVEDIGGER', 'ИГЛА-42': 'NEEDLE-42', 'ГЛЫБА-42': 'BOULDER-42',
  'ТРЮМНЫЙ КРАБ': 'BILGE CRAB', 'ПЕПЕЛ И ЛЕД': 'ASH AND ICE', 'ПЕПЕЛ И ЛЁД': 'ASH AND ICE', 'КЛИН-40': 'WEDGE-40',
  'СТРЕКОЗА': 'DRAGONFLY', 'СТЕКЛЯННАЯ ОСА': 'GLASS WASP', 'ДРОБИЛКА': 'CRUSHER', 'ГРУНТ-33': 'SOIL-33',
  'ГОНКА ПРОВЕРКА': 'RACE CHECK', 'ЛЕДЯНОЙ МАГ': 'ICE MAGE', 'КУВАЛДА': 'SLEDGEHAMMER',
  'АКУЛА': 'SHARK', 'ПРИЗМА': 'PRISM', 'ЧЕРТА-17': 'LINE-17', 'КОРШУН': 'BLACK KITE', 'ШПИЛЬ-08': 'SPIRE-08',
  'ЛИНЗА-00': 'LENS-00', 'ОБУХ-00': 'HAMMERBACK-00', 'КУЗНЕЧИК-МЕХАНИК': 'GEAR HOPPER',
  'БРОНЕКРАБ': 'ARMOR CRAB', 'ХРОНОМЕТР': 'CHRONOMETER', 'ХРОНОГРОМ': 'CHRONOTHUNDER',
  'ЧАСОВЩИК-ГРОМОВЕРЖЕЦ': 'THUNDER CLOCKMAKER', 'МЕДУЗА': 'JELLYFISH', 'ОСЬМИНОГ': 'OCTOPUS',
  'ГОРИЛЛА': 'GORILLA', 'ОБЖИГ': 'FIRING', 'ОБВАЛ': 'ROCKFALL', 'ТАРАН': 'BATTERING RAM',
  'ПРОВАЛ': 'SINKHOLE', 'ПЕПЕЛЬНЫЙ МОТЫЛЁК': 'ASH MOTH', 'ПЕПЕЛЬНЫЙ МОТЫЛЕК': 'ASH MOTH',
  /*
   * A creature is never named after the model that thinks for it (§1.4: the
   * mind is shown as a mind, never as a product id). The generation suffix
   * these two carried in the forge — OPUS, FABLE, a bare " F" — is bookkeeping
   * that leaked into the name.
   */
  'КУРГАН OPUS': 'BARROW WARDEN', 'КУРГАН FABLE': 'BARROW SHADE',
  'ЧАСОВЩИК-ГРОМОВЕРЖЕЦ F': 'THUNDER CLOCKMAKER',
  /* Production library seeds (06.09): bare bases; a numeric suffix is kept by
     `englishName` (КЛИН-15 → WEDGE-15). */
  'КЛИН': 'WEDGE', 'ВАЛ': 'SHAFT', 'КРЯЖ': 'RIDGE', 'ПРЕСС': 'PRESS', 'КОЛОДА': 'DECK',
  'ГЛЫБА': 'BOULDER', 'ИГЛА': 'NEEDLE', 'МЕТКА': 'MARK', 'ЗЕРНО': 'GRAIN', 'ГРУНТ': 'SOIL',
  'ШПИЛЬ': 'SPIRE', 'ЛИНЗА': 'LENS', 'ОБУХ': 'HAMMERBACK', 'ЧЕРТА': 'LINE', 'СТЫК': 'SEAM',
  'КРОКОДИЛ': 'CROCODILE', 'СТРАЖ': 'WARDEN', 'ОСКТУС': 'OSKTUS', 'СТРЕЛА': 'ARROW',
  'МОЛОТ': 'HAMMER', 'ПРОСВЕТ': 'GLEAM', 'ЩИТ': 'SHIELD', 'КОГОТЬ': 'CLAW', 'ЖАЛО': 'STING', 'ВИХРЬ': 'VORTEX',
};

/**
 * Latin names that already shipped and are still wrong — what the old
 * transliterating fallback wrote into the development database, plus the two
 * that carry a model name. Keyed by the wrong name so the repair is idempotent
 * and survives a database nobody can regenerate from the Russian originals.
 */
const REPAIR = {
  'OBZHIG': 'FIRING', 'OBVAL': 'ROCKFALL', 'PEPELNYY MOTYLYOK': 'ASH MOTH',
  'TARAN': 'BATTERING RAM', 'PROVAL': 'SINKHOLE', 'GRIM ARMYAN': 'GRIM HIGHLANDER',
  'BARROW OPUS': 'BARROW WARDEN', 'BARROW FABLE': 'BARROW SHADE',
  'THUNDER CLOCKMAKER F': 'THUNDER CLOCKMAKER',
};

/**
 * The English name, or a throw naming the row that needs an entry. Never
 * invents one: see the note at the top of the file.
 */
export function englishName(name) {
  const key = String(name).trim().toUpperCase();
  if (REPAIR[key]) return REPAIR[key];
  if (!/[Ѐ-ӿ]/.test(name)) return name;
  if (MAP[key]) return MAP[key];
  const m = key.match(/^(.+?)-(\d+)$/);
  if (m && MAP[m[1]]) return `${MAP[m[1]]}-${m[2]}`;
  throw new Error(`no English name for «${name}» — add it to MAP in tools/anglicize.mjs`);
}

const db = new DatabaseSync(DB);
const rows = db.prepare('SELECT id, name FROM creature').all();

/* Plan first, write second: a run that dies halfway leaves a database half
   translated, and the next run cannot tell which half. */
const plan = [];
const unknown = [];
for (const r of rows) {
  let next;
  try { next = englishName(r.name); } catch { unknown.push(r); continue; }
  if (next !== r.name) plan.push({ ...r, next });
}

if (unknown.length) {
  console.log('\n  NO ENGLISH NAME FOR:');
  for (const r of unknown) console.log(`    ${r.id}  ${r.name}`);
  console.log(`\n  add ${unknown.length} entr${unknown.length === 1 ? 'y' : 'ies'} to MAP in tools/anglicize.mjs and run again — nothing was written\n`);
  process.exit(1);
}

for (const r of plan) {
  console.log(`  ${r.id}  ${r.name}  →  ${r.next}`);
  if (!DRY) db.prepare('UPDATE creature SET name = ? WHERE id = ?').run(r.next, r.id);
}
console.log(`\n  ${DRY ? 'would rename' : 'renamed'} ${plan.length} of ${rows.length} creatures in ${DB}\n`);
