/**
 * Арена — экран по умолчанию и единственный, у которого нет своего DOM.
 *
 * Бой рисует вьювер, перенесённый из утверждённого эталона (§10.6). Этот
 * модуль отвечает за то, чего у эталона не было: состояние «между боями»,
 * метка тренировочного соперника, дайджест «пока тебя не было», подпись
 * авторства и переход в итог боя.
 *
 * §6.2 буквально: «вошёл посреди боя — попадает сразу на арену, нет боя —
 * в меню». Меню как экрана нет (§10.3), поэтому «меню» здесь — состояние
 * этой же вкладки: кольцо `.seeking` вокруг одной кнопки и отсчёт до
 * следующего боя.
 */

import { get, track } from '../lib/api.js';
import { $, h, mount, clear, waitLabel, num } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';
import * as result from './result.js';

let ctx = null;
let idleEl = null;
/* Когда начали смотреть текущий бой — для честного `fight_watched`. */
let watchStartedAt = 0;
let watchedMatchId = null;
let tick = null;
let watchedMatch = null;

export async function enter(root, args, c) {
  ctx = c;
  root.className = 'on';
  document.body.classList.remove('overlay');
  paintSides();
  paintDigest();
  if (ctx.state.match) hideIdle(); else showIdle();
  if (ctx.state.over) result.showInline(ctx);
  startTick();
}

export function leave() {
  stopTick();
  result.hideInline();
}

// ── состояние «между боями» ────────────────────────────────────────────────

function ensureIdle() {
  if (idleEl && idleEl.isConnected) return idleEl;
  idleEl = h('div#idle');
  $('#arena').appendChild(idleEl);
  return idleEl;
}

/*
 * Ключ содержимого панели ожидания.
 *
 * Панель пересобирается ТОЛЬКО когда меняется то, что на ней написано.
 * Раньше она пересобиралась на каждый вызов, а вызовов приходило столько,
 * сколько сообщений `idle` слал сервер, — то есть тридцать в секунду. Считать
 * это проблемой одного сервера нельзя: клиент обязан быть устойчив к тому,
 * что ему сказали одно и то же дважды.
 */
let idleKey = null;

export function showIdle() {
  const s = ctx?.state.session;
  const el = ensureIdle();
  el.style.display = '';

  const key = !s ? 'no-session'
    : (s.job && (s.job.state === 'queued' || s.job.state === 'running') ? `job:${s.job.id}:${s.job.state}`
      : (s.creature ? `creature:${s.creature.id}` : 'guest'));
  if (key === idleKey && el.childElementCount) return;
  idleKey = key;

  if (!s) { mount(el, h('div.t-cap', 'соединение')); return; }

  /* Гость без своего существа. F7 даёт ему библиотечное; D2 делает это
     выбором, а не выдачей — «я выбрал» держит воронку лучше, чем «нам дали». */
  if (!s.creature) {
    /*
     * ВЫБОР, А НЕ КНОПКА В НИКУДА.
     *
     * Комментарий здесь всегда обещал D2 — «выбор, а не выдача», — а кнопка
     * вела на `/creature/me`, где гостю сообщали, что своего существа у него
     * нет. То есть обещание F7 «гость играет библиотечным стартовым
     * существом» не выполнялось ни в одном месте: ручка `/api/starters`
     * существовала и её никто не звал.
     *
     * Три карточки грузятся асинхронно, а панель рисуется сразу: F6 отводит
     * на первый кадр десять секунд, и ждать ради трёх имён нельзя.
     */
    const cards = h('div.cards', h('div.t-sub', 'подбираем троих…'));
    /*
     * ЗАГОЛОВОК ГОВОРИТ ПРО ТО, ЧТО СЕЙЧАС НА ЭКРАНЕ.
     *
     * Здесь стояло «ТЫ СМОТРИШЬ ЧУЖОЙ БОЙ» — а панель показывается ровно
     * тогда, когда боя НЕТ (её ставит `showIdle`, то есть отсутствие матча).
     * Гость читал про бой, глядя на пустую арену с часами 0.0 и «– / –»
     * вместо здоровья. Это первый экран продукта.
     *
     * И вторая половина: он ждал молча. У владельца существа есть отсчёт до
     * следующего боя, у гостя не было ни таймера, ни обещания — только
     * «подбираем троих…» над пустым полом.
     */
    let chosen = null;
    try { chosen = localStorage.getItem('airena.starter'); } catch { /* приватный режим */ }
    mount(el, h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 21 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.t-cap', { style: { color: 'var(--oct)', fontSize: '14px' } },
          chosen ? 'ЖДЁМ СЛЕДУЮЩИЙ БОЙ' : 'СЕЙЧАС НИКТО НЕ ДЕРЁТСЯ'),
        h('div.t-body', { style: { maxWidth: '46ch', margin: '8px 0 6px' } },
          chosen
            /*
             * Здесь было «Твоё существо выйдет на арену» — про БИБЛИОТЕЧНОЕ
             * существо, которое гостю не принадлежит и в расписание боёв не
             * ставится вовсе (`schedule` фильтрует `is_library = 0`). Обещание
             * было неправдой дважды: и «твоё», и «выйдет».
             */
            ? 'Выбранное существо из библиотеки выйдет на арену следующим — бои идут непрерывно.'
            : 'Возьми существо из библиотеки — оно дерётся ровно так же, как любое другое. '
              + 'Своё можно сделать после первого боя.'),
        h('div.t-sub', { style: { marginBottom: '14px' } },
          'бои идут непрерывно, следующий начнётся сам'),
        h('div.prog.pulse', { style: { marginBottom: '14px' } }, h('i', { style: { width: '34%' } })),
        cards)));
    paintFrames(el);
    pickStarter(cards, ctx);
    return;
  }

  if (s.job && (s.job.state === 'queued' || s.job.state === 'running')) {
    mount(el,
      h('div.t-cap', 'существо собирается · бои начнутся, когда оно будет готово'),
      h('div.prog.pulse', h('i', { style: { width: '38%' } })));
    return;
  }

  if (!s.creature.hasBrain) {
    mount(el,
      h('div.t-cap', { style: { color: 'var(--bad)' } }, 'существо не собралось. денег не взяли.'),
      h('div', { style: { marginTop: '12px' } },
        h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'ПОПРОБОВАТЬ ЕЩЁ')));
    return;
  }

  mount(el,
    h('span.seeking', h('button.btn.primary', { onclick: () => ctx.go('/creature/me') }, 'СМОТРЕТЬ БОЙ')),
    h('div.cd-t', 'существо ищет бой'),
    h('div.prog', h('i', { style: { width: '0%' } })));
  renderCountdown();
}

export function hideIdle() { if (idleEl) idleEl.style.display = 'none'; }

function renderCountdown() {
  const s = ctx?.state.session;
  if (!idleEl || !s?.nextFightAt) return;
  const left = s.nextFightAt - Date.now();
  const t = idleEl.querySelector('.cd-t');
  const bar = idleEl.querySelector('.prog > i');
  if (!t) return;
  if (left <= 0) { t.textContent = 'бой начинается'; if (bar) bar.style.width = '100%'; return; }
  t.textContent = `существо отдыхает · следующий бой через ${waitLabel(left)}`;
  /* Полоса заполняется за отдых, а не за минуту: шкала, у которой знаменатель
     больше настоящего ожидания, не двигается вовсе и читается сломанной. */
  const span = Math.max(1000, s.restMs || 5000);
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, (1 - left / span) * 100)).toFixed(0)}%`;
}

function startTick() {
  stopTick();
  tick = setInterval(() => {
    renderCountdown();
    /* Раз в 20 с переспрашиваем сессию: бои идут на сервере всегда, и
       страница, которая этого не замечает, обещает автобатлер и не
       показывает его. */
    if (Date.now() % 20000 < 1000) ctx?.refreshSession().then(() => {
      if (!ctx.state.match) showIdle();
    }).catch(() => {});
  }, 1000);
}
function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

// ── сообщения сокета ───────────────────────────────────────────────────────

export function onMatch(m) {
  brokenBodies.clear();
  document.body.classList.remove('decided');
  watchedMatch = m;
  document.body.classList.add('fighting');
  hideIdle();
  result.hideInline();
  paintSides(m);
  const clock = $('#clock .s');
  if (clock) clock.textContent = `бой №${m.seed}`;
  /*
   * СОБЫТИЕ ШЛЁТСЯ ОДИН РАЗ НА БОЙ И НЕСЁТ НАСТОЯЩЕЕ ВРЕМЯ.
   *
   * Раньше `fight_watched` уходило дважды: на старте боя с `seconds: 0` и на
   * конце с `seconds: 1`. Метрика §14 «матчей на DAU» удваивалась, а время
   * просмотра не измерялось вовсе — при том, что именно оно отвечает на
   * вопрос «досматривают ли бой», ради которого событие и заведено.
   *
   * Здесь только запоминаем, когда бой начали смотреть.
   */
  watchStartedAt = Date.now();
  watchedMatchId = m.matchId;
  for (const el of [$('#bar-oct'), $('#bar-gor')]) el?.classList.remove('dead', 'won');
}

export function onFrame(f) {
  const clock = $('#clock .s');
  if (!clock || !watchedMatch) return;
  /* Внезапная смерть — рампа, а не константа: процент берётся из кадра,
     иначе строка врёт ровно тем сильнее, чем дольше идёт бой. */
  if (f.t >= 30) {
    clock.classList.add('burning');
    clock.textContent = 'ВНЕЗАПНАЯ СМЕРТЬ · арена жжёт обоих';
  } else {
    clock.classList.remove('burning');
    const left = Math.max(0, 30 - f.t);
    clock.textContent = left < 9
      ? `бой №${watchedMatch.seed} · арена загорится через ${Math.ceil(left)} с`
      : `бой №${watchedMatch.seed}`;
  }
}

export function onOver(o) {
  document.body.classList.remove('fighting');
  /* Итог на экране — легенда чтения боя уходит: объяснять больше нечего, а на
     узком экране она ложилась прямо на числа (см. `app.css`). */
  document.body.classList.add('decided');
  const win = o.winner;
  if (win) {
    $(win === 'octopus' ? '#bar-oct' : '#bar-gor')?.classList.add('won');
    $(win === 'octopus' ? '#bar-gor' : '#bar-oct')?.classList.add('dead');
  }
  /* Один раз на бой, со временем от начала просмотра до конца боя. */
  if (watchedMatchId === o.matchId && watchStartedAt) {
    track('fight_watched', {
      matchId: o.matchId,
      seconds: Math.round((Date.now() - watchStartedAt) / 1000),
      completed: 1,
    });
    watchStartedAt = 0; watchedMatchId = null;
  }
  /*
   * НА ПОСАДОЧНОЙ С КЛИПА КАРТОЧКУ ИТОГА РИСУЕТ ОНА САМА.
   *
   * Здесь стояло `arena || watch`, а `watch.js` на то же событие монтирует
   * свою концовку. Игрок в конце первого боя получал ДВЕ панели разом, обе с
   * кнопкой «СДЕЛАТЬ СВОЁ», — и это единственная точка конверсии всей
   * воронки. Замерено: `#resultbox` и `.overlay-card` одновременно на экране
   * около двенадцати секунд.
   */
  if (ctx?.state.route?.screen === 'arena') {
    result.showInline(ctx);
  }
  /* Бой кончился — сессия знает про новый рейтинг и следующий бой. */
  ctx?.refreshSession().then(() => { if (!ctx.state.match) showIdle(); }).catch(() => {});
}

/** Сессия сменила существо — перерисовать то, что от него зависит. */
export function onSessionChanged() {
  paintDigest();
  if (!ctx?.state.match && ctx?.state.route?.screen === 'arena') showIdle();
}

export function onIdle() {
  watchedMatch = null;
  document.body.classList.remove('fighting');
  paintSides(null);
  if (ctx?.state.route?.screen === 'arena') showIdle();
}

/**
 * Тело бойца не собралось в браузере — сказать это, а не сделать вид.
 *
 * Приёмка на сервере пропустила код, а настоящий рендерер его не принял. Боец
 * при этом дерётся: механика не зависит от картинки. Но на арене он в теле
 * своего архетипа, и молчать об этом — то же самое, что молча подменить
 * модель: игрок видит не своё существо и считает, что мы его не услышали.
 *
 * Строка встаёт рядом с этим бойцом и живёт до конца матча. Ни модалки, ни
 * паузы: бой идёт, и прерывать его ради плохой новости о картинке — хуже
 * самой новости.
 */
const brokenBodies = new Set();
export function onBodyFail({ side } = {}) {
  if (side) brokenBodies.add(side);
  paintSides();
}

// ── метка тренировочного соперника ─────────────────────────────────────────

/**
 * §7.3 и N4 вместе: соперник настоящий и играет в полную силу, но он ЯВНО
 * помечен тренировочным. Запрещена постановка, а не слабость — а постановкой
 * слабый соперник становится ровно в тот момент, когда о нём молчат.
 */
function paintSides(m = watchedMatch) {
  /*
   * ПРИНАДЛЕЖНОСТЬ СЧИТАЕТ СЕРВЕР (D162), поле `mine` в сообщении `match`.
   *
   * Здесь стояло собственное сравнение `m.ids[key] !== session.creature.id`, и
   * оно было вторым источником правды: у сокета уже лежит id существа, по
   * которому и подобрана трансляция. Второй источник расходится с первым
   * ровно в тот момент, когда игрок сменил существо посреди боя, — а это
   * ровно тот момент, когда правильный ответ важнее всего.
   *
   * Запасной вариант оставлен на случай старого сервера: если поля нет,
   * считаем по-старому, а не показываем «ничьё».
   */
  /* Поле есть — значит сервер ответил, и null в нём означает «бой не твой».
     `??` срабатывал и на этом законном null, то есть запасной путь, объявленный
     «на случай старого сервера», исполнялся на КАЖДОМ чужом бою. Проверяем
     наличие ПОЛЯ, а не истинность значения. */
  const mineSide = m
    ? ('mine' in m ? m.mine
      : (m.ids && ctx?.state.session?.creature
        ? (m.ids.octopus === ctx.state.session.creature.id ? 'octopus'
          : (m.ids.gorilla === ctx.state.session.creature.id ? 'gorilla' : null))
        : null))
    : null;

  for (const [side, key] of [['oct', 'octopus'], ['gor', 'gorilla']]) {
    const tag = document.querySelector(`.sidetag[data-side="${side}"]`);
    if (!tag) continue;
    clear(tag);
    if (!m) continue;
    if (brokenBodies.has(key)) {
      tag.appendChild(h('div.note', 'тело не нарисовалось — боец в теле архетипа'));
    }
    /* «ТВОЁ» — первым, до модели и до тренировочной метки: на вопрос «которое
       из двух моё» игрок отвечает раньше, чем на все остальные. */
    if (mineSide === key) tag.appendChild(h('span.badge.own', 'ТВОЁ'));
    else if (m.following === key) tag.appendChild(h('span.badge', 'СЛЕДИШЬ'));
    const meta = m.meta?.[key];
    if (m.training && mineSide && mineSide !== key) {
      tag.appendChild(h('span.badge.warn', 'ТРЕНИРОВОЧНЫЙ'));
      tag.appendChild(h('span.note', 'спарринг-партнёр из библиотеки, не игрок'));
    } else if (meta?.model) {
      tag.appendChild(h('span.note', meta.model));
    }
  }

  paintWhose(m, mineSide);
}

/**
 * Одна строка под часами: чей это бой.
 *
 * Три состояния, и все три обязаны быть РАЗНЫМИ словами:
 *   свой      — «твой бой», и точка отсчёта дальше — имя существа на плите;
 *   чужой у владельца — он смотрит арену, пока его существо отдыхает;
 *   гость     — у него существа нет вовсе, и это единственное состояние,
 *               в котором уместно звать сделать своё.
 *
 * Точка перед словами — того цвета, которого сторона игрока. Она связывает
 * строку с плитой и с фигурами на полу одним движением глаза; без неё
 * «твой бой» пришлось бы объяснять словами «ты оранжевый».
 */
function paintWhose(m, mineSide) {
  const el = $('#whose');
  if (!el) return;
  clear(el);
  el.className = 'whose';
  if (!m) return;
  if (mineSide) {
    el.classList.add('mine');
    el.appendChild(h('i.dot', {
      style: { background: mineSide === 'gorilla' ? 'var(--gor)' : 'var(--oct)' },
    }));
    el.appendChild(document.createTextNode('твой бой'));
    return;
  }
  el.classList.add('other');
  el.appendChild(document.createTextNode(
    ctx?.state.session?.creature
      ? 'чужой бой — твоё существо отдыхает'
      : (m.following
        /* Гость выбрал стартера из библиотеки: он за ним следит, но существо
           общее и не его. Сказать «твой бой» здесь значило бы соврать ровно
           тому, кому надо показать, что своего у него ещё нет. */
        /* Коротко: строка стоит между часами и подписью авторства, и любая
           лишняя половина уезжает под чипы набора на 1280 и уже. */
        ? 'следишь за библиотечным — своего пока нет'
        : 'чужой бой — смотришь чужие существа')));
}

// ── дайджест «пока тебя не было» ───────────────────────────────────────────

/**
 * A17: три строки под `// ПОКА ТЕБЯ НЕ БЫЛО` держатся ВНЕ ленты. Внутри неё
 * они исчезают за четыре секунды плотного боя — то есть ровно тогда, когда
 * игрок их читает.
 */
function paintDigest() {
  const box = $('#digest');
  if (!box) return;
  clear(box);
  const s = ctx?.state.session?.since;
  if (!s || !s.fights) return;
  const wr = s.fights ? Math.round((s.wins / s.fights) * 100) : 0;
  /*
   * ВЕРНУВШЕМУСЯ НАДО ДАТЬ НЕ СЧЁТЧИКИ, А БОЙ.
   *
   * Сервер считает `highlightMatchId` — бой с самым крупным сдвигом рейтинга,
   * то есть тот, где что-то случилось, — и это поле не читалось НИГДЕ.
   * Человек, вернувшийся через неделю, получал три строки цифр («10 080 боёв ·
   * 52% побед · рейтинг −12») и ни одной кнопки, чтобы хоть что-то
   * посмотреть. При бое раз в минуту вечно счётчик — единственное, что растёт,
   * и единственное, что показывали.
   */
  box.appendChild(h('div.box',
    h('div.hd', 'пока тебя не было'),
    h('div.ln', `${num(s.fights)} боёв · ${wr}% побед`),
    h('div.ln', `рейтинг ${s.ratingDrift >= 0 ? '+' : '−'}${Math.abs(Math.round(s.ratingDrift))}`),
    h('div.ln', `${s.adaptations} ${s.adaptations === 1 ? 'улучшение принято' : 'улучшений принято'}`),
    s.highlightMatchId
      ? h('button.btn.ghost', {
        style: { marginTop: '10px' },
        onclick: () => { location.hash = `#/watch/${s.highlightMatchId}`; },
      }, 'ПОСМОТРЕТЬ САМЫЙ КРУПНЫЙ БОЙ')
      : null));
}

/**
 * Три библиотечных существа на выбор (F7, D2).
 *
 * «Взять» для гостя значит СМОТРЕТЬ ЗА НИМ: библиотечное существо общее, оно
 * не переходит в собственность — иначе гостевые аккаунты, которые заводятся
 * бесконечно, растащили бы библиотеку. Сокету отправляется `watch`, и арена
 * начинает показывать бои выбранного.
 *
 * Выбор запоминается в браузере: гость, вернувшийся через час, продолжает
 * смотреть за тем, кого выбрал, а не выбирает заново.
 */
export async function pickStarter(box, ctx) {
  let list;
  try { list = await get('/api/starters'); } catch { list = null; }
  if (!list || !list.length) {
    mount(box, h('div.t-sub', 'библиотека пока пуста — просто смотри бой'));
    return;
  }
  clear(box);
  for (const c of list) {
    const kit = (c.kit || []).map((k) => describeShort(k)).join(' · ');
    box.appendChild(h('div.card', {
      onclick: () => {
        /* Выбор переживает возврат на арену: без этого при каждом заходе
           гостю снова предлагали выбрать, будто он ничего не выбирал. */
        try { localStorage.setItem('airena.starter', c.id); } catch { /* приватный режим */ }
        try { window.__airenaSend?.({ cmd: 'watch', creatureId: c.id }); } catch { /* сокета нет */ }
        ctx.go(`/creature/${c.id}`);
      },
    },
    h('div.hd', c.name),
    h('div.why', c.archetype === 'gorilla' ? 'тяжёлое, ближний бой' : 'лёгкое, дальний бой'),
    /* Подпись набора называет и доставку, и то, что она делает. Раньше здесь
       стояли одни доставки — «снаряд · конус · на себя», — и два разных
       существа с похожими доставками выглядели одинаково, хотя одно жгло, а
       второе лечилось. Ось, которую игрок выбирает, обязана быть на карточке. */
    kit ? h('div.say', kit) : null,
    /*
     * Набор, которым существо НЕ дерётся, обещать нельзя.
     *
     * Карточка собирала строку из `c.kit`, не глядя на `c.kitActive`. У
     * существа со старым мозгом набор настоящий, но в бой не идёт — мозг о нём
     * не знает. Страница существа это предупреждение показывает, а выбор
     * гость делает раньше и без него.
     */
    c.kitActive === false
      ? h('div.t-sub', { style: { color: 'var(--gor)' } },
        'мозг написан до появления умений — дерётся базовыми')
      : null,
    h('div.t-sub', { style: { marginTop: '6px' } },
      c.winrate === null ? 'ещё не дралось' : `выигрывает ${c.winrate}% боёв`)));
  }
}

/** Короткая подпись умения без обращения к грамматике: доставка и эффекты. */
const DELIV_SHORT = {
  beam: 'луч', cone: 'конус', bolt: 'снаряд', lob: 'навес',
  zone: 'зона', dash: 'рывок', blink: 'мигание', self: 'на себя',
  jump: 'прыжок',
};
const EFF_SHORT = {
  damage: 'урон', burn: 'горение', knock: 'отброс', pull: 'притяжение',
  stun: 'оглушение', root: 'обездвиживание', shield: 'щит', heal: 'лечение',
  cleanse: 'очищение', blind: 'ослепление', silence: 'немота', wall: 'стена',
  boost: 'усиление', weaken: 'ослабление',
};
const describeShort = (k) => {
  const d = DELIV_SHORT[k.delivery] || k.delivery;
  const e = (k.effects || []).map((x) => EFF_SHORT[x] || x).join('+');
  return e ? `${d}: ${e}` : d;
};
