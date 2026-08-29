/**
 * Дев-панель вьювера: исходник эталонного мозга по клику на имя.
 *
 * Живёт ОТДЕЛЬНО от main.js и грузится только дев-вьювером
 * (`src/viewer/index.html`, `npm run viewer`). В продуктовом клиенте её нет
 * ни строкой — F11 закрывает исходник мозга игрока, а панель, которая
 * закрыта только отсутствием атрибута в разметке, не закрыта.
 *
 * Читаемыми остаются ровно шесть эталонных мозгов репозитория и `stub`:
 * это научный артефакт docs/EXPERIMENT.md, а не конкурентная поверхность.
 * Сервер это и проверяет — `/api/source/` отвечает только на них.
 */

const $ = (s) => document.querySelector(s);

for (const el of document.querySelectorAll('.name[data-fighter]')) {
  el.onclick = async () => {
    const id = el.dataset.fighter;
    const sel = $(id === 'octopus' ? '#sel-oct' : '#sel-gor');
    const tag = sel ? sel.value : '';
    const box = $('#code');
    if (!box) return;
    box.querySelector('h2').textContent = `${id} · ${tag}`;
    box.querySelector('.meta').textContent = '';
    box.querySelector('pre').textContent = 'loading…';
    box.classList.add('on');
    try {
      const res = await fetch(`/api/source/${tag}/${id}`);
      box.querySelector('pre').textContent = res.ok
        ? await res.text()
        : 'этот мозг закрыт: читаемы только шесть эталонных и stub';
    } catch (err) {
      box.querySelector('pre').textContent = String(err);
    }
  };
}
const close = $('#code-close');
if (close) close.onclick = () => $('#code').classList.remove('on');
