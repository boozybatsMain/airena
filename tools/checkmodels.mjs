/**
 * В каталог попадают только разрешённые семьи — гейт по решению основателя.
 *
 * OpenRouter добавляет модели сам, и каталог собирается из ЖИВОГО прайса.
 * Значит «мы не добавляли эту модель» ничего не гарантирует: она появится
 * сама, и появится дорогой. Замерено 30.08 на живом прайсе — цена одного
 * существа:
 *
 *     z-ai/glm-5.3-flash        $0.010 — $0.020
 *     google/gemini-3.7-flash   $0.069 — $0.152
 *     anthropic/claude-sonnet-5 $0.404 — $0.869
 *     anthropic/claude-opus-5   $1.010 — $2.258
 *
 * Разница в СТО РАЗ, и это цена удачной генерации: в ревью одно тело на
 * `claude-opus-5-fast` стоило $5.35 за три попытки и не вернуло ничего.
 *
 * Решение основателя дословно: «клод модели юзай через подписку, а через
 * опэнроутер гемини, глм флэш». Гейт проверяет, что каталог ему соответствует,
 * и падает, если в него просочилось что-то ещё.
 *
 * Гейт работает БЕЗ СЕТИ: живой прайс подменяется выдуманным, где есть и
 * разрешённые модели, и дорогие. Иначе он падал бы на машине без ключа и
 * проверял бы наличие интернета вместо правила.
 *
 *   node tools/checkmodels.mjs
 */

import { ALLOWED, BANNED, FREE_FOR_NOW, buildCatalog } from '../src/server/forge/models.js';

let bad = 0;
const ok = (what, cond, note = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

console.log('\n  КАТАЛОГ МОДЕЛЕЙ\n');

/* Выдуманный прайс: две разрешённые семьи, четыре дорогие и один запрещённый. */
const cheap = { prompt: '0.0000002', completion: '0.0000006', context: 1_000_000 };
const dear = { prompt: '0.000015', completion: '0.000075', context: 200_000 };
const PRICES = {
  'google/gemini-3.7-flash': cheap,
  'z-ai/glm-5.3-flash': cheap,
  'z-ai/glm-5.3': dear,
  'anthropic/claude-opus-5': dear,
  'anthropic/claude-fable-5.1': dear,
  'openai/gpt-6-astra': dear,
  'anthropic/claude-sonnet-5': dear,
  'anthropic/claude-haiku-4.5': cheap,
  'moonshotai/kimi-k3': dear,
  'qwen/qwen3.8-max': dear,
};

const cat = await buildCatalog({ prices: PRICES });
const ids = [...new Set(cat.bundles.map((b) => b.modelId))].sort();

ok('в каталоге только разрешённые семьи',
  ids.every((id) => ALLOWED.some((re) => re.test(id))),
  ids.join(', ') || 'пусто');
ok('все разрешённые семьи в каталоге есть', ids.length === ALLOWED.length,
  `${ids.length} из ${ALLOWED.length}`);
ok('дорогие семьи вне списка отвергнуты с причиной',
  cat.rejected.some((r) => /claude-sonnet|qwen/.test(r.bundle) && /allow list|разрешённых/.test(r.why)),
  cat.rejected.find((r) => /claude-sonnet|qwen/.test(r.bundle))?.why || 'нет записи об отказе');
/* 07.09: the founder opened six authors as free while payments are shut. A
   dear author on that list is tier `free` (and says `freeForNow`); a dear
   author off it is still `paid`. */
const freeNow = cat.bundles.filter((b) => FREE_FOR_NOW.has(b.modelId));
ok('связки «бесплатно пока» идут бесплатными', freeNow.length > 0 && freeNow.every((b) => b.tier === 'free'),
  `${freeNow.length} связок, авторов ${new Set(freeNow.map((b) => b.modelId)).size} из ${FREE_FOR_NOW.size}`);
ok('дорогой автор из списка помечен freeForNow', freeNow.some((b) => b.freeForNow === true),
  freeNow.filter((b) => b.freeForNow).map((b) => b.modelId).join(', ') || 'никто');
/*
 * Haiku в каталоге нет — но проверять надо ФАКТ, а не путь.
 *
 * Первая версия искала запись об отказе «исключена решением 28.08» и падала:
 * до чёрного списка Haiku больше не доходит, его не пускает белый. Проверка,
 * привязанная к тому, КАКОЕ правило сработало, ломается от любой перестановки
 * правил, хотя запрет продолжает действовать.
 *
 * Сам чёрный список при этом остаётся нужным: он переживёт расширение белого,
 * если однажды разрешат семью, внутри которой Haiku есть.
 */
ok('Haiku в каталоге нет', !cat.bundles.some((b) => /haiku/i.test(b.modelId)),
  'исключён решением 28.08; сейчас его не пускает и белый список');
ok('чёрный список не опустел', BANNED.length > 0
  && BANNED.some((re) => re.test('anthropic/claude-haiku-4.5')),
  `${BANNED.length} правил — они переживут расширение белого списка`);

/* У каждой связки обязана быть запасная ИЗ ДРУГОЙ семьи: подмена внутри одной
   не спасает от того, что подвела именно она. */
const { fallbackBundle } = await import('../src/server/forge/models.js');
const noAlt = cat.bundles.filter((b) => !fallbackBundle(cat, b.bundle));
ok('у каждой связки есть запасная', noAlt.length === 0,
  noAlt.length ? noAlt.map((b) => b.label).join(', ') : `${cat.bundles.length} связок`);

const families = new Set(ids.map((id) => id.split('/')[0]));
ok('семей больше одной', families.size > 1,
  `${[...families].join(', ')} — иначе отказ провайдера останавливает всю игру`);

console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
