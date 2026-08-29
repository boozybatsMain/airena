/**
 * Синтетический нагрузочный тест — шестой лимит E3 и гейт выхода этапа 1.
 *
 * E3.6 дословно: «проходящий синтетический нагрузочный тест: 10 000 приходов
 * за час не превышают дневной бюджет». Это не «сервер выдержит нагрузку» —
 * это «предохранители закрываются раньше, чем кончаются деньги».
 *
 * Проверяется НЕ живой сервер, а логика лимитов на своей БД в памяти: живой
 * прогон 10 000 генераций стоил бы 10 000 генераций. Модель нагрузки честная:
 * каждый приход — новый аккаунт (то есть худший случай, где лимиты на
 * аккаунт не помогают вовсе), каждый пытается создать существо.
 *
 * §5.3 «Максимальная экспозиция без лимитов» — это и есть то, что тест
 * должен опровергнуть.
 *
 *   node tools/loadtest.mjs
 *   node tools/loadtest.mjs --arrivals=10000 --hours=1
 */

import { randomUUID } from 'node:crypto';

import { openDb } from '../src/server/db.js';
import * as limits from '../src/server/limits.js';

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? Number(h.slice(n.length + 3)) : d;
};

const ARRIVALS = arg('arrivals', 10_000);
const HOURS = arg('hours', 1);
const BUDGET = arg('budget', limits.LIMITS.dailyBudgetUsd);

/**
 * Худшая связка каталога по цене — предохранитель обязан держать против неё,
 * а не против средней. Число из §5.1: Opus, существо с браком, ×2 попытки.
 */
const WORST = { bundle: 'anthropic/claude-opus-5:plain', creatureUsd: 2.732 };
/** Дешёвая — так выглядит нагрузка на самом деле, если каталог работает. */
const CHEAP = { bundle: 'google/gemini-3.7-flash:plain', creatureUsd: 0.069 };

function run(bundle, label) {
  const db = openDb(':memory:');
  const t0 = Date.parse('2026-08-29T00:00:00.000Z');
  const spanMs = HOURS * 3600_000;

  let started = 0; let denied = {}; let spent = 0;
  const started_ids = [];

  for (let i = 0; i < ARRIVALS; i++) {
    const now = t0 + Math.floor((i / ARRIVALS) * spanMs);
    /* Каждый приход — свой аккаунт: это худший случай, где лимиты на аккаунт
       не срабатывают ни разу и всё держит только глобальный бюджет. */
    const id = `u_${randomUUID().slice(0, 12)}`;
    db.prepare(`INSERT INTO account (id, genex_sub, email_norm, created_at, last_seen_at, is_guest)
                VALUES (?, ?, NULL, ?, ?, 0)`).run(id, `sub_${i}`, now, now);
    const account = db.prepare('SELECT * FROM account WHERE id = ?').get(id);

    const gate = limits.check(db, { account, bundle, kind: 'create', now,
      limits: { ...limits.LIMITS, dailyBudgetUsd: BUDGET } });
    if (!gate.ok) { denied[gate.code] = (denied[gate.code] || 0) + 1; continue; }

    /* Прошёл — значит генерация запускается и деньги списываются. Худший
       случай E3.4: обе попытки оплачены, принята вторая. */
    started++;
    const cost = bundle.creatureUsd * limits.LIMITS.maxAttempts;
    limits.recordSpend(db, { accountId: id, jobId: `j_${i}`, usd: cost, accepted: true, now });
    spent += cost;
    started_ids.push(id);
    /* Очередь освобождается — иначе `concurrent` держал бы вместо бюджета,
       и тест мерил бы не то. */
  }

  const status = limits.status(db, { now: t0, limits: { ...limits.LIMITS, dailyBudgetUsd: BUDGET } });
  return { label, bundle: bundle.bundle, started, denied, spent, status };
}

const rows = [run(WORST, 'худшая связка'), run(CHEAP, 'дешёвая связка')];

console.log(`\n  ${ARRIVALS} приходов за ${HOURS} ч, дневной бюджет $${BUDGET}`);
console.log('  каждый приход — НОВЫЙ аккаунт: лимиты на аккаунт не помогают ни разу\n');
console.log('  связка                                запущено  потрачено   отказы');
console.log('  ' + '─'.repeat(76));

let fail = false;
for (const r of rows) {
  const over = r.spent > BUDGET + 1e-9;
  if (over) fail = true;
  const den = Object.entries(r.denied).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`  ${r.bundle.padEnd(34)} ${String(r.started).padStart(8)}  ${('$' + r.spent.toFixed(2)).padStart(9)}   ${den}`);
  if (over) console.log(`      ✗ ПРОБИТ: потрачено больше дневного бюджета на $${(r.spent - BUDGET).toFixed(2)}`);
}

/* Контроль: без предохранителя те же приходы стоят вот столько. Без этой
   строки тест доказывает, что ноль меньше бюджета, а не что лимит работает. */
console.log('  ' + '─'.repeat(76));
for (const b of [WORST, CHEAP]) {
  const naked = ARRIVALS * b.creatureUsd * limits.LIMITS.maxAttempts;
  console.log(`  без лимитов: ${b.bundle.padEnd(30)} $${naked.toFixed(2)} за ${HOURS} ч`);
}

/* И проверка, что отказ пришёл ИМЕННО от бюджета, а не от чего-то ещё:
   лимит, который держит по случайной причине, перестанет держать завтра. */
for (const r of rows) {
  if (r.started >= ARRIVALS) {
    console.log(`\n  ! ${r.bundle}: не отказано НИ РАЗУ — бюджета хватило на всех.`);
    console.log('    Это не провал, но и не проверка: подними --arrivals или опусти --budget.');
  } else if (!r.denied.budget_day) {
    fail = true;
    console.log(`\n  ✗ ${r.bundle}: отказы есть, но ни одного по дневному бюджету — держало что-то другое.`);
  }
}

console.log('\n  ' + (fail
  ? 'E3.6 ПРОВАЛЕН — предохранитель не удержал бюджет'
  : `E3.6 держит — ни один сценарий не пробил $${BUDGET}`) + '\n');
process.exit(fail ? 1 : 0);
