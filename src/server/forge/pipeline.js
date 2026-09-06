/**
 * Конвейер рождения существа.
 *
 * Порядок шагов выбран так, чтобы дорогое шло после дешёвого и после того,
 * что может отказать:
 *
 *   1. РАЗБОР ПРОМПТА  — один дешёвый вызов: имя, архетип, кит из грамматики
 *                        §8 и список НЕПОПАВШИХ понятий (§8.1). Кит проверяет
 *                        сервер заново; цифры модели не авторитетны.
 *   2. ТЕЛО            — библиотечное в v1. N18 запрещает house-style путь
 *                        ($3.31–$11.72, ~58 мин) в любом потоке, видимом
 *                        игроку; forge подключается отдельным этапом.
 *   3. МОЗГ            — вызов по существующему промпту, с повтором по
 *                        правилу 4 (урезанный бюджет размышления).
 *   4. ВАЛИДАТОР       — бесплатный: компилирует и прогоняет два пробных боя.
 *                        Замерено: поймал 9 провалов из 9, ложных отказов 0.
 *   5. КАРТОЧКА ТАКТИКИ— один дешёвый вызов, ОДИН РАЗ НА МОЗГ (D5), а не на бой.
 *
 * §8.1, три правила, которые здесь исполняются буквально:
 *   1. никогда не подменять молча;
 *   2. никогда не терять существо из-за одной непопавшей детали;
 *   3. записывать каждое непопавшее понятие — это очередь разработки контента
 *      по спросу живых игроков, а не по догадке дизайнера.
 */

import { readFileSync } from 'node:fs';

import { brainPrompt, SYSTEM_PROMPT } from '../../brain/prompt.js';
import { extractSource } from '../../brain/host.js';
import { admit } from '../sandbox/index.js';
import { forgeBody } from './body.js';
import { viability } from './viability.js';
import { BUILD_AXES, BUILD_BUDGET, normalizeBuild } from '../../core/config.js';
import { constantsVersion } from '../../core/version.js';
import { EFFECTS, ELEMENTS, KIT_BUDGET, KIT_SIZE, costOf, describe, grammar, validateKit, validateSkill } from '../../skills/registry.js';
import { compileKit } from '../../skills/compile.js';
import { canonicalIr, vfxGrammar } from '../../vfx/ir.js';

const EFFECT_RU = (id) => EFFECTS[id]?.ru || id;
import { fallbackName, sanitizeName } from '../creatures.js';
import { callWithRepair, extractJson, LlmError } from './llm.js';
import { fallbackBundle, REQUEST_BUDGET_USD } from './models.js';

/**
 * СТОРОНА КАНДИДАТА В КОНВЕЙЕРЕ — ОДНА И ТА ЖЕ ВСЕГДА.
 *
 * Мозг пишется под сторону (`p.self.id` в промпте) и на ней же проходит
 * допуск. Какая из двух — безразлично: сторона это цвет, и обе дают ровно
 * одно и то же. Важно, чтобы промпт и допуск называли ОДНУ, иначе модель
 * пишет под одну сторону, а проверяют её на другой.
 */
const CANDIDATE_SIDE = 'blue';

/**
 * Спарринг-партнёр допуска — рукописный эталон противоположной стороны.
 *
 * Ключи — СТОРОНЫ кандидата, имена файлов — фикстура §1: рукописные эталоны
 * лежат на диске под своими старыми именами, и переименовывать их значило бы
 * сдвинуть замер, а не код. Пары перекрёстные: кандидат на голубой стороне
 * дерётся против эталона, написанного для оранжевой.
 */
const SPARRING = {
  blue: readFileSync(new URL('../../../brains/stub/gorilla.js', import.meta.url), 'utf8'),
  orange: readFileSync(new URL('../../../brains/stub/octopus.js', import.meta.url), 'utf8'),
};
/*
 * Спарринг-партнёр ОДИН, а не по виду.
 *
 * Он тут прибор: мозг допускается к арене, если он вообще шевелится против
 * известного соперника. Разные партнёры под разные виды означали два разных
 * прибора и два несравнимых результата; видов нет, прибор один.
 */
const sparringFor = () => SPARRING.blue;

/*
 * Три стартовых кита — пресеты §10.5, они же и запасной вариант разбора.
 *
 * ЧТО ЗДЕСЬ ИСПРАВЛЕНО И ПОЧЕМУ. Первая тройка была написана по смыслу и ни
 * разу не сыграна. Замер (`tools/kitbalance.mjs --presets`) показал строгую
 * лестницу вместо выбора: keeper 100%, breaker 41%, saboteur 9% на
 * симметричной арене и 81 / 69 / 0 на настоящих телах. То есть первый экран
 * игры предлагал три двери, за одной из которых игра, а за другой поражение,
 * и не сообщал об этом.
 *
 * Разбор был простой и неприятный: у «диверсанта» не было чем убивать.
 * Ослепление и немота урона не наносят, `on_hit_taken` срабатывает редко, и
 * единственным источником урона оставался конус — самая слабая форма в лиге
 * доставок. Существо честно портило противнику чувства и ждало ничьей.
 * У «дистанционщика», наоборот, было ДВА сильнейших источника сразу: луч и
 * зона.
 *
 * Правило, по которому тройка переписана: у каждого набора обязан быть свой
 * способ закончить бой, и ни у кого — двух сильнейших форм сразу. Характер
 * при этом сохраняется: держит дистанцию, ломает вблизи, портит чувства.
 */
/*
 * ЧЕРЕЗ `Object.create(null)`, и это не педантизм.
 *
 * На обычном литерале `KIT_PRESETS['constructor']` возвращает функцию `Object`
 * — истинное значение. Значит `kitPreset: "constructor"`, присланный клиентом
 * без единой проверки, проходил проверку на существование пресета, а потом
 * обращение к его `.kit` бросало на `undefined`. Отказ уходил мимо всех
 * ловушек в `pump().catch`, задание помечалось `internal`, и право на
 * единственное за жизнь бесплатное существо (F7) НЕ возвращалось: возврат
 * стоит на ветке `out.ok === false`, а сюда управление не доходило.
 *
 * Имя пресета с клиента больше не приходит вовсе (набор следует из описания),
 * но `Object.create(null)` остаётся: ключи сюда по-прежнему приходят из
 * ответа модели, а он такой же чужой вход, как тело запроса.
 *
 * Ровно этим же способом однажды пробивался бюджет умений — см. §8 и
 * `src/skills/registry.js`. Одна и та же дыра во второй раз означает, что
 * дело не в невнимательности, а в литерале как таковом.
 */
export const KIT_PRESETS = Object.assign(Object.create(null), {
  keeper: {
    ru: 'Keeps its distance',
    why: 'strikes from far off and pulls away when it is closed on',
    /*
     * У пресета есть ТЕЛО, и это не украшение.
     *
     * Ближний набор на лёгком дальнобойном теле не может навязать ближний
     * бой: противник с той же скоростью держит дистанцию вечно. Замер это и
     * показал — «ломает вблизи» брал 50% на симметричной арене против 95% у
     * дальнобойного, и разница была не в наборах, а в том, что одному из них
     * не дали тела, в котором его замысел работает.
     *
     * Тела в игре различаются нарочно (горилла и быстрее, и толще — она и
     * есть ближнее тело), так что материал был; его просто не связывали с
     * выбором. Теперь выбор стартового набора — это выбор существа целиком.
     */
    kit: [
      /* Снаряд, а не луч. Луч попадает мгновенно на двадцать четыре метра —
         это вся арена и никакого ответа: держащий дистанцию просто не мог
         проиграть (81% против 31% у обоих остальных). Снаряд летит, его
         можно обойти, и «бьёт издалека» остаётся правдой, а «издалека
         непобедим» перестаёт. */
      { delivery: 'bolt', effects: ['damage'], element: 'arc' },
      { delivery: 'blink', effects: ['cleanse'], element: 'void' },
      { delivery: 'self', effects: ['heal'], element: 'frost' },
    ],
  },
  breaker: {
    ru: 'Breaks in close',
    why: 'closes to point blank and does not let the distance open again',
    kit: [
      /* Обездвиживание висит на КОНУСЕ, а не на рывке, и это разница между
         «не даёт уйти» и «не даёт жить». На рывке оно достаётся бесплатно:
         рывок сам сокращает дистанцию, и связка «догнал и приковал» брала
         87.5% против 69 и 6 у остальных. На конусе за него надо сперва
         дойти на три с половиной метра — то есть заплатить тем самым, чего
         ближнему набору не хватает.
         Отброс из конуса убран: он ОТТАЛКИВАЕТ то, что набор весь бой
         догоняет, — то есть работал против собственного замысла. */
      { delivery: 'cone', effects: ['damage', 'root'], element: 'kinetic' },
      { delivery: 'dash', effects: ['damage'], element: 'kinetic' },
      /* Щит, а не ускорение. Ускорение выглядело точнее по смыслу — ближнему
         набору нужна возможность дойти, а не живучесть, — и было замерено:
         с ним breaker упал с 28% до 6.3%. Дойти он и так успевает (горилла
         быстрее), а вот пережить дорогу без щита не успевает. Замер тут
         оказался умнее рассуждения, и остаётся щит. */
      { delivery: 'self', effects: ['shield'], element: 'frost' },
    ],
  },
  saboteur: {
    ru: 'Ruins the senses',
    why: 'strikes at whatever the opponent makes its decisions with',
    /*
     * ХРЕБЕТ, а потом уже характер.
     *
     * Первая версия состояла из ослепления, немоты и одного конуса, и это
     * было существо, которое честно портит противнику чувства и ждёт ничьей:
     * ноль побед из ста двенадцати боёв, три единицы урона за бой.
     *
     * Причина глубже, чем «мало урона», и её стоит записать: ценность
     * ослепления и немоты равна тому, сколько решений они ломают. Наш
     * эталонный мозг решений почти не принимает — он нарочно простой, — и на
     * нём атаки по слою принятия решений меряются нулём. То есть замер
     * занижает ровно те три атома, которые §8 называет самым интересным в
     * игре. Отсюда правило прайса: цену таких атомов поднимаем по замеру и
     * НЕ опускаем по нему.
     *
     * Но стартовый набор — не место для ставки на сообразительность
     * соперника. Новичок обязан выигрывать им у тренировочного партнёра, а
     * значит ему нужен обычный урон, к которому характер прилагается.
     */
    kit: [
      { delivery: 'bolt', effects: ['damage'], element: 'void' },
      /* Ослепление ВМЕСТЕ с уроном, а не вместо него. Отдельным умением оно
         занимало треть набора и не приближало победу ни на шаг: против
         эталонного мозга, который решений почти не принимает, порча чувств
         меряется нулём. Навесом с уроном оно и бьёт, и слепит, и стоит
         честных семнадцать очков. */
      { delivery: 'lob', effects: ['damage', 'blind'], element: 'arc' },
      { delivery: 'bolt', effects: ['silence'], element: 'arc' },
    ],
  },
});

const PARSE_SYSTEM = `You translate a creature description written by a player into a closed grammar.
Answer with a JSON object ONLY, no explanations.

Fields:
  name       — the creature's short name, 2-22 characters, uppercase. English only.
  build      — THIS CREATURE'S BODY: six numbers of its own. Nothing is inherited,
               there are no species and no presets. Every number costs points and
               the set has a ceiling — the cost table is below. Add it up before
               you write.
               {hp, maxSpeed, accel, turnRate, radius, jumpHeight}
  colour     — the creature's own colour, "#rrggbb". It does nothing in a fight,
               only looks. Not named — we pick one ourselves.
  kit        — EXACTLY 3 abilities. Each: {delivery, effects:[1..3], channel?, element}.
  unfit      — array of strings: ideas from the player's description that are NOT
               in the grammar. Write them in the player's own words. Empty array
               if everything fitted.
  why        — one sentence in English: why this set of abilities suits the description.

HARD RULES:
  • Take values only from the lists below. An invented value is a defect.
  • Deliveries that apply TO THE CASTER — "self", "blink", "jump" — allow only
    the effects shield, heal, cleanse, boost, wall. They cannot strike with them.
  • The effects boost and weaken MUST name a channel.
  • THE ELEMENT OF THE DESCRIPTION IS CARRIED BY THE MAJORITY, not by one ability
    out of three. If one element clearly follows from the description — "fights
    with cold", "a red-hot carcass", "spits caustic filth" — then NO FEWER THAN
    TWO abilities must carry it. A creature whose only cold thing is its shield
    while it strikes with grey kinetics is a different creature, and that is
    exactly what the player sees: on screen the element is the only thing an
    ability is recognised by. The third ability is free: it makes up whatever
    the element cannot.
  • The element is looks only. It grants no mechanics at all — and that is
    precisely why it must be chosen BY THE DESCRIPTION and not by strength: it is
    the one axis on which who the player asked for is visible. Cold and ice are
    frost, fire and heat are ember, electricity and lightning are arc, acid and
    corrosion are acid, infection and decay are radiation, weight, mass and
    attraction are gravity, slowing and stopped time are time, a laser beam is
    laser, the abyss, the fall and antimatter are void, a plain blow, stone and
    metal are kinetic. If none of that is in the description, take the one
    closest to the image, and do not take kinetic by default: a grey blow suits
    a creature that STRIKES, not just any creature.
  • The element and the effect must say the same thing. Acid and fire burn
    (burn), frost and time slow (weaken/speed) and hold (root), gravity pulls
    (pull) and presses (weaken), radiation burns and blinds (burn, blind), the
    void takes the voice away (silence), kinetics knocks back (knock) and stuns
    (stun), laser and arc strike straight through (damage). This is not a ban —
    it is what a spectator recognises an ability by without reading a card.
  • NEVER substitute something similar for what the player asked for. It did not
    fit — write it into unfit. A silent substitution is worse than a refusal: the
    creature looks fine and does the wrong thing.
  • THE ABILITIES MUST BE ABLE TO END A FIGHT. Blind, silence, pull and shield take no
    health off. At least one ability with the effect "damage" or "burn" is
    required, two is better: a creature with a single source of damage loses
    almost everything. That does not cancel character — the same ability carries
    it: "mortar: damage + blind" both blinds and hits.`;

/**
 * ЗАМЕР ПРАВИЛА «БОЛЬШИНСТВОМ» (04.09). Описание «Стужа: выстуживает воздух,
 * сковывает наледью, делает хрупким; дерётся холодом, а не силой» до правила
 * дало 1 умение из 3 на морозе — конус и рывок вышли серой кинетикой, то есть
 * существо, которое просили сделать холодным, дралось ударом. После правила
 * то же описание дало 3 из 3. По всей волне из четырнадцати описаний стихия не
 * промахнулась ни разу; у лазера и радиации 2 из 3 — это ПОТОЛОК, а не промах:
 * правило E1 не даёт им доставки `self`, и третий слот обязан быть чужим.
 *
 * Словарь для модели — С ЦЕНАМИ.
 *
 * Без цен модель раз за разом собирала `конус: урон + ослабление/броня` — 18
 * очков при потолке 16 — и сервер её чинил. Комбинация разумная, модель не
 * ошибалась; ей просто не сказали арифметику, и она не могла посчитать.
 * Замерено 29.08: пять прогонов подряд, три с одним и тем же перебором.
 * Правило шире случая: если сервер что-то пересчитывает, он обязан сообщить
 * правило — иначе он не проверяет, а угадывает за собеседника.
 */
export function parseUserPrompt(g) {
  const list = (o) => Object.values(o).map((x) => `${x.id} (${x.ru}, ${x.cost})`).join(', ');
  const axes = Object.entries(BUILD_AXES).map(([name, a]) => {
    const ru = {
      hp: 'health', maxSpeed: 'top speed, m/s', accel: 'acceleration',
      turnRate: 'turn rate', radius: 'body radius, m',
      jumpHeight: 'jump height, m',
    }[name];
    const dir = a.inverse
      ? `the SMALLER costs more: cost = (${a.max} − value) / ${a.per}`
      : `cost = (value − ${a.min}) / ${a.per}`;
    return `\n  ${name} (${ru}) from ${a.min} to ${a.max}, default ${a.def}; ${dir}`;
  }).join('');

  return `THE CREATURE'S BODY. Six numbers, and every one of them is yours: there
are no presets and nobody to inherit from. Every number costs points,
and the body has a ceiling of ${BUILD_BUDGET}.
${axes}

The radius IS the creature's size: a small target costs more because it is
harder to hit. A large body is cheaper, but it is easier to hit, and it does not
become slow or tough by itself — those are paid for on their own axes.

The body grants no damage at all. Damage lives in the abilities. A large
creature does not hit harder — it is only bigger.

Add the sum up BEFORE you write. Going over is not rejected, it is squeezed
proportionally, and the creature comes out as something other than you intended.

SPENDING TOO LITTLE IS A MISTAKE TOO: unspent points simply vanish, and the
creature comes out weaker for no reason at all. Spend the whole ceiling — if the
body comes out cheap, then somewhere you can take more without taking anything
away from the idea.

Every atom costs points. The cost of an ability = delivery + the sum of its
effects + channel, plus a surcharge for the combination: two effects +2, three
effects +5.

An ability does NOT decide when to fire: the mind always calls it. If the
description says the creature should answer a blow, that is the mind's job and
not the kit's.

DELIVERIES: ${Object.values(g.deliveries).map((x) => `\n  ${x.id} (${x.ru}, ${x.cost}) — ${x.doc}`).join('')}
EFFECTS: ${list(g.effects)}
CHANNELS: ${list(g.channels)}
ELEMENTS (cost 0, looks only). Not chosen at random: each has the thing it is
read by on screen, and that has to follow from the player's description. After
the dash — what the spectator sees; if the name is followed by "deliveries only",
that element has no other forms at all, and an ability with a foreign form is a
defect.${Object.values(g.elements).map((x) => `\n  ${x.id} (${x.ru}${Array.isArray(x.forms) && x.forms.length < Object.keys(g.deliveries).length ? `; deliveries only ${x.forms.join('/')}` : ''})${x.read ? ` — ${x.read}` : ''}`).join('')}

The ceiling for one ability is ${g.budgets.skill} points, for the whole set
${g.budgets.kit}. Count EVERY ability before you write it down. An ability over
the ceiling is a defect and will have to be replaced with a starter one.`;
}

/**
 * Шаг 1 — разбор промпта игрока в грамматику.
 *
 * Существо не теряется, если модель ошиблась: невалидные скиллы заменяются
 * из пресета и попадают в `unfit` как «не удалось собрать», а не молча.
 */
export async function parsePrompt({ prompt, bundle, call = callWithRepair }) {
  const g = grammar();
  /* Стартовый набор для ветвей, где разбора ещё нет: модель не ответила или
     ответила не-JSON. Там архетип неизвестен, и брать нечего, кроме дальнего. */
  const start = KIT_PRESETS.keeper;

  /*
   * НАБОР СОБИРАЕТ МОДЕЛЬ ПО ОПИСАНИЮ. ВЫБОРА У ИГРОКА НЕТ.
   *
   * Раньше экран создания показывал три карточки «набор умений · три на
   * выбор», и выбранный пресет ЗАТИРАЛ разбор: модель читала описание,
   * собирала набор — и он выбрасывался целиком. Игрок писал «грозный армянин»
   * и получал набор, к описанию не относящийся.
   *
   * Решение основателя 31.08: умения следуют из описания, и как получилось —
   * так получилось. Выбора на создании нет. Пресет остался ровно одним —
   * источником починки отдельного слота, когда модель вернула незаконное
   * умение (§8.1, правило 2: существо не теряется из-за одной детали).
   *
   * Набор при этом не приговор: он меняется на странице существа мгновенно и
   * бесплатно (D3). Разница в том, что теперь он меняется С ТОГО, что
   * следует из описания, а не с того, что игрок ткнул до генерации.
   */

  let raw;
  try {
    raw = await call({
      modelId: bundle.modelId,
      /* Усилие ВОЗИТСЯ ИЗ СВЯЗКИ. Оно писалось в каталог и не читалось ни
         одним вызовом, поэтому `sub:opus:plain` и `sub:opus:high` шли
         одинаково на `--effort high`: игрок выбирал разницу, которой нет.
         У связок OpenRouter поля нет — там подставится умолчание, и это
         ничего не меняет: на том канале усилие не используется вовсе. */
      effort: bundle.effort,
      maxTokens: Math.min(bundle.maxTokens, 4000 + bundle.thinkBudget),
      thinkBudget: bundle.thinkBudget,
      messages: [
        { role: 'system', content: `${PARSE_SYSTEM}\n\n${parseUserPrompt(g)}` },
        { role: 'user', content: prompt },
      ],
      accept: (t) => t.includes('{') && t.includes('}'),
    });
  } catch (e) {
    /* Правило 2 из §8.1: генерация не падает. Пресет — не «тихая подмена»,
       потому что он попадает в unfit явной строкой. */
    return {
      name: fallbackName(prompt),
      kit: start.kit,
      unfit: [{ phrase: prompt.slice(0, 80), why: 'reading the description failed, a starter set of abilities was used' }],
      why: start.why,
      costUsd: e.costUsd || 0,
      degraded: true,
    };
  }

  let obj;
  try { obj = extractJson(raw.text); }
  catch {
    return {
      name: fallbackName(prompt), kit: start.kit,
      unfit: [{ phrase: prompt.slice(0, 80), why: 'the mind answered in a shape the arena could not read, so a starter set of abilities was used' }],
      why: start.why, costUsd: raw.costUsd, degraded: true,
    };
  }

  const unfit = [];
  for (const u of Array.isArray(obj.unfit) ? obj.unfit.slice(0, 6) : []) {
    const phrase = typeof u === 'string' ? u : u?.phrase;
    if (phrase) unfit.push({ phrase: String(phrase).slice(0, 80), why: whyUnfit(String(phrase)) });
  }

  /*
   * Кит проверяется ЗАНОВО и чинится ТОЧЕЧНО.
   *
   * Модель могла придумать атом, перебрать бюджет или нарушить L1 — всё это
   * ловится здесь, а не в бою (§8: цифры, присланные клиентом или моделью,
   * не авторитетны). Но §8.1, правило 2, говорит и обратное: существо не
   * теряется из-за одной непопавшей детали. Поэтому чиним ровно то, что
   * сломано, и записываем ровно это: «скилл 2 не собрался» читается, а
   * «весь набор не собрался» — это отказ, замаскированный под починку.
   */
  /*
   * Телосложение — своё. Перебор по бюджету не отвергается, а сжимается:
   * модель, потратившая тридцать очков вместо двадцати пяти, хотела примерно
   * такое существо, и вернуть ей отказ значит потерять существо ради
   * арифметики, которую можно поправить. Сжатие уезжает наружу отчётом —
   * молчаливая подмена запрещена (§5.1).
   */
  const built = normalizeBuild(obj.build);

  /*
   * Пресет починки выбирается по ТЕЛУ, а не по виду.
   *
   * D29 говорит: ближний набор на лёгком быстром теле не работает, значит
   * запасное умение обязано быть от тела, иначе починка одного слота ломает
   * связку целиком. Раньше телом был архетип; теперь его нет, и «какое это
   * тело» решается тем, что модель за него заплатила: тяжёлое и медленное или
   * лёгкое и вёрткое.
   */
  const heavy = built.build.hp >= BUILD_AXES.hp.def && built.build.maxSpeed <= BUILD_AXES.maxSpeed.def;
  const fallback = heavy ? KIT_PRESETS.breaker : KIT_PRESETS.keeper;

  /* One seed for the whole kit, drawn from the sentence the player wrote, and
     shifted by the slot so three unnamed elements do not all land on the same
     letter of the alphabet. */
  const elementSeed = hashOf(prompt);
  let kit = Array.isArray(obj.kit) ? obj.kit.slice(0, KIT_SIZE) : [];
  kit = kit.map((s, i) => normalizeSkill(s, elementSeed + i));
  const repaired = [];

  /*
   * AN ELEMENT THAT DOES NOT EXIST, OR IS NOT OUT YET, IS A COLOUR — NOT A
   * BROKEN ABILITY.
   *
   * `validateSkill` does not see this: `time` is in the table, so a time zone
   * passes every per-slot rule. `validateKit` does see it, but only at the
   * very end, where the single remedy left is replacing the WHOLE set with a
   * starter preset. A creature written around slowing time therefore lost all
   * three of its abilities — shapes, effects and channels the mind had read
   * correctly out of the player's sentence — over a palette that is worth zero
   * points. The set that came back in their place was the preset, and that is
   * where two of the three names on the reveal came from.
   *
   * Repaired here, one slot at a time, in the same breath as E1 below: the
   * ability keeps everything the player asked for and changes the one axis
   * that costs nothing.
   */
  for (let i = 0; i < kit.length; i++) {
    if (!kit[i]) continue;
    const was = ELEMENTS[kit[i].element];
    if (was && !was.unreleased) continue;
    const picked = elementFor(kit[i], elementSeed + i);
    if (picked === kit[i].element) continue;
    kit[i] = { ...kit[i], element: picked };
    repaired.push({
      slot: i,
      why: `${was ? `${was.ru} is not in the arena yet` : 'there is no such element'}`
        + ` — the element was replaced with ${elementWord(picked)}`,
    });
  }

  for (let i = 0; i < KIT_SIZE; i++) {
    const bad = kit[i] ? validateSkill(kit[i]) : [{ code: 'shape' }];
    if (!bad.length) continue;
    /*
     * ЕДИНСТВЕННОЕ НАРУШЕНИЕ — E1 (стихия не бывает этой доставкой): умение
     * игрока сохраняется, меняется только стихия. Иначе «временной луч»
     * молча превращался бы в чужой стартовый пресет, и игрок получал бы не
     * своё умение вместо своего с другим цветом (docs/VFX-PLAN.md §7.5).
     */
    if (bad.every((b) => b.code === 'E1')) {
      /* The NEAREST legal element, not a stone by default. "A time beam" is
         repaired into a laser beam and "a gravity fan" into an ember one —
         the shape and the effects the player asked for survive, and the half
         that could not exist is answered by the half that can. */
      const picked = elementFor(kit[i], elementSeed + i);
      kit[i] = { ...kit[i], element: picked };
      repaired.push({ slot: i, why: `${bad[0].ru} — the element was replaced with ${elementWord(picked)}` });
      continue;
    }
    /* A slot replaced wholesale swallows any earlier note about its element:
       "the element was replaced with arc" is not true of an ability that is no
       longer on the creature, and two lines about one slot read as two
       failures. */
    for (let r = repaired.length - 1; r >= 0; r--) if (repaired[r].slot === i) repaired.splice(r, 1);
    kit[i] = fallback.kit[i];
    repaired.push({ slot: i, why: 'did not come together under the rules of the grammar' });
  }

  /* Два скилла, делающих одно и то же, — это один скилл с двумя кулдаунами:
     читаемости ноль, а именно она предмет §8. Меняем ПОВТОР, а не весь набор. */
  const sig = (k) => `${k.delivery}:${[...(k.effects || [])].sort().join('+')}`;
  const seen = new Set();
  for (let i = 0; i < kit.length; i++) {
    if (!seen.has(sig(kit[i]))) { seen.add(sig(kit[i])); continue; }
    const spare = fallback.kit.find((f) => !seen.has(sig(f)));
    if (!spare) continue;
    kit[i] = spare; seen.add(sig(spare));
    repaired.push({ slot: i, why: 'repeated another ability of the same set' });
  }

  /* Бюджет кита: снимаем самый дорогой лишний эффект с самого дорогого
     скилла, пока не влезет. Урезание дешевле подмены — оно оставляет
     задуманную форму умения. */
  let guard = 0;
  while (kit.reduce((a, k) => a + costOf(k), 0) > KIT_BUDGET && guard++ < 6) {
    const at = kit.map((k, i) => [costOf(k), i]).sort((a, b) => b[0] - a[0])[0][1];
    if ((kit[at].effects || []).length > 1) {
      const dropped = kit[at].effects.pop();
      repaired.push({ slot: at, why: `did not fit the budget — the effect “${EFFECT_RU(dropped)}” was removed` });
    } else {
      kit[at] = fallback.kit[at];
      repaired.push({ slot: at, why: 'did not fit the ability budget' });
    }
  }

  /*
   * ── AND NO TWO ABILITIES MAY CARRY THE SAME NAME ────────────────────────
   *
   * The name a player reads is ELEMENT + DELIVERY and nothing else (§9.1), so
   * two abilities that differ only in their effects — a kinetic lunge that
   * knocks back and a kinetic lunge that stuns — arrive on the reveal screen
   * as KINETIC LUNGE and KINETIC LUNGE. The dedup above cannot catch it: it
   * compares delivery and effects, which is exactly the pair that differs.
   *
   * The tie-break in §9.1 (a quieter `· STUN` line) exists for the kit where
   * two abilities really are the same shape and the difference matters. It is
   * not a licence to hand out the same name twice when moving a free, purely
   * visual axis makes the two abilities legible from across the screen.
   *
   * So the element moves, and only the element: the delivery and the effects
   * are what the player described and they are untouched. It is not written
   * into `unfit` either — nothing the player asked for failed here, and
   * "Not in the grammar: ability 2 as written" would be a false confession.
   */
  const named = new Set();
  for (let i = 0; i < kit.length; i++) {
    const key = (x) => `${x.element}:${x.delivery}`;
    if (!named.has(key(kit[i]))) { named.add(key(kit[i])); continue; }
    const free = elementRanking(kit[i], elementSeed + i)
      .find((el) => !named.has(`${el}:${kit[i].delivery}`));
    /* No free element for this shape means the arena genuinely has fewer
       colours than the kit has abilities of one shape. Leave it: a repeated
       name is a smaller lie than an illegal ability. */
    if (!free) { named.add(key(kit[i])); continue; }
    kit[i] = { ...kit[i], element: free };
    named.add(key(kit[i]));
  }

  /* Последний рубеж: если после всей починки кит всё ещё вне правил, ставим
     пресет целиком — но говорим об этом прямо. */
  if (validateKit(kit).length) {
    kit = fallback.kit.slice();
    repaired.length = 0;
    repaired.push({ slot: -1, why: 'the abilities did not come together at all — a starter set was used' });
  }

  /* In slot order, because that is the order the three tiles are in on the
     creature page: the repairs are collected by pass, not by ability, and
     "ability 1 … ability 3 … ability 2" reads as a list of three unrelated
     failures rather than a walk along one creature. */
  repaired.sort((a, b) => a.slot - b.slot);
  for (const r of repaired) {
    unfit.push({
      phrase: r.slot < 0 ? 'the ability set as written' : `ability ${r.slot + 1} as written`,
      why: r.why,
    });
  }

  return {
    name: sanitizeName(obj.name, prompt),
    /* Тело существа — вход матча, а не украшение карточки. */
    build: built.build,
    buildCost: built.cost,
    buildSqueezed: built.squeezed,
    colour: normalizeColour(obj.colour),
    kit,
    unfit,
    why: typeof obj.why === 'string' ? obj.why.slice(0, 200) : fallback.why,
    costUsd: raw.costUsd,
    degraded: false,
  };
}

/* `trigger` намеренно НЕ читается: оси нет. Модель, обученная на прошлой
   версии промпта, может его прислать — он просто не попадает в набор. */
/**
 * Цвет приводится к «#rrggbb» или отбрасывается.
 *
 * Отбрасывается молча и это осознанно: цвет ничего не решает в бою, и ронять
 * из-за него существо было бы дороже, чем подобрать оттенок самим.
 */
const normalizeColour = (v) => {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^#?([0-9a-f]{6})$/i);
  return m ? `#${m[1].toLowerCase()}` : null;
};

/** Размер приводится к диапазону: модель может прислать что угодно. */
const normalizeSize = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0.75, Math.min(1.5, n)) : 1;
};

/**
 * ── WHICH ELEMENT AN ABILITY GETS WHEN NOBODY CHOSE ONE ─────────────────────
 *
 * Both places that had to name an element named `kinetic`: the normaliser, for
 * a skill the mind returned without one, and the E1 repair, for a skill whose
 * element cannot take that shape. The result was measurable on the screen the
 * whole product is built around — the reveal read KINETIC FAN / KINETIC LUNGE /
 * KINETIC LUNGE, two identical names on the one card that is supposed to prove
 * the creature came out of the player's own sentence.
 *
 * An element costs nothing (registry, 28.08: it is visual only), so choosing a
 * fitting one is free in every sense — no number moves, no balance shifts, and
 * the name stops being three copies of the same word. The order of preference:
 *
 *   1. WHAT THE ABILITY DOES. Burning is embers, holding is frost, stunning is
 *      an arc, pulling is gravity. This is the strongest signal there is: the
 *      effect is the half of the ability the player wrote down.
 *   2. WHAT SHAPE IT COMES IN. A fan close to the ground is a flamethrower, a
 *      field on the floor is contamination, a blink is void. Nine deliveries,
 *      nine different answers, so a kit of three shapes cannot come out
 *      monochrome by default.
 *   3. THE CREATURE'S OWN DRAW. Everything still legal, rotated by a hash of
 *      the player's own prompt, so two creatures described differently get
 *      different colours and one creature described twice gets the same one.
 *
 * Every candidate is filtered through E1 first (`ELEMENTS[x].forms` — gravity
 * is only a field, a self-cast or a lob; the laser is only a beam or a bolt),
 * and `unreleased` elements never appear: time is closed by the founder's own
 * order and this must not be the door it comes back through.
 */
const ELEMENT_BY_EFFECT = [
  ['burn', 'ember'],
  ['pull', 'gravity'],
  ['stun', 'arc'],
  ['silence', 'arc'],
  ['shield', 'frost'],
  ['heal', 'frost'],
  ['root', 'frost'],
  ['weaken', 'acid'],
  ['blind', 'radiation'],
  ['wall', 'gravity'],
  ['boost', 'arc'],
  ['knock', 'kinetic'],
];

const ELEMENT_BY_DELIVERY = {
  beam: 'laser',
  cone: 'ember',
  bolt: 'arc',
  lob: 'acid',
  zone: 'radiation',
  dash: 'kinetic',
  blink: 'void',
  self: 'frost',
  jump: 'kinetic',
};

/** Released elements in table order — the pool the hash draws from. */
const RELEASED_ELEMENTS = Object.keys(ELEMENTS).filter((id) => !ELEMENTS[id].unreleased);

/** E1 in one line: does this element come in this shape at all? */
const elementFits = (id, delivery) => {
  const e = ELEMENTS[id];
  if (!e || e.unreleased) return false;
  return !Array.isArray(e.forms) || e.forms.includes(delivery);
};

/**
 * FNV-1a over the player's prompt.
 *
 * The seed has to be reproducible and it has to belong to this creature; the
 * creature's id does not exist yet at parse time, and the sentence the player
 * typed is the thing the creature is made of anyway. Same words in, same
 * colours out — which is what makes a re-run of a failed generation look like
 * the same creature rather than a new one.
 */
function hashOf(str) {
  let h = 2166136261;
  const t = String(str || '');
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Every element this ability could legally wear, best first. */
function elementRanking(skill, seed = 0) {
  const delivery = String(skill?.delivery || 'beam');
  const effects = Array.isArray(skill?.effects) ? skill.effects : [];
  const out = [];
  const add = (id) => { if (id && elementFits(id, delivery) && !out.includes(id)) out.push(id); };

  for (const [effect, id] of ELEMENT_BY_EFFECT) if (effects.includes(effect)) add(id);
  add(ELEMENT_BY_DELIVERY[delivery]);
  const pool = RELEASED_ELEMENTS.filter((id) => elementFits(id, delivery));
  const at = pool.length ? seed % pool.length : 0;
  for (let i = 0; i < pool.length; i++) add(pool[(at + i) % pool.length]);

  /* A delivery no element admits to cannot exist — every released element but
     four takes all nine shapes — but a grammar can be edited, and a repair
     that returns `undefined` would be worse than one that returns a stone. */
  if (!out.length) out.push('kinetic');
  return out;
}

/** The one it should wear. */
const elementFor = (skill, seed = 0) => elementRanking(skill, seed)[0];

/** How the chosen element reads in a sentence the player is shown. */
const elementWord = (id) => String(ELEMENTS[id]?.ru || id).toLowerCase();

const normalizeSkill = (s, seed = 0) => {
  if (!s || typeof s !== 'object') return null;
  const shape = {
    delivery: String(s.delivery || 'beam'),
    effects: Array.isArray(s.effects) ? s.effects.map(String).slice(0, 3) : [],
    ...(s.channel ? { channel: String(s.channel) } : {}),
  };
  /* An element the mind actually named is kept as written — even a wrong one,
     because E1 below repairs it knowing what it was trying to be. Only silence
     is answered by the table above. */
  return { ...shape, element: s.element ? String(s.element) : elementFor(shape, seed) };
};

/**
 * Почему понятие не влезло. Игроку показывается прямо (§8.1, правило 3):
 * «Не вошло: „чует кровь“ — реакции на раненого противника пока не существует.»
 */
const UNFIT_HINTS = [
  [/blood|wound|injur|bleed|кров|раненн?|подранк/i, 'there is no reaction to a wounded opponent yet'],
  /* «Прыгает» больше НЕ повод для отказа: с D160 прыжок — доставка грамматики,
     и правило должно стоять раньше общего «летает», иначе игроку, написавшему
     «прыгучий», ответят, что полёта нет. */
  [/jump|leap|bounc|hop\b|прыг|скач|отталкива/i, null],
  [/fly|flies|flight|wing|hover|glid|soar|лет|полёт|крыл|парит|планир/i, 'there is no sustained flight in the arena — there is a jump as an ability, everything else happens on the ground'],
  [/poison|venom|toxi|яд|отрав|токсин/i, 'poison is nothing to a machine — the element vocabulary is checked for plausibility against a robot'],
  [/invisib|cloak|stealth|camouflag|невидим|маскир|прячет/i, 'there is no invisibility: a fight has to be readable by a spectator'],
  [/summon|clone|minion|spawn|helper|призыв|клон|копи[юя]|помощник/i, 'there are always exactly two on the arena'],
  [/ally|allies|teammate|squad|лечит союз|союзник|команд/i, 'there are no allies — a fight is one against one'],
  [/telepath|mind.?read|read.{0,12}mind|телепат|мысли противник/i, 'there is no reading of another mind; ruining the opponent’s perception is what blind does'],
  [/evolv|mutat|adapts? its body|armou?r grows|броня растёт|эволюц|мутир/i, 'the body does not change during a fight'],
];

export function whyUnfit(phrase) {
  for (const [re, why] of UNFIT_HINTS) {
    if (!re.test(phrase)) continue;
    /* `null` means "the grammar HAS this — the mind put it in `unfit` for
       nothing". The answer has to say so without lying and without pointing
       at a screen that no longer exists: the hand-assembly screen was deleted
       in the redesign, and the old sentence ended by promising it. */
    if (why === null) return 'this one is in the grammar — the “jump” delivery; the mind simply did not reach for it';
    return why;
  }
  return 'there is no such idea in the ability grammar yet';
}

/**
 * Язык реплик — отдельной строкой, а не правкой промпта.
 *
 * `src/brain/prompt.js` — научный артефакт: шесть эталонных мозгов §1
 * написаны по нему дословно, и `checktactics` держит его в четырёх
 * разрешённых видах строк. Трогать его ради языка значит трогать основание
 * измерения ради оформления.
 *
 * Поэтому требование живёт здесь, на продуктовом пути. И это ограничение
 * С ПРИЧИНОЙ, а не пожелание: реплики `api.say()` — одно из двух
 * доказательств, которыми F11 заменил закрытый исходник, и доказательство
 * на чужом языке доказывает вдвое меньше.
 */
const SAY_RU = `One addition to the prompt above, and it is about language, not tactics.

The strings you pass to api.say() are read by the player, in English. Write them
in English: short, in the fighter's character, at most 90 characters. This is the
only place where language matters; variable names, comments and everything else
in the code stay as you are used to writing them.`;

/** Шаг 3 — мозг. Промпт описывает ЕГО кит, а не четыре умения из конфига. */
export async function forgeBrain({
  bundle, kit = null, call = callWithRepair, onAttempt = null,
  /* Размер существа: от него зависят здоровье, радиус, скорость и сила удара,
     и мозг планирует дистанции по этим числам (D103). Обе стороны — своя и
     чужая: соперник в бою может быть другого размера. */
  builds = null,
}) {
  const r = await call({
    modelId: bundle.modelId,
    effort: bundle.effort,
    maxTokens: bundle.maxTokens,
    thinkBudget: bundle.thinkBudget,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      /*
       * Промпт, который лжёт, хуже отсутствия промпта: модель ему верит,
       * пишет против него, и существо умирает от разницы. Мозг, которому
       * рассказали про `laser` и `smash`, а выдали `k1..k3` из грамматики,
       * получил бы ровно такой промпт.
       */
      /* Сторона в промпте — ТА ЖЕ, на которую мозг сядет в допуске и в бою:
         модель читает её как `p.self.id`, и расхождение здесь было бы враньём
         в самом первом абзаце. */
      { role: 'user', content: `${brainPrompt(CANDIDATE_SIDE, kit ? { own: kit, enemy: kit } : null, builds)}\n\n${SAY_RU}` },
    ],
    accept: (t) => {
      try { return extractSource(t).length > 200; } catch { return false; }
    },
    onAttempt,
  });
  return { source: extractSource(r.text), costUsd: r.costUsd, tries: r.tries, usage: r.usage };
}

const CARD_SYSTEM = `You read a fighter's mind program and describe ITS TACTICS to the player.
Answer in 2-3 sentences in English, no code, no variable names, no markdown.
Talk about behaviour: what distance it holds, what it waits for, what it answers with, when it takes a risk.
If the program does something strange or plainly bad, say so outright; do not make excuses for it.`;

/** Шаг 5 — карточка тактики. Один раз на мозг (D5), не на бой. */
/** Обрезать текст по последней границе предложения в пределах лимита. */
export function trimToSentence(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '),
    cut.lastIndexOf('.\n'), cut.lastIndexOf('\n'));
  /* Полпредела — нижняя граница разумного: обрезав «до первой точки» на
     двадцатом символе, мы выбросим карточку и покажем огрызок. */
  if (end > limit * 0.5) return cut.slice(0, end + 1).trim();
  const word = cut.lastIndexOf(' ');
  return `${(word > limit * 0.5 ? cut.slice(0, word) : cut).trim()}…`;
}

export async function tacticsCard({ source, bundle, call = callWithRepair }) {
  try {
    const r = await call({
      modelId: bundle.modelId,
      /* Усилие ВОЗИТСЯ ИЗ СВЯЗКИ. Оно писалось в каталог и не читалось ни
         одним вызовом, поэтому `sub:opus:plain` и `sub:opus:high` шли
         одинаково на `--effort high`: игрок выбирал разницу, которой нет.
         У связок OpenRouter поля нет — там подставится умолчание, и это
         ничего не меняет: на том канале усилие не используется вовсе. */
      effort: bundle.effort,
      maxTokens: Math.min(bundle.maxTokens, 1200),
      thinkBudget: 0,
      messages: [
        { role: 'system', content: CARD_SYSTEM },
        { role: 'user', content: source.slice(0, 12000) },
      ],
      accept: (t) => t.trim().length > 30,
      attempts: 1,
    });
    /*
     * ОБРЕЗАЕМ ПО ГРАНИЦЕ ПРЕДЛОЖЕНИЯ, А НЕ ПО СИМВОЛУ.
     *
     * `slice(0, 600)` рубил посреди слова: в базе лежат карточки,
     * кончающиеся на «…спасает только случайно круговое движение, а н».
     * Карточка — это ЗАМЕНА закрытому исходнику мозга (F11), то есть
     * доказательство, что мозг написан осмысленно. Оборванное на полуслове
     * доказательство доказывает обратное.
     *
     * Если границы предложения в пределах лимита нет вовсе (модель написала
     * одно длинное), режем по слову и ставим многоточие — это честно говорит
     * «дальше есть, но мы не показали».
     */
    return { text: trimToSentence(r.text.trim(), 600), costUsd: r.costUsd };
  } catch (e) {
    /* Карточка — доказательство, а не украшение (F11), но её отсутствие не
       повод потерять существо. Экран покажет реплики say() и разбор боя. */
    return { text: null, costUsd: e.costUsd || 0 };
  }
}

/**
 * VFX уровня 1: декорация умений, написанная моделью (§9.2).
 *
 * ЧТО МОДЕЛЬ ЗДЕСЬ РЕШАЕТ И ЧТО НЕТ. Не решает ничего из read-kit: силуэт
 * задан доставкой, палитра — элементом, импакт — эффектом, и всё это сервер
 * инжектит и не отдаёт. Решает — как каст выглядит СВЕРХ этого: откуда летят
 * искры, как они движутся, чем нарисованы, что остаётся на полу.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ ВЫЗОВ, А НЕ ЧАСТЬ РАЗБОРА ПРОМПТА. Разбор промпта
 * решает, каким существо БУДЕТ, — его ответ идёт в симуляцию, и провал там
 * означает отказ в генерации. Декорация на симуляцию не влияет никогда, и её
 * провал обязан стоить ровно ничего: существо рождается без IR и выглядит
 * как выглядели все до этой функции. Смешать их в один вызов значило бы
 * привязать судьбу существа к качеству украшения.
 *
 * ПОЧЕМУ БЕЗ РАЗМЫШЛЕНИЯ И НА МАЛОМ ЛИМИТЕ. Задача — выбрать по три имени из
 * закрытых списков на каждое умение. Это не рассуждение, это вкус; думать
 * тут дорого и не над чем.
 */
const VFX_SYSTEM = `You are the effects artist. Invent a decoration for each of the creature's abilities.

WHAT IS ALREADY DRAWN WITHOUT YOU and what you cannot change:
the silhouette is set by the delivery, the colours are set by the element, the
hit at the point of impact is set by the effect.
You ADD on top. Nothing can be replaced.

The answer is JSON ONLY, no explanations, in the shape:
{"k1":{"layers":[{...}],"screen":"none"},"k2":{...},"k3":{...}}

A layer:
  emitter  where it comes from: ring | burst | cone | trail | spiral | rain
  motion   how it travels: linear | ease_out | gravity | rise | swirl
  sprite   what it is drawn with: dot | streak | shard | spark
  decal    the mark left on the floor: none | ring | scorch | cross
  from,to  steps of the element's palette, integers 0..2 (the colour itself cannot change)
  count    particles, integer
  life     seconds of life
  delay    seconds from the start of the cast
  speed    metres per second
  size     metres

screen: none | shake | flash, and when it is not none add screenAmount.

THE LIMITS ARE HARD, an answer outside them is not accepted:
  no more than LAYERS layers per ability
  no more than PARTICLES particles per ability in total
  life no more than LIFE, delay no more than DELAY, screenAmount no more than SHAKE

Make the abilities DIFFERENT: three identical decorations are no decoration at all.
Let the decoration say what the ability does.`;

export async function forgeVfx({ prompt, kit, kitDefs, bundle, call = callWithRepair }) {
  if (!kitDefs) return { ir: null, costUsd: 0 };
  const names = Object.keys(kitDefs);
  const limits = vfxGrammar().limits;
  const system = VFX_SYSTEM
    .replace('LAYERS', String(limits.layers))
    .replace('PARTICLES', String(limits.particles))
    .replace('LIFE', String(limits.life))
    .replace('DELAY', String(limits.delay))
    .replace('SHAKE', String(limits.shake));
  const listing = names
    .map((n, i) => `${n}: ${describe(kit[i])}`)
    .join('\n');
  try {
    const r = await call({
      modelId: bundle.modelId,
      /* Усилие ВОЗИТСЯ ИЗ СВЯЗКИ. Оно писалось в каталог и не читалось ни
         одним вызовом, поэтому `sub:opus:plain` и `sub:opus:high` шли
         одинаково на `--effort high`: игрок выбирал разницу, которой нет.
         У связок OpenRouter поля нет — там подставится умолчание, и это
         ничего не меняет: на том канале усилие не используется вовсе. */
      effort: bundle.effort,
      maxTokens: Math.min(bundle.maxTokens, 1400),
      thinkBudget: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Creature: ${prompt.slice(0, 400)}\n\nAbilities:\n${listing}` },
      ],
      /*
       * `accept` — НАСТОЯЩАЯ ПРОВЕРКА, а не «есть ли фигурная скобка».
       *
       * Валидатор один и тот же на приём и на запись: если он тут мягче, то
       * ответ примут и оплатят, а потом выбросят при сохранении — то есть
       * заплатят за брак (E5 запрещает брать деньги за непринятую генерацию).
       */
      accept: (t) => {
        const parsed = parseVfx(t, names);
        return parsed && Object.keys(parsed).length > 0;
      },
      attempts: 2,
    });
    return { ir: parseVfx(r.text, names), costUsd: r.costUsd };
  } catch (e) {
    /* Декорация — украшение. Её отсутствие не повод потерять существо. */
    return { ir: null, costUsd: e.costUsd || 0 };
  }
}

/**
 * Разобрать ответ модели в карту «имя умения → канонический IR».
 *
 * Возвращает null, если не разобралось вовсе. Умения, чей IR не прошёл
 * проверку, ПРОСТО ВЫПАДАЮТ: одно кривое умение не должно лишать декорации
 * два остальных, а read-kit нарисует его и без неё.
 */
export function parseVfx(text, names) {
  let raw = null;
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    raw = JSON.parse(m[0]);
  } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const n of names) {
    const one = canonicalIr(raw[n]);
    if (one) out[n] = one;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Весь конвейер. Возвращает описание существа ИЛИ причину отказа.
 *
 * `onStage` двигает экран ожидания: он занимает 60–180 с чужим боем (§10.3),
 * и «спиннер» там запрещён — значит стадии должны быть настоящими.
 */
/**
 * Весь конвейер. Возвращает описание существа ИЛИ причину отказа.
 *
 * `keepKit` — РЕФАКТОР, и это не оптимизация, а исправление шва.
 *
 * F3: рефактор меняет мозг существа, всё остальное живёт. Но конвейер один на
 * оба пути, и на рефакторе он делал три лишние вещи, каждая вредная:
 *
 *   РИСОВАЛ ТЕЛО. Самая дорогая часть генерации ($0.05–$1.72 по §5.1)
 *     оплачивалась и выбрасывалась: `finishRefactor` берёт из результата
 *     только мозг и карточку.
 *   СОЧИНЯЛ ДЕКОРАЦИЮ. То же самое, только дешевле.
 *   ЗАНОВО РАЗБИРАЛ НАБОР ИЗ ПРОМПТА — и писал мозг под НЕГО. Существо по F3
 *     остаётся со старым набором, имена `k1..k3` совпадут, а смысл нет:
 *     новый мозг обучен другим умениям под теми же именами. Это худший вид
 *     расхождения — всё работает и всё неправильно.
 *
 * `keepKit` передаётся рефактором и означает «набор уже есть, вот он»: разбор
 * промпта не трогает умения, тело и декорация не генерируются.
 */
/**
 * НАША ПОЛОМКА ИЛИ ОТКАЗ МОДЕЛИ — РАЗНЫЕ ВЕЩИ, И ЛИМИТ ЭТО РАЗЛИЧАЕТ.
 *
 * Оба исхода превращались в один код `brain_failed`. Он не входит в
 * `OUR_FAULT`, значит попытка списывалась с суточного лимита игрока — включая
 * случаи, когда до модели вообще не дошли: нет ключа, сеть легла, провайдер
 * не ответил. Замерено: сервер без ключа, три запроса подряд, три задания с
 * нулевой тратой — и четвёртый отказ `account_day` до следующих суток. Модель
 * не вызывалась ни разу.
 *
 * Заодно врал экран ожидания: он выводит «попытка засчитана: модель ответила»
 * из того же кода и утверждал это про поломку, в которой модели не было.
 *
 * `no_key`, `network`, `wall` — это МЫ: ключ наш, сеть наша, потолок раздумий
 * наш. Всё остальное — модель ответила и ответ не годится, и это честная
 * попытка.
 */
/* Тот же список, что классифицирует отказ тела (`SILENT_CODES` в `body.js`),
   минус коды «ответа не было» — здесь речь о том, чей отказ роняет генерацию.
   Два списка в одной папке однажды уже разошлись и назвали один код
   противоположно. */
/* Экспортируется РАДИ ГЕЙТА: `checkfaults.mjs` сверяет этот список с
   `OUR_FAULT` в limits.js. Они уже расходились однажды — на `http`, и это
   стоило игроку суточных попыток за наш кончившийся счёт. Комментарий
   «два списка в одной папке однажды разошлись» стоял здесь и тогда: он
   предупреждал, но ничего не проверял. */
export const OUR_CODES = new Set(['no_key', 'network', 'wall', 'no_catalog', 'internal', 'rate', 'http']);
const ourFault = (e) => (OUR_CODES.has(e?.code) ? e.code : 'brain_failed');

export async function forgeCreature({
  prompt, bundle, catalog, keepKit = null,
  onStage = () => {}, call = callWithRepair,
  /* Событие наружу. Конвейер не знает про базу и про аналитику — он сообщает,
     что случилось, а записывает вызывающий (`jobs.js`). */
  onEvent = null,
}) {
  const spent = { usd: 0 };
  const note = [];
  let use = bundle;

  onStage('parse', 0.1);
  const parsed = await parsePrompt({ prompt, bundle: use, call });
  spent.usd += parsed.costUsd || 0;
  /*
   * НА РЕФАКТОРЕ НАБОР — СТАРЫЙ, и мозг пишется под него.
   *
   * Разбор промпта всё равно нужен: он даёт имя, архетип и «не вошло». Но
   * умения он на рефакторе не решает — по F3 существо остаётся со своим
   * набором, и мозг, написанный под НОВЫЙ разбор, знал бы `k1..k3` с другим
   * смыслом под теми же именами.
   */
  if (keepKit) parsed.kit = keepKit;

  onStage('brain', 0.35);
  /* Кит компилируется ДО мозга: промпт обязан описывать те умения, которые
     у существа действительно будут. */
  const compiled = compileKit(parsed.kit);
  const kitDefs = compiled.problems.length ? null : compiled.defs;

  /*
   * ТЕЛО И МОЗГ ИДУТ ПАРАЛЛЕЛЬНО.
   *
   * Они не зависят друг от друга: тело рисуется по промпту игрока, мозг
   * пишется по архетипу и набору. Последовательно это минута плюс минута;
   * параллельно — минута. Игрок ждёт вдвое меньше за те же деньги, и это
   * единственное место во всей генерации, где такое вообще возможно.
   *
   * `catch` здесь обязателен и не декоративен: непойманный отказ одной из
   * двух веток в `Promise.all` уронил бы вторую, за которую уже заплачено.
   */
  /* Модель, которой заказано ТЕЛО. `use` ниже может смениться на запасную из-за
     мозга, а телу нужно знать, кто подвёл именно его. */
  const bodyBundle = use;
  const bodyPromise = keepKit
    /* Рефактор меняет мозг (F3). Тело у существа уже есть, и платить за
       второе — это платить за то, что будет выброшено. */
    ? Promise.resolve({ ok: false, skipped: true, costUsd: 0 })
    : forgeBody({ prompt, bundle: use, call })
      .catch((e) => ({ ok: false, code: 'body_failed', message: e.message, costUsd: e.costUsd || 0 }));

  let brain;
  try {
    brain = await forgeBrain({ bundle: use, kit: kitDefs, call, builds: { own: parsed.build, enemy: null } });
  } catch (e) {
    /* Молчаливая подмена запрещена (§5.1): «Fable не справилась, существо
       сделала Gemini» — обязательная строка, а не любезность. */
    const alt = fallbackBundle(catalog, use.bundle);
    spent.usd += e.costUsd || 0;
    if (!alt) return { ok: false, code: ourFault(e), message: 'The mind did not come together.', costUsd: spent.usd };
    note.push({
      kind: 'fallback',
      from: use.label,
      to: alt.label,
      /* The line the player actually reads (§5.1). Without it the note is a
         record with nothing in it a screen can print, and the substitution
         the rule above calls mandatory happens in silence. */
      message: `${use.label} did not come together — ${alt.label} wrote this mind.`,
    });
    use = alt;
    onStage('brain_retry', 0.45);
    try {
      brain = await forgeBrain({ bundle: use, kit: kitDefs, call, builds: { own: parsed.build, enemy: null } });
    } catch (e2) {
      spent.usd += e2.costUsd || 0;
      return { ok: false, code: ourFault(e2), message: 'The mind did not come together, and neither did the one we fell back to.', costUsd: spent.usd };
    }
  }
  spent.usd += brain.costUsd || 0;

  /*
   * Тело догоняет здесь. Если оно не собралось — существо ВСЁ РАВНО
   * создаётся и носит тело архетипа.
   *
   * Это выбор, а не упрощение. Мозг — то, за что игрок платил и во что он
   * вложил замысел; тело — то, как этот замысел выглядит. Выбросить готовый
   * мозг из-за неудачной картинки значит наказать игрока за нашу неудачу.
   * Обратное — молча подсунуть чужое тело и промолчать — запрещено тем же
   * правилом, что и молчаливая подмена модели (§5.1): в `note` уезжает
   * строка, и игрок читает её на экране существа.
   */
  /*
   * У ТЕЛА СВОЯ СТАДИЯ, и это самая длинная из всех.
   *
   * Тело и мозг идут параллельно, но тело дольше — замерено 259 и 1889 секунд
   * против минуты у мозга. Пока оно рисуется, стадия оставалась «модель пишет
   * мозг» с прогрессом 0.35: экран ожидания стоял неподвижно несколько минут
   * на самом хрупком отрезке первой сессии, и человек, естественно, читал это
   * как «зависло».
   *
   * Стадия ставится ПОСЛЕ мозга и только если тело ещё не готово: если оно
   * успело раньше, ставить её значит показать шаг, которого не было.
   */
  let bodyDone = false;
  bodyPromise.then(() => { bodyDone = true; }, () => { bodyDone = true; });
  await Promise.resolve();
  if (!bodyDone) onStage('body', 0.55);
  let bodyOut = await bodyPromise;
  spent.usd += bodyOut.costUsd || 0;

  /*
   * ВТОРАЯ ПОПЫТКА ТЕЛА НА ДРУГОЙ МОДЕЛИ.
   *
   * У мозга это есть с самого начала (выше), у тела не было: одна неудача — и
   * существо навсегда надевало тело архетипа. Замерено на 27 существах в базе:
   * 25 из них носят чужое тело. Игрок пишет «стеклянная медуза» и получает
   * гориллу — ровно та беда, ради которой этот файл вообще написан.
   *
   * Отказ тела почти всегда конкретен: модель не выдержала правила песочницы,
   * или её поза ничего не двигает, или геометрия не влезла в потолок памяти.
   * Это свойство МОДЕЛИ, а не заказа, и другая модель по тому же промпту чаще
   * всего справляется — так же, как справляется с мозгом.
   *
   * Молчания не будет: строка про подмену уезжает в `note` и читается на
   * экране существа, как и подмена модели мозга (§5.1).
   */
  if (!bodyOut.ok && !bodyOut.skipped && spent.usd < REQUEST_BUDGET_USD) {
    const altBody = fallbackBundle(catalog, bodyBundle.bundle);
    if (altBody) {
      onStage('body_retry', 0.62);
      const second = await forgeBody({ prompt, bundle: altBody, call })
        .catch((e) => ({ ok: false, code: 'body_failed', message: e.message, costUsd: e.costUsd || 0 }));
      spent.usd += second.costUsd || 0;
      if (second.ok) {
        note.push({
          kind: 'body_fallback',
          from: bodyBundle.label,
          to: altBody.label,
          message: `${bodyBundle.label} did not come together — ${altBody.label} drew this body.`,
        });
        bodyOut = second;
      } else {
        /* Обе модели отказали — значит, дело, скорее всего, в заказе, и игроку
           честнее показать причину второй попытки: она свежее. */
        bodyOut = { ...second, tried: [bodyBundle.label, altBody.label] };
      }
    }
  }

  if (!bodyOut.ok && !bodyOut.skipped) {
    /*
     * A BIRTH NOTE IS A LINE ON THE CREATURE SCREEN, not a log entry.
     *
     * `bodyOut.message` is whatever the body forge threw — `Unexpected token
     * <`, a timeout string, a provider's error body — and this note is printed
     * verbatim as a warning line beside the specimen. The player is owed the
     * FACT (their creature is wearing a stock shape) in the product's voice;
     * the exception is already carried to telemetry two lines below, with the
     * code and whose fault it was, which is where it is actually readable.
     */
    note.push({ kind: 'body_failed', message: 'The body did not come together, so this creature wears a stock one.' });
    /*
     * И в телеметрию — с ПРИЧИНОЙ и с ответом на «чья вина».
     *
     * Без этого доля отказов тела считалась бы по жалобам, а не по замеру:
     * существо всё равно рождается (D117), игрок часто не жалуется вовсе, и
     * единственный след — эта строка. `whose` тут не украшение: требование
     * основателя сформулировано как «ошибки не по нашей вине», а проверить это
     * можно только считая отказы по причинам.
     */
    onEvent?.('body_rejected', {
      code: bodyOut.problems?.[0]?.code || bodyOut.code || 'unknown',
      whose: bodyOut.whose || 'unknown',
      tries: bodyOut.tries ?? null,
      model: bodyBundle.modelId,
    });
  }

  onStage('validate', 0.7);
  /*
   * ДОПУСК, а не просто валидация.
   *
   * Мозг, только что написанный моделью по свободному тексту игрока, —
   * это ровно тот код, ради которого написан A1. `admit()` прогоняет его
   * через все четыре стены: статический анализ, вставку учёта топлива,
   * два пробных боя в изоляте и проверку, что он не падает и не крутится.
   *
   * Порядок важен: допуск ДО записи в БД. Тогда «в базе нет ни одного
   * мозга, не прошедшего стены» — свойство схемы, а не привычка.
   */
  const v = await admit(brain.source, CANDIDATE_SIDE, { sparring: sparringFor(), kit: kitDefs });
  if (!v.ok) {
    /* E5: отклонённая валидатором генерация бесплатна для игрока. Деньги,
       которые провайдер уже списал, в дневной бюджет попадают — это два
       разных счётчика, см. limits.recordSpend. */
    return {
      ok: false, code: 'rejected', stage: v.stage,
      /* The validator's own `problems[0].message` names a stage and a rule —
         it is written for whoever reads the admission log, and the birth
         screen prints this string as the reason. `problems` still travels
         alongside for anyone who needs the detail. */
      message: 'The mind did not pass its two trial fights.',
      problems: v.problems, costUsd: spent.usd, note,
    };
  }

  onStage('card', 0.9);
  const cardOut = await tacticsCard({ source: brain.source, bundle: use, call });
  spent.usd += cardOut.costUsd || 0;

  /*
   * Декорация умений — последним шагом и без права уронить генерацию.
   *
   * Идёт после мозга нарочно: к этому моменту существо уже существует по
   * всем частям, от которых зависит бой, и любой исход здесь меняет только
   * то, как каст выглядит. Это ровно тот порядок, который требует §9.2:
   * «худший случай — скучный эффект, а не чёрный экран».
   */
  const vfxOut = keepKit
    ? { ir: null, costUsd: 0 }
    : await forgeVfx({ prompt, kit: parsed.kit, kitDefs, bundle: use, call });
  spent.usd += vfxOut.costUsd || 0;

  /*
   * ГОДНОСТЬ НАБОРА — ЗАМЕР, А НЕ ДОГАДКА, и он наконец подключён.
   *
   * `forge/viability.js` был написан, задокументирован как применяемый — «для
   * библиотеки запрет, для существа игрока предупреждение» — и не вызывался
   * НИОТКУДА. Ровно тот класс, что и мёртвые оси VFX (D70): код есть, правило
   * записано, эффекта нет.
   *
   * Цена бездействия видна в базе: пять существ с активным набором имеют ноль
   * побед за сотни боёв каждое, и у трёх из них больше половины боёв — ничьи.
   * Это не «слабый замысел», это набор, которым нельзя коснуться противника:
   * «мотылёк, который слепит» получил ослепление, ускорение и один рывок с
   * уроном, а рывок — удар в упор при лёгком дальнобойном теле.
   *
   * Отказывать игроку в его замысле мы не вправе (набор он меняет мгновенно и
   * бесплатно, D3), поэтому здесь — ПРЕДУПРЕЖДЕНИЕ, которое доезжает до
   * экрана существа через `note`. Запрет — только там, где существо
   * показывают всем: `tools/seedlive.mjs` заселяет библиотеку и отказывает.
   *
   * Сорок боёв — четыре десятых секунды на генерацию длиной в
   * минуты. За эту цену игрок узнаёт про своё существо главное.
   */
  if (kitDefs) {
    try {
      /* Размер — сюда тоже. Это ЕДИНСТВЕННОЕ место, где модель только что
         выбрала размер, и мерить годность набора на теле размера 1 значит
         мерить чужое существо. D123 требует размер на всех путях матча, и
         этот путь был последним, где его не было. */
      const v = await viability(parsed.kit, { build: parsed.build ?? null });
      if (!v.ok) {
        /* The note is printed as a warning line beside the specimen, not filed
           in a log: the measure's own words are a lower-case fragment, and a
           fragment set among full sentences on that page reads as a leak. */
        const why = String(v.why || '').trim();
        note.push({
          kind: 'kit_unviable',
          message: why ? `${why[0].toUpperCase()}${why.slice(1)}.` : '',
          hits: v.hits,
          rounds: v.rounds,
        });
      }
    } catch { /* замер не удался — молчим: это наша проблема, не игрока */ }
  }

  onStage('done', 1);
  return {
    ok: true,
    name: parsed.name,
    /* `gen:` подставит слой хранения, когда у существа появится id:
       ссылка на тело — это ссылка на существо (F2), и раньше id её не
       существует. Здесь остаётся стоковое тело как запасное.
       Ссылка на тело, когда своего нет. Вида нет — берём одну заглушку на
       всех; заменяется сгенерированным телом. `octopus` тут — ИМЯ ФАЙЛА
       `bodies/octopus.js`, а не сторона: стороны зовутся `blue` и `orange`,
       а стоковые тела лежат на диске под прежними именами. */
    bodyRef: 'octopus',
    bodySource: bodyOut.ok ? bodyOut.source : null,
    bodySafe: bodyOut.ok ? bodyOut.safe : null,
    bodyDraws: bodyOut.ok ? (bodyOut.draws ?? null) : null,
    kit: parsed.kit,
    size: parsed.size ?? 1,
    unfit: parsed.unfit,
    why: parsed.why,
    brainSource: brain.source,
    brainModel: use.bundle,
    tacticsCard: cardOut.text,
    constantsVersion: constantsVersion(),
    costUsd: spent.usd,
    note,
    kitReadable: parsed.kit.map(describe),
    kitCost: parsed.kit.map(costOf),
    vfxIr: vfxOut.ir,
  };
}
