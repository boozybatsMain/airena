export const meta = {
  name: 'vfx-judge',
  description: 'Independent judges score the game visuals and mechanics against the founder brief, 0-100',
  phases: [
    { title: 'Судьи', detail: 'независимые оценки по кадрам и замерам' },
  ],
};

/*
 * Волна судей. Каждый смотрит СВОЙ угол, но оценку ставит ОБЩУЮ, за всё ТЗ:
 * иначе получается десять узких оценок, среднее которых не отвечает на вопрос
 * основателя «насколько это соответствует заказу».
 */
const ANGLES = [
  { key: 'clutter', ask: 'ЗАХЛАМЛЕНИЕ И ЗАТУХАНИЕ. Смотри поздние моменты (t=4 с и позже): что осталось на арене после того, как эффект кончился, и уходит ли оно плавно или щелчком. Числа замера доли арены — в метриках.' },
  { key: 'beauty-zone', ask: 'КРАСОТА ЗОН И ОБОЛОЧЕК на трансляционной дистанции. Смотри kind=zone и kind=self всех десяти стихий.' },
  { key: 'beauty-ranged', ask: 'КРАСОТА ДАЛЬНИХ ФОРМ: луч, болт, навес. Смотри kind=beam,bolt,lob.' },
  { key: 'distinct-element', ask: 'РАЗЛИЧИМОСТЬ СТИХИЙ. Можно ли по кадру, не читая подписи, сказать, какая это стихия, и не путается ли род вещества (лужа кислоты против заливки радиации, дыра пустоты против краски, кинетика против жидкости).' },
  { key: 'distinct-atom', ask: 'ФУНКЦИЯ СОВПАДАЕТ С ВИЗУАЛОМ. Смотри кадры подписей ударов (файлы вида <стихия>-impact.<атом>-…) и носителей статуса (<стихия>-status.<эффект>-…): видно ли ИЗ КАРТИНКИ, что делает атом — оглушение это или обездвиживание, ослепление или немота, — и отличаются ли они друг от друга.' },
  { key: 'fight', ask: 'НАСТОЯЩИЙ БОЙ. Смотри кадры повтора боя (каталог с кадрами боя в метриках): как это выглядит в движении и в толпе эффектов, не сливается ли, видно ли бойцов.' },
  { key: 'contact', ask: 'КРАСОТА КОНТАКТНЫХ ФОРМ: конус, рывок, прыжок, стена. Смотри kind=cone,dash,jump,wall.' },
  { key: 'skills', ask: 'ТЕХНИЧЕСКАЯ ЧАСТЬ ГЕНЕРАЦИИ. Смотри таблицу существ в метриках: попала ли стихия в набор по описанию, законны ли наборы, есть ли чем закончить бой, применялись ли умения в реальных боях. Кадры тоже посмотри, но твой угол — техника.' },
];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['angle', 'score', 'sub', 'evidence', 'must_fix', 'verdict'],
  properties: {
    angle: { type: 'string' },
    score: { type: 'integer', minimum: 0, maximum: 100, description: 'насколько ВСЁ ТЗ выполнено, по твоему углу зрения' },
    sub: {
      type: 'object',
      additionalProperties: false,
      required: ['clutter', 'beauty', 'distinctness', 'technical'],
      properties: {
        clutter: { type: 'integer', minimum: 0, maximum: 100 },
        beauty: { type: 'integer', minimum: 0, maximum: 100 },
        distinctness: { type: 'integer', minimum: 0, maximum: 100 },
        technical: { type: 'integer', minimum: 0, maximum: 100 },
      },
    },
    evidence: { type: 'array', items: { type: 'string' }, description: 'конкретные файлы кадров и числа, на которых стоит оценка' },
    must_fix: { type: 'array', items: { type: 'string' }, description: 'что мешает поставить выше; пусто, если ничего' },
    verdict: { type: 'string' },
  },
};

/* Заказ и замеры лежат файлами: у агента есть диск, а окно разговора — нет
   места для двадцати килобайт, которые он и так прочитает сам. */
const BRIEF_FILE = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/481cc3fa-4508-484d-be0d-a7ab7ea08a68/scratchpad/brief.md';
const METRICS_FILE = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/481cc3fa-4508-484d-be0d-a7ab7ea08a68/scratchpad/metrics.md';
const ROUND = args && args.round ? String(args.round) : '1';

phase('Судьи')
const scores = await parallel(ANGLES.map((a) => () => agent(
  `Ты независимый судья. Репозиторий /Users/boozybats/Public/Repos/work/Airena.

ТЗ, по которому судишь, — заказ основателя дословно: прочитай ${BRIEF_FILE}.
Другого критерия нет. Не суди по «как принято в играх» — суди по этому тексту.

ТВОЙ УГОЛ: ${a.ask}

ЗАМЕРЫ И ГДЕ ЛЕЖАТ КАДРЫ: прочитай ${METRICS_FILE}. Там числа гейтов, каталоги
кадров по формам, атомам и статусам, кадры настоящего боя и таблица существ.

КАК СМОТРЕТЬ
- Кадры смотри ГЛАЗАМИ: Read на .png. Не меньше десяти кадров, оба ракурса,
  все моменты. Оценка, поставленная без единого открытого кадра, — брак.
- Контактный лист собирается так (быстрее, чем по одному):
  node tools/vfxsheet.mjs --in=<каталог> --kind=<форма> --cam=top --out=reports/vfx/sheets/j${ROUND}-<что>.png
- Числа проверяй сам, если сомневаешься: node tools/checkdecay.mjs,
  node tools/vfxclean.mjs --in=<каталог> --at=4.00
- Ты СУДЬЯ: ничего не правь в репозитории. Не запускай съёмку — GPU занят.

КАК СТАВИТЬ ОЦЕНКУ
- 100 — ТЗ выполнено полностью и придраться не к чему.
- 75 — выполнено; остались придирки, ни одна из которых не про суть заказа.
- 50 — половина заказа не выполнена.
- Ниже 75 обязано называть КОНКРЕТНЫЙ КАДР или ЧИСЛО. «Могло бы быть лучше» —
  это не оценка.
- Не занижай из осторожности и не завышай из вежливости. Твоя оценка — это
  ответ на вопрос «сделано ли то, что просил основатель», а не рейтинг игры
  против чужих ААА-проектов.

Верни отчёт по схеме.`,
  { label: `судья:${a.key}`, phase: 'Судьи', schema: SCHEMA },
)));

const rows = scores.filter(Boolean);
const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
const min = rows.length ? Math.min(...rows.map((r) => r.score)) : 0;
log(`средняя ${avg}, худшая ${min}, судей ${rows.length}`)
return { avg, min, rows };
