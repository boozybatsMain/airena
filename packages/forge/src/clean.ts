/**
 * Getting the function out of the reply.
 *
 * The instruction asks for bare code in one shape. Models mostly comply and
 * reliably do three things anyway, none of which is worth a retry because all
 * three are unambiguous to undo:
 *
 *  - wrap the answer in a ```js fence;
 *  - write `import * as THREE from 'three'` at the top out of habit, even
 *    having been told not to;
 *  - name the function something other than `build`, or export it.
 *
 * So this file is tolerant on the way in and strict on the way out: whatever
 * arrives, what leaves is either a source string that `new Function` can turn
 * into a `(THREE, TSL) => Object3D`, or a named refusal. Being tolerant here is
 * not the same as being tolerant about the *creature* — nothing below looks at,
 * scores, edits or improves the geometry. It finds a function.
 *
 * The `notes` array is the honesty channel. Every repair is recorded and
 * surfaced in the studio's inspector, because a lane whose whole purpose is
 * measuring what models do unaided must not quietly launder what they actually
 * emitted.
 */

export interface ExtractedCode {
  /** Source ready to hand to `new Function('THREE','TSL', src)`. */
  readonly source: string;
  /** The identifier the source expects to be called by. Always `build` after repair. */
  readonly entry: string;
  /** Every liberty taken, in the order taken. Empty means the model complied exactly. */
  readonly notes: readonly string[];
}

export class ForgeFormatError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'ForgeFormatError';
    this.reason = reason;
  }
}

/** ```js … ``` or ``` … ```, taking the largest fenced block if there are several. */
function unfence(text: string, notes: string[]): string {
  const fence = /```[a-zA-Z]*\n([\s\S]*?)```/g;
  let best: string | null = null;
  for (let m = fence.exec(text); m !== null; m = fence.exec(text)) {
    const body = m[1];
    if (best === null || body.length > best.length) best = body;
  }
  if (best !== null) {
    notes.push('stripped a markdown code fence');
    return best;
  }
  /*
   * Незакрытый заборчик.
   *
   * Регулярка выше требует закрывающие три обратные кавычки. Когда ответ
   * обрезали по потолку вывода — а на CLI-полосе потолок в 64 000 токенов
   * считает размышление вместе с кодом и срабатывал регулярно, — открывающая
   * строка остаётся в файле и он перестаёт собираться первой же строкой.
   * Наблюдалось на `ab-son-sighted-3.js`: файл начинался с ```javascript.
   *
   * Обрыв мы лечим потолком, но заборчик надо снимать в любом случае: тело
   * под ним целое, а из-за трёх символов пропадает вся генерация.
   */
  const opening = /^\s*```[a-zA-Z]*\n/;
  if (opening.test(text)) {
    notes.push('stripped an unterminated markdown code fence');
    return text.replace(opening, '');
  }
  return text;
}

/**
 * Import statements are removed rather than rejected.
 *
 * They cannot work — the source is evaluated as a function body, not a module —
 * and a model that writes one has still written the creature underneath it. The
 * bindings it wanted (`THREE`, `TSL`) are the two parameters, so deleting the
 * line leaves working code in every case observed. Side-effect imports of
 * anything else would be a real failure, and there is nothing else to import.
 */
function stripImports(text: string, notes: string[]): string {
  let stripped = 0;
  const out = text.replace(/^[ \t]*import[ \t][^\n;]*;?[ \t]*$/gm, () => {
    stripped++;
    return '';
  });
  if (stripped > 0) notes.push(`removed ${stripped} import statement${stripped === 1 ? '' : 's'}`);
  return out;
}

/**
 * `export` prefixes are removed for the same reason: a function body cannot
 * carry them, and the declaration under the keyword is fine.
 */
function stripExports(text: string, notes: string[]): string {
  let hit = false;
  const out = text
    .replace(/^[ \t]*export[ \t]+default[ \t]+/gm, () => {
      hit = true;
      return '';
    })
    .replace(/^[ \t]*export[ \t]+(?=(?:async[ \t]+)?(?:function|const|let|var|class)\b)/gm, () => {
      hit = true;
      return '';
    })
    .replace(/^[ \t]*export[ \t]*\{[^}]*\}[ \t]*;?[ \t]*$/gm, () => {
      hit = true;
      return '';
    });
  if (hit) notes.push('removed export keywords');
  return out;
}

/**
 * Which identifier to call.
 *
 * `build` is what was asked for and what almost always arrives. The rest of the
 * list is not a guess at what models might invent — it is the set actually seen
 * on this wire, and a name outside it is a format failure rather than a silent
 * fallback, because calling the wrong function would produce a plausible
 * creature that is not the one the model wrote.
 */
const ENTRY_NAMES = ['build', 'createCreature', 'create', 'buildCreature', 'makeCreature', 'main'] as const;

/**
 * What a **growth delta** is called. Same tolerance, different word.
 *
 * A delta is not a creature: it is one part plus where to bolt it on, and it
 * has to be told apart from a whole body at load time — running a delta as if
 * it were a build returns `{ attachTo, object }` where an `Object3D` was
 * expected, and the error would read like the model's fault.
 */
const GROWTH_ENTRY_NAMES = ['grow', 'growPart', 'buildPart', 'createPart'] as const;

function findEntry(text: string, notes: string[], names: readonly string[] = ENTRY_NAMES): string | null {
  for (const name of names) {
    // `function build(`, `const build = (`, `const build = function(`, `let build = async (`
    const decl = new RegExp(
      `(?:^|\\n)[ \\t]*(?:async[ \\t]+)?function[ \\t]+${name}\\b|` +
        `(?:^|\\n)[ \\t]*(?:const|let|var)[ \\t]+${name}[ \\t]*=[ \\t]*(?:async[ \\t]*)?(?:function\\b|\\(|[A-Za-z_$])`,
    );
    if (decl.test(text)) {
      if (name !== names[0]) notes.push(`entry point is \`${name}\`, not \`${names[0]}\``);
      return name;
    }
  }
  return null;
}

/**
 * The model's JavaScript, unfenced and de-`import`ed — but **not** wrapped.
 *
 * `extractBuildSource` below appends `;return build(THREE, TSL);` and a
 * `"use strict"` prelude, which is what makes the text callable and what makes
 * it wrong to show to anybody. The growth call needs the other thing: the
 * creature's body as the model wrote it, to put in front of a model as "here is
 * what this creature is today".
 *
 * Sending the raw file instead is a real trap rather than a hypothetical one —
 * `forge/<slug>.js` is the reply *verbatim* by design, and two of the creatures
 * on disk today still carry the ```` ```javascript ```` fence they arrived in. A
 * fenced input reliably produces a fenced output, which `clean.ts` then strips
 * and records as a repair: a note that reads as the model being sloppy when it
 * was being consistent with what it was shown.
 */
export function extractBuildText(reply: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  if (reply.trim() === '') throw new ForgeFormatError('empty', 'the model returned nothing');
  let text = unfence(reply, notes);
  text = stripImports(text, notes);
  text = stripExports(text, notes);
  return { text: text.trim(), notes };
}

/**
 * Turn a raw completion into callable source.
 *
 * Throws `ForgeFormatError` rather than returning a partial result: a reply
 * with no function in it is a failed generation and the studio must say so with
 * the raw text visible, not render an empty group and call it a creature.
 */
export function extractBuildSource(reply: string): ExtractedCode {
  const { text, notes } = extractBuildText(reply);

  const entry = findEntry(text, notes);
  if (entry === null) {
    throw new ForgeFormatError(
      'no_entry',
      `no build function found — expected one of ${ENTRY_NAMES.map((n) => `\`${n}\``).join(', ')}`,
    );
  }

  /*
   * The tail is the calling convention made explicit rather than assumed.
   *
   * `new Function('THREE','TSL', source)` runs the whole body and returns
   * whatever the body returns — so appending the call is what makes an
   * *declaration* into a *result*. It is written as a call with both arguments
   * passed through because a model that declared `function build(THREE, TSL)`
   * shadows the outer bindings with its own parameters, and one that declared
   * `function build()` closes over them; passing them satisfies both.
   */
  const source = `"use strict";\n${text}\n;return ${entry}(THREE, TSL);`;
  return { source, entry, notes };
}

/**
 * The same, for a growth delta.
 *
 * A delta is called with a third argument — the body it is growing onto — so it
 * can measure the part it is bolting to instead of guessing at a scale. The
 * tail passes `host` through for exactly the same reason the build tail passes
 * `THREE` and `TSL`: a model that declared `function grow(THREE, TSL, host)`
 * shadows the outer bindings with its parameters, and one that declared
 * `function grow()` closes over them.
 *
 * What comes back is not an `Object3D` — it is `{ attachTo, object }`. Checking
 * that is the caller's job (`sandbox.ts`), because it needs a renderer to know
 * what an `Object3D` is and this package must never link one.
 */
export function extractGrowthSource(reply: string): ExtractedCode {
  const { text, notes } = extractBuildText(reply);
  const entry = findEntry(text, notes, GROWTH_ENTRY_NAMES);
  if (entry === null) {
    throw new ForgeFormatError(
      'no_entry',
      `no growth function found — expected one of ${GROWTH_ENTRY_NAMES.map((n) => `\`${n}\``).join(', ')}`,
    );
  }
  const source = `"use strict";\n${text}\n;return ${entry}(THREE, TSL, host);`;
  return { source, entry, notes };
}
