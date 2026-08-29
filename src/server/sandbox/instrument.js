/**
 * Учёт топлива — третья из четырёх стен A1.
 *
 * A1 дословно: «учёт топлива ПО ИНСТРУКЦИЯМ, а не по стенным часам». Разница
 * не в педантизме. Таймер по часам недетерминирован: один и тот же мозг на
 * загруженной машине думает дольше и обрывается раньше — то есть исход боя
 * начинает зависеть от нагрузки сервера, и A2 (побитовый детерминизм) падает
 * вместе с ним. Счётчик шагов даёт один и тот же обрыв на любой машине.
 *
 * Как считаем: в каждую точку, откуда управление может уйти назад или вглубь,
 * вставляется `__fuel()`. Этого достаточно, потому что бесконечное исполнение
 * без обратной дуги и без вызова невозможно:
 *   — тело каждого цикла (включая do/while и for-in/of);
 *   — вход в каждую функцию;
 *   — каждая ветвь условного выражения и каждый case;
 *   — каждое `return`, чтобы прямой длинный код тоже стоил.
 *
 * Вставка — сплайсом по позициям из AST, без генератора кода: генератор
 * переписал бы исходник целиком, а мозг игрока должен исполняться ровно тем,
 * что прошло анализ, плюс вставки.
 */

import { parse } from 'acorn';

/** Сколько шагов мозгу отпущено на одну мысль. */
export const FUEL_PER_THINK = 200_000;
/** Сколько на один компилирующий проход (объявления верхнего уровня). */
export const FUEL_PER_LOAD = 400_000;

const TICK = '__fuel();';

/**
 * Вставить учёт топлива. Возвращает { code, points } — сколько точек учёта
 * вставлено; ноль точек на непустом мозге означает, что вставлять было
 * некуда, и это подозрительно само по себе.
 */
export function instrument(source) {
  const ast = parse(source, { ecmaVersion: 2022, sourceType: 'script', ranges: true });
  /** Позиции вставки: [индекс, текст]. Собираем, потом сплайсим с конца. */
  const cuts = [];

  const intoBody = (body) => {
    if (!body) return;
    if (body.type === 'BlockStatement') { cuts.push([body.start + 1, TICK]); return; }
    /* Однострочное тело: `while (x) f();` — оборачиваем в блок. */
    cuts.push([body.start, '{' + TICK]);
    cuts.push([body.end, '}']);
  };

  const walk = (node) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
        intoBody(node.body);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        intoBody(node.body);
        break;
      case 'ArrowFunctionExpression':
        if (node.body.type === 'BlockStatement') intoBody(node.body);
        else {
          /* Стрелка-выражение: `(a) => a + 1` → `(a) => (__fuel(), a + 1)`.
             Скобки обязательны — без них запятая съест аргументы вызова. */
          cuts.push([node.body.start, '(__fuel(),']);
          cuts.push([node.body.end, ')']);
        }
        break;
      case 'SwitchCase':
        if (node.consequent.length) cuts.push([node.consequent[0].start, TICK]);
        break;
      case 'ConditionalExpression':
        cuts.push([node.consequent.start, '(__fuel(),']);
        cuts.push([node.consequent.end, ')']);
        cuts.push([node.alternate.start, '(__fuel(),']);
        cuts.push([node.alternate.end, ')']);
        break;
      case 'ReturnStatement':
        /*
         * ОБЯЗАТЕЛЬНО в блоке.
         *
         * `if (!me.alive) return;` при вставке «перед» превращается в
         * `if (!me.alive) __fuel();return;` — и `return` выходит из-под `if`,
         * то есть функция возвращается ВСЕГДА. Замерено: все шесть эталонных
         * мозгов молча переставали действовать, orders 0, faults 0, матч
         * кончался двойным КО от выгорания арены. Ни одной ошибки нигде.
         *
         * Блок вокруг `return` легален везде, где легален сам `return`, и
         * не меняет ни одной ветки.
         */
        cuts.push([node.start, '{' + TICK]);
        cuts.push([node.end, '}']);
        break;
      default: break;
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'range' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c); }
      else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(ast);

  /* С конца — иначе каждая вставка сдвигает все последующие позиции. При
     равных позициях порядок вставок между собой сохраняем стабильным. */
  cuts.sort((a, b) => (b[0] - a[0]) || 0);
  let code = source;
  for (const [at, text] of cuts) code = code.slice(0, at) + text + code.slice(at);

  return { code, points: cuts.length };
}

/** Ошибка исчерпания топлива — отличима от любой ошибки самого мозга. */
export const OUT_OF_FUEL = 'AIRENA_OUT_OF_FUEL';
