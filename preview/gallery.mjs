/**
 * Витрина всех сгенерированных тел — чтобы смотреть глазами, а не по логам.
 *
 * Слаг кодирует условия прогона, и это единственный способ понять, что с чем
 * сравнивать: ab-*-blind = слепой ремонт, ab-*-sighted = зрячий,
 * v2/v3 = починенный аудит, v4 = плюс брифинг о камере в инструкции стиля.
 */
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const AIRENA = '/Users/boozybats/Public/Repos/work/Airena';
const SHOTS = '/Users/boozybats/Public/Repos/work/Autoage/captures/forge';

/**
 * Что именно меняли в этом прогоне.
 *
 * Слаг — единственная запись об условиях эксперимента: `.json` рядом хранит
 * модель и цену, но не то, ЧЕМ этот прогон отличался от соседнего. Держим
 * расшифровку здесь, чтобы витрину можно было читать как журнал опытов, а не
 * как список файлов.
 *
 * Порядок важен: правила проверяются сверху вниз, первое совпадение выигрывает.
 */
const EXPERIMENTS = [
  [/^ni-/,        'БЕЗ картинок',        'референсные фото выключены, ремонт только при падении'],
  [/^rp-/,        'переоценка',          'домашний стиль, 1 проход, ремонт только при падении — НО с картинками'],
  [/^one-oct/,    'один проход',         'просим всё сразу, ремонтов ноль — лучший результат дня'],
  [/^cap1200/,    'потолок 1200 частей', 'добавлен раздел THE CEILING — ограничение числа деталей'],
  [/^lean1/,      'рез плотности',       'вырезан блок «parts that are MANY stay many»'],
  [/^built-oct/,  'сборка по плану',     'план отдельным вызовом, раздумья выключены'],
  [/^frame-son/,  'каркас + потолок',    'только каркас, жёсткий лимит токенов и раздумий'],
  [/^frame-/,     'каркас',              'просим только несущий каркас, цель объявлена'],
  [/^m-opu/,      'домашний стиль',      '3 прохода, полный аудит с ремонтами'],
  [/blind/,       'ремонт ВСЛЕПУЮ',      'модель не видит своё прошлое тело — старый протокол'],
  [/sighted/,     'ремонт С ПОКАЗОМ',    'модель видит своё прошлое тело — новый протокол'],
  [/^v2-/,        'аудит починен',       'ложный акцент и решётка ловятся, камера в замере'],
  [/^v3-/,        'правило камеры',      'плюс greebles-not-facing-camera'],
  [/^v4-/,        'брифинг о камере',    'плюс рассказ модели, где стоит камера боя'],
];
const LABEL = (slug) => {
  for (const [re, name, note] of EXPERIMENTS) if (re.test(slug)) return [name, note];
  return ['—', ''];
};
const MODEL = (s) => s.includes('-opu') || s.includes('opus') ? 'Opus'
  : s.includes('-hai') ? 'Haiku' : s.includes('-son') ? 'Sonnet' : '?';

export function gallery() {
  const slugs = readdirSync(join(AIRENA, 'forge'))
    .filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
  const cards = slugs.map((s) => {
    const rec = join(AIRENA, 'forge', `${s}.json`);
    let cost = '—', tries = '—', open = 0, style = 'raw';
    if (existsSync(rec)) {
      const d = JSON.parse(readFileSync(rec, 'utf8'));
      const c = (d.usage || {}).costUsd;
      cost = typeof c === 'number' ? `$${c.toFixed(2)}` : '—';
      tries = d.attempts ?? '—';
      open = (d.unresolved || []).length;
      style = d.style ?? 'raw';
    }
    const [mode, note] = LABEL(s);
    /*
     * Снимок мог устареть: тело перегенерировали, а картинка осталась от
     * прошлого прогона. Так витрина показывала белого осьминога рядом с ценой
     * зелёного — разные существа под одним слагом. Сверяем время.
     */
    const shotPath = join(SHOTS, s, '1-three-quarter.png');
    const hasShot = existsSync(shotPath);
    const stale = hasShot
      && statSync(join(AIRENA, 'forge', `${s}.js`)).mtimeMs > statSync(shotPath).mtimeMs;
    return `<figure class="c">
      ${!hasShot ? '<div class="no">рендер ещё не готов</div>'
        : stale ? '<div class="no stale">снимок устарел — тело пересобрано, ждёт рендера</div>'
        : `<img loading="lazy" src="/shot/${s}/1-three-quarter.png" alt="">`}
      <figcaption>
        <b>${s}</b>
        <span class="t">${MODEL(s)} · <b class="exp">${mode}</b></span>
        ${note ? `<span class="note">${note}</span>` : ''}
        <span class="n">${cost} · ${tries} запрос(а) · открыто претензий: ${open}</span>
        <span class="${style === 'machine' ? 'ok' : 'warn'}">стиль: ${
          style === 'machine' ? 'machine — домашний' : 'raw — БЕЗ домашнего стиля'}</span>
        <a href="http://localhost:5174/forge.html?creature=${s}" target="_blank">покрутить в студии →</a>
      </figcaption></figure>`;
  }).join('');
  /* Журнал опытов таблицей: по нему видно всю серию разом, а карточки ниже —
     для того, чтобы смотреть глазами. Сортировка по цене: дешёвые сверху,
     потому что вопрос всей серии был «сколько это стоит». */
  const rows = slugs.map((s) => {
    const rec = join(AIRENA, 'forge', `${s}.json`);
    let cost = null, tries = '—', meshes = null;
    if (existsSync(rec)) {
      const d = JSON.parse(readFileSync(rec, 'utf8'));
      const c = (d.usage || {}).costUsd;
      cost = typeof c === 'number' ? c : null;
      tries = d.attempts ?? '—';
    }
    const [mode, note] = LABEL(s);
    return { s, mode, note, cost, tries, model: MODEL(s) };
  }).sort((a, b) => (a.cost ?? 1e9) - (b.cost ?? 1e9));

  const table = `<div class="log"><table>
    <thead><tr><th>что меняли</th><th>тело</th><th>модель</th>
      <th class="r">запросов</th><th class="r">цена</th></tr></thead><tbody>` +
    rows.map((r) => `<tr>
      <td><b>${r.mode}</b>${r.note ? `<span class="n2">${r.note}</span>` : ''}</td>
      <td><a href="http://localhost:5174/forge.html?creature=${r.s}" target="_blank">${r.s}</a></td>
      <td class="mu">${r.model}</td>
      <td class="r">${r.tries}</td>
      <td class="r mono">${r.cost === null ? '—' : '$' + r.cost.toFixed(2)}</td>
    </tr>`).join('') + '</tbody></table></div>';

  return `<!doctype html><meta charset="utf-8"><title>Airena — тела</title>
<style>
 body{margin:0;background:#12141a;color:#e6e8ee;font:14px/1.5 -apple-system,system-ui,sans-serif}
 h1{padding:20px 24px 0;margin:0;font-size:19px}
 p.s{padding:4px 24px 16px;margin:0;color:#8b93a7}
 .g{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:14px;padding:0 24px 40px}
 .c{margin:0;background:#1a1d26;border:1px solid #262b38;border-radius:8px;overflow:hidden}
 .c img{width:100%;display:block;background:#0c0e13;aspect-ratio:16/10;object-fit:cover}
 .no{aspect-ratio:16/10;display:grid;place-items:center;color:#5c6478;background:#0c0e13;font-size:12px;text-align:center;padding:0 20px}
 .no.stale{color:#d98a3a;background:#1d1710}
 figcaption{padding:10px 12px;display:flex;flex-direction:column;gap:3px}
 figcaption b{font-family:ui-monospace,monospace;font-size:12.5px}
 .t{color:#9aa3b8;font-size:12px}
 .exp{color:#c9d4ea}
 .note{color:#6f7891;font-size:11px;line-height:1.4}
 .n{color:#6f7891;font-family:ui-monospace,monospace;font-size:11px}
 .ok{font-size:11px;color:#6fbf8a}
 .warn{font-size:11px;color:#d98a3a}
 .log{margin:0 24px 28px;border:1px solid #262b38;border-radius:8px;overflow-x:auto;background:#1a1d26}
 .log table{width:100%;border-collapse:collapse;font-size:12.5px}
 .log th{text-align:left;padding:9px 12px;border-bottom:1px solid #262b38;color:#7b8398;
   font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
 .log td{padding:9px 12px;border-bottom:1px solid #21262f;vertical-align:top}
 .log tr:last-child td{border-bottom:0}
 .log .r{text-align:right}
 .log .mono{font-family:ui-monospace,monospace}
 .log .mu{color:#8b93a7}
 .log .n2{display:block;color:#6f7891;font-size:11px;line-height:1.35;margin-top:2px}
 .h2{padding:0 24px 10px;margin:0;font-size:15px;color:#9aa3b8;font-weight:600}
 a{color:#7fb2ff;text-decoration:none;font-size:12px;margin-top:3px}
 a:hover{text-decoration:underline}
</style>
<h1>Тела, сгенерированные за ночь — ${slugs.length} шт</h1>
<p class="s">Слаг кодирует условия. <b>ab-…-blind</b> — старый слепой ремонт, <b>ab-…-sighted</b> — зрячий.
<b>v2/v3</b> — плюс починенный аудит, <b>v4</b> — плюс брифинг о камере, <b>m-</b> — с домашним стилем.
<br><b style="color:#d98a3a">Важно:</b> всё, кроме <b>m-</b>, сгенерировано с <b>--style=raw</b> —
то есть без домашнего стиля и без референсных фотографий. Отсюда зелёные шары вместо роботов.
Показан ракурс «три четверти»; в студии можно покрутить и посмотреть верх — именно он в бою под камерой.</p>
${table}
<h2 class="h2">Как они выглядят</h2>
<div class="g">${cards}</div>`;
}
