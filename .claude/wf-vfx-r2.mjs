export const meta = {
  name: 'vfx-polish-r2',
  description: 'Second round: fix exactly what the judges named, per element, then re-judge',
  phases: [
    { title: 'Круг 2', detail: 'по агенту на слабую стихию: чинит названное судьёй' },
    { title: 'Пересуд', detail: 'тот же критерий, новые кадры' },
  ],
};

const BRIEF_PATH = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/481cc3fa-4508-484d-be0d-a7ab7ea08a68/scratchpad/brief.md';
const PORT = 56650;
/*
 * ВЕРДИКТЫ ПЕРВОГО КРУГА ЛЕЖАТ ФАЙЛОМ, А НЕ В АРГУМЕНТАХ. Их 22 КБ: гнать
 * такое через `args` — это гнать через окно разговора то, что у агента и так
 * под рукой на диске. Агент читает свой раздел сам, файл один для всех.
 */
const JUDGES_FILE = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/481cc3fa-4508-484d-be0d-a7ab7ea08a68/scratchpad/judges-r1.json';

/* Только те, кому судья поставил ниже 78: круг 2 — про названные дефекты, а
   не про новый заход по всему слою. Файл модуля и его особые условия рядом. */
const TARGETS = [
  { el: 'laser', file: 'src/viewer/vfx/laser.js', kinds: 'beam,bolt,impact,status,charge' },
  { el: 'acid', file: 'src/viewer/vfx/acid.js', kinds: 'zone,cone,bolt,lob,impact,status' },
  { el: 'radiation', file: 'src/viewer/vfx/radiation.js', kinds: 'zone,cone,lob,impact,status' },
  { el: 'void', file: 'src/viewer/vfx/void.js', kinds: 'zone,cone,bolt,self,beam' },
  { el: 'kinetic', file: 'src/viewer/vfx/kinetic.js', kinds: 'zone,cone,bolt,self,beam' },
  { el: 'ember', file: 'src/viewer/vfx/fire.js', kinds: 'zone,cone,bolt,self' },
  { el: 'gravity', file: 'src/viewer/vfx/gravity.js', kinds: 'zone,self,lob,impact' },
];

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['element', 'addressed', 'declined', 'measured', 'gate_green', 'frames'],
  properties: {
    element: { type: 'string' },
    addressed: {
      type: 'array',
      description: 'по пункту судьи: что сделано и чем доказано',
      items: {
        type: 'object', additionalProperties: false,
        required: ['point', 'fix', 'evidence'],
        properties: { point: { type: 'string' }, fix: { type: 'string' }, evidence: { type: 'string' } },
      },
    },
    declined: { type: 'array', items: { type: 'string' }, description: 'что НЕ сделано и почему (чужая территория, дороже пользы, судья неправ — с доводом)' },
    measured: { type: 'string' },
    gate_green: { type: 'boolean' },
    frames: { type: 'string', description: 'КАНОНИЧЕСКИЙ каталог итоговых кадров — по нему будут судить' },
  },
};

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['element', 'score', 'clutter', 'beauty', 'distinctness', 'worst', 'must_fix'],
  properties: {
    element: { type: 'string' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    clutter: { type: 'integer', minimum: 0, maximum: 100 },
    beauty: { type: 'integer', minimum: 0, maximum: 100 },
    distinctness: { type: 'integer', minimum: 0, maximum: 100 },
    worst: { type: 'string' },
    must_fix: { type: 'array', items: { type: 'string' } },
  },
};

const shared = `ЧТО ВЕДУЩИЙ УЖЕ ПОЧИНИЛ В ОБЩЕМ СЛОЕ ПОСЛЕ ПЕРВОГО КРУГА — не делай заново:
- «kit.js», ветка следа «acid»: шум прижат к краю (было разлито по всей площади,
  отсюда лишайник вместо лужи) — теперь середина пятна сплошная;
- «kit.js», ветка «laser»: середина метки уведена из синевато-белого в тёплое;
- «kit.js», ветка «grav»: кольца ползут К ЦЕНТРУ, а не наружу;
- «kit.js»: жар метки («scorch», «arc», «laser») остывает за 0.55 своей жизни, а
  не за глухие 6 / 2.5 / 1.5 с;
- «kit.burst» научился опозданию («at»), так что ручка «gap» у мигания работает;
- «vfx.js»: жест эффекта («effectMark») рисуется поверх элементного статуса —
  кольцо оглушения, скобы обездвиживания, штрихи ослепления, планка немоты,
  шевроны усиления и ослабления; штатный «status» больше не дублирует модуль;
- «vfx.js» + «core/deliver.js»: запись зоны несёт свои атомы, и зона с «pull»
  получает штрихи, летящие к центру («zonePull»);
- «fire.js»: из стопки следов зоны убрана воронка (три слоя в одной точке давали
  почти непрозрачное чёрное пятно).`;

phase('Круг 2')
const fixed = await parallel(TARGETS.map((t) => {
  return () => agent(
    `Ты доводишь модуль эффектов до приёмки. Репозиторий /Users/boozybats/Public/Repos/work/Airena.
ПЕРВЫМ ДЕЛОМ прочитай ${BRIEF_PATH} — это заказ основателя и границы работы.

ТВОЙ МОДУЛЬ: ${t.file} — стихия «${t.el}».

НЕЗАВИСИМЫЙ СУДЬЯ ПЕРВОГО КРУГА ОЦЕНИЛ ТВОЮ СТИХИЮ, И ЕГО ВЕРДИКТ — ТВОЁ ЗАДАНИЕ.
Прочитай ${JUDGES_FILE} и возьми оттуда раздел "${t.el}": там оценка (общая,
захламление, красота, отличимость), поле "worst" — худшее, что он увидел, — и
список "must_fix". Порог приёмки — 75. Твоя задача одна: закрыть названное.

${shared}

ПОРЯДОК РАБОТЫ
1. Прочитай модуль и кадры, на которые ссылается судья (Read на .png — смотри
   глазами, а не по имени файла).
2. По КАЖДОМУ пункту реши: чиню или отказываюсь. Отказ — законный ход, но он
   обязан нести довод, а не отговорку; судья мог ошибиться, и тогда так и
   напиши, приложив замер.
3. Чини. Правь ТОЛЬКО свой модуль (общий слой — территория ведущего; нужна
   правка там — пиши в «declined», ведущий сделает).
   Комментарии по-русски, в голосе файла: объясняй ПОЧЕМУ и приводи замер.
4. Сними кадры под замком GPU (параллельно работают другие агенты):
   tools/vfxshot-lock.sh --port=${PORT} --el=${t.el} --kind=${t.kinds} \\
     --cams=broadcast,top --moments=0.4,1.5,2.6,4.0 --out=$PWD/reports/vfx/r2-${t.el}
   МОМЕНТ 2.6 ОБЯЗАТЕЛЕН: судьи первого круга не смогли подтвердить плавность
   ухода, потому что между 1.5 и 4.0 не было ни одного кадра.
   Каталог r2-${t.el} — КАНОНИЧЕСКИЙ: по нему будут судить, и промежуточные
   прогоны складывай отдельно, чтобы судью не отправили в выброшенное.
5. node tools/checkdecay.mjs — должен остаться зелёным; node --check на файл.

Верни отчёт по схеме. В «evidence» — числа и имена кадров, а не оценки.`,
    { label: `круг2:${t.el}`, phase: 'Круг 2', schema: FIX_SCHEMA },
  );
}));

log(`круг 2: правок ${fixed.filter(Boolean).length} из ${TARGETS.length}`)

phase('Пересуд')
const judged = await parallel(TARGETS.map((t, i) => () => agent(
  `Ты независимый судья визуала, и ты судишь ВТОРОЙ круг. Репозиторий
/Users/boozybats/Public/Repos/work/Airena. Прочитай ${BRIEF_PATH} — это ТЗ, и
другого критерия нет.

Стихия «${t.el}». Кадры — reports/vfx/r2-${t.el} (моменты 0.4 / 1.5 / 2.6 / 4.0,
ракурсы broadcast и top). Если каталога нет — скажи об этом прямо и суди по
reports/vfx/p2-${t.el}, отметив подмену в «worst».

Смотри кадры ГЛАЗАМИ (Read на .png), не меньше восьми, оба ракурса, все четыре
момента. Контактный лист:
  node tools/vfxsheet.mjs --in=reports/vfx/r2-${t.el} --kind=zone --cam=top --out=reports/vfx/sheets/r2j-${t.el}.png

Что первый круг поставил и что назвал — в ${JUDGES_FILE}, раздел "${t.el}".
Прочитай его ДО того, как смотреть кадры: тебе надо проверить, закрыты ли
именно эти пункты, а не составить новый список с нуля.

Строитель отчитался так (его слова, не факт — проверяй по кадрам):
${JSON.stringify(fixed[i] || 'отчёта нет').slice(0, 4000)}

Три оценки по 100 и общая:
  clutter      — «эффект произошёл, и его нет; не резко, а с плавным
                 затуханием; никакого мусора и визуального шума».
  beauty       — красиво ли это на настоящей боевой сцене с трансляции.
  distinctness — видно ли ИЗ ВИЗУАЛА, что делает умение, и не путается ли род
                 вещества с чужой стихией.
Общая — твой вердикт. Ниже 75 обязано называть КОНКРЕТНЫЙ КАДР или ЧИСЛО.
Не занижай из осторожности и не завышай из вежливости; не подыгрывай
строителю и не наказывай его за первый круг.

Ты судья: НИЧЕГО не правь в репозитории.`,
  { label: `пересуд:${t.el}`, phase: 'Пересуд', schema: JUDGE_SCHEMA },
)));

const rows = judged.filter(Boolean);
const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
log(`круг 2: средняя ${avg}, худшая ${rows.length ? Math.min(...rows.map((r) => r.score)) : 0}`)
return { avg, judged: rows, fixed: fixed.filter(Boolean) };
