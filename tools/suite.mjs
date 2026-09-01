#!/usr/bin/env node
/* Прогон всех гейтов.

   Раньше это была одна цепочка `&&` в package.json. Она давала ровно один бит
   информации: набор красный. Кто именно упал — не видно, а повторить гейт руками
   мало: половина зовётся с аргументами, и без них это уже другая проверка.
   Один такой ложный след (`sizebalance` с умолчанием в 6 сидов вместо гейтовых
   20) стоил часа охоты за отказом, которого не было. См. D154, D155.

   Здесь список гейтов — данные. Каждый печатает свою строку, отказ называет имя,
   команду целиком и код возврата, и прогон останавливается на первом. */

import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

/* Общий файл следа: checkframing его пишет, checkcamera читает. Имя завязано на
   pid, чтобы два параллельных прогона не топтали друг друга. */
const TRAIL = join(tmpdir(), `airena-trail-${process.pid}.json`);

const GATES = [
  ['test'],
  ['checkprompt'], ['checkdocs'], ['checkbehaviour'],
  ['checkframing', `--dump=${TRAIL}`],
  ['checkcamera', `--trail=${TRAIL}`],
  ['checkcontrast'], ['checkgrammar'], ['checkprices'], ['checkladder'],
  ['checkvfx'], ['checkgauntlet'], ['checkcadence'],
  ['sizebalance', '--rounds=20'],
  ['checkstages'], ['checkspec'], ['checkboot'], ['checkisolate'],
  ['checkbody'], ['checkbodyrace'], ['checkfaults'], ['checkfacade'], ['checkforge'], ['checkmodels'],
  ['checkpose'], ['checkselectors'], ['checkscreens'], ['checkscope'],
  ['loadtest'],
  ['falsify', '--controls', '--tags=u1,u2,u3,u4,u5,u6'],
];

let failed = null;
for (const [name, ...args] of GATES) {
  const r = spawnSync(process.execPath, [`tools/${name}.mjs`, ...args], { stdio: 'inherit' });
  const code = r.status ?? 1;
  if (code !== 0) { failed = { name, args, code, signal: r.signal }; break; }
}

try { rmSync(TRAIL, { force: true }); } catch {}

if (failed) {
  const cmd = ['node', `tools/${failed.name}.mjs`, ...failed.args].join(' ');
  console.error(`\n  УПАЛ ГЕЙТ: ${failed.name}  код ${failed.code}${failed.signal ? ` сигнал ${failed.signal}` : ''}`);
  console.error(`  повторить ровно так:  ${cmd}\n`);
  process.exit(failed.code);
}
console.log('\n  ВСЕ ГЕЙТЫ ЗЕЛЁНЫЕ\n');
