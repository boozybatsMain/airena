/**
 * Every number in Airena, in one place.
 *
 * ── the rule for this file ──────────────────────────────────────────────────
 *
 * The brain prompt is GENERATED from this module (`src/brain/prompt.js`), never
 * typed alongside it. A prompt that lies is worse than no prompt: the model
 * believes it, writes against it, and the creature dies of the difference. So a
 * constant that a brain can perceive or act on lives here and is quoted into
 * the prompt by reading this object — there is no second copy to fall out of
 * date.
 *
 * Units: metres, seconds, radians, hit points. The ground is the X/Z plane.
 * Heading 0 faces +Z and increases toward +X (so heading = atan2(dx, dz)).
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The tuning overlay.
 *
 * Balance is found by search, not by argument, and a search that edits source
 * cannot run sixty candidates in parallel. So every number a sweep is allowed
 * to move can also arrive from a JSON file, applied here — at the ONE place the
 * prompt generator, the simulation, the headless runner and the server all read
 * from. A tuning that reached the sim but not the prompt would put a fighter in
 * a world its own brain was told the wrong rules for, which is the exact
 * failure this module's docstring exists to prevent.
 *
 * `AIRENA_TUNING` points a child process at a candidate; with no variable set,
 * `tuning.json` beside the repo root is the committed answer, and with no file
 * at all the literals below stand as written.
 */
const TUNING_PATH = process.env.AIRENA_TUNING
  || fileURLToPath(new URL('../../tuning.json', import.meta.url));

export const TUNING = (() => {
  try {
    if (existsSync(TUNING_PATH)) return JSON.parse(readFileSync(TUNING_PATH, 'utf8'));
  } catch (err) {
    // Loud, not silent: a malformed tuning that fell back to defaults would
    // make an entire sweep quietly measure the same configuration N times.
    throw new Error(`unreadable tuning at ${TUNING_PATH}: ${err.message}`);
  }
  return {};
})();

/** Apply `{ section: { key: { field: value } } }` over a table of records. */
function tune(table, section) {
  const patch = TUNING[section];
  if (!patch) return table;
  for (const [key, fields] of Object.entries(patch)) {
    if (!table[key]) throw new Error(`tuning names unknown ${section}.${key}`);
    for (const [f, v] of Object.entries(fields)) {
      if (!(f in table[key])) throw new Error(`tuning names unknown ${section}.${key}.${f}`);
      table[key][f] = v;
    }
  }
  return table;
}

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

/**
 * 30 Hz simulation, 15 Hz thought.
 *
 * The sim runs at 30 because a 15 m/s charge moves half a metre per tick there
 * and a whole metre at 15 — and a whole metre is enough for a dash to step over
 * a body and miss it. Thought runs at every second tick because 67 ms of
 * reaction latency is already faster than a person and halving the brain's rate
 * halves the chance an average generated brain flip-flops between two opinions
 * on consecutive frames. Smoothness does not come from the think rate; it comes
 * from the acceleration limit below.
 */
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const THINK_EVERY = 2;
export const THINK_HZ = TICK_HZ / THINK_EVERY;

/**
 * Sudden death, and why a timer alone was not enough.
 *
 * The first cross-tournament turned up a stalemate attractor: one generated
 * octopus kited beautifully, never engaged, and took 82% of its matches to the
 * clock at 83 seconds a match. Nothing was broken — under a "highest hp
 * fraction wins" rule, running away IS a winning line, and a brain told only
 * "kill your opponent and survive" is entitled to notice that surviving alone
 * can be enough. That is a defect in the world, not in the brain.
 *
 * From `SUDDEN_DEATH_AT` both fighters burn a rising fraction of their own
 * maximum hp per second. Proportional rather than flat, so the one with the
 * lower hp FRACTION dies first — which is the same fighter the old clock rule
 * would have declared the loser. The tiebreak did not change; it stopped being
 * announced by a timer and started happening on screen.
 *
 * From full health the burn alone kills at t = AT + sqrt(2 / RAMP) = 30 + 11.5,
 * so nothing reaches `MATCH_SECONDS`; that stays as a backstop rather than a
 * rule anyone plays against.
 *
 * `AT` was 45 for most of this project's life, and at 45 the mechanic was
 * decorative: the median match ends at 21s, only 6.3% of matches ever reached
 * the burn, and NONE of the twelve generated brains referenced `p.burnStartsIn`
 * even though the prompt documents it twice. That is not the brains missing
 * something. Burn is the one rule that gives hp a meaning beyond a countdown --
 * once it starts, the fighter ahead on hp FRACTION wins by doing nothing -- so
 * a brain that cannot expect to reach it is right to ignore both the burn and
 * its own health. The measured consequence: freezing hp in perception changed
 * intent 0.0% of the time, for all twelve.
 *
 * Sweeping AT against the k population, 12 rounds over the 36-cell grid, under
 * the old split speeds (octopus 4.85, gorilla 5.35):
 *
 *     AT      mean    p50     max     burn-entry   octopus win
 *     45      23.4s   21.1    56.5          6.3%          38%
 *     34      22.3s   20.9    44.8         11.6%          36%
 *     30      22.1s   21.2    41.5         18.1%          37%
 *     26      21.4s   21.1    36.8         25.2%          37%
 *     22      20.8s   20.9    32.8         44.2%          41%
 *
 * That search picked "an endgame in one match in four" as the target, and 26
 * hit it. 22 was rejected: at 22 the median match is already burning, which
 * makes the burn the ordinary state of a fight rather than the thing that
 * settles a long one.
 *
 * ── why it is 30 and not 26 ─────────────────────────────────────────────────
 *
 * AT is not independent of the rest of the file: the burn is priced off match
 * length, and levelling the two top speeds (see BUILD_AXES) lengthened the mean
 * match by 1.4 s. Left at 26 the same mechanic that used to catch one match in
 * four catches one in three, and the share of matches in which the ARENA lands
 * the killing hp — nobody's hit, no fighter's decision — goes from 14.9% to
 * 20.3%. Holding a constant still across a change to a different constant is
 * not the same as leaving the design alone; here it would have silently made
 * the endgame the ordinary state of a fight.
 *
 * Re-swept on brains-l, 25 rounds over the 36-cell grid, 900 matches a row.
 * The first line is the world before this pass, for the comparison:
 *
 *     speeds        AT      mean     burn-entry   arena-dealt   octopus win
 *     4.85/5.35     26     22.27s      29.7%         14.9%          37.9%
 *     5.10/5.10     26     23.67s      38.1%         20.3%          48.0%
 *     5.10/5.10     28     24.05s      31.0%         16.4%          47.4%
 *     5.10/5.10     30     24.36s      25.0%         12.8%          47.2%
 *     5.10/5.10     34     24.83s      15.8%          9.6%          46.4%
 *
 * 30 is the row that puts the mechanic back where the original search aimed it
 * — one match in four reaching the burn — without letting the arena land more
 * killing blows than it did before the speeds moved, and it costs 0.8 points of
 * win rate and 0.7 s of pace to do both. The knob is worth about 7 points of
 * burn-entry per 2 s, so re-derive this table rather than trusting it if match
 * length moves again.
 *
 * What no row here fixes is the deeper complaint: the burn ratifies a decision
 * already made rather than forcing contact, and the leader at the burn wins 85%
 * of the time. Every row trades WHEN the clock ratifies the leader, never
 * whether. Changing that needs a mechanic that moves the fighters — a closing
 * arena, or damage TAKEN ramping instead of a symmetric drain, so the leader
 * still has to survive contact — which is a change to `src/core/sim.js` and to
 * what the prompt tells a brain, not to this number.
 */
export const SUDDEN_DEATH_AT = 30;
export const SUDDEN_DEATH_RAMP = 0.015;

/** Hard backstop. Sudden death decides every match long before this. */
export const MATCH_SECONDS = 50;

/**
 * One thought's CPU budget inside `node:vm`. A guard against a hang.
 *
 * Raised from 25 ms after a 2 940-match sweep produced two timeouts on brains
 * whose median thought costs 50-200 microseconds. At 250x the mean, the thing
 * being measured was not the brain — it was a garbage collection landing inside
 * the call on a loaded machine. A hang guard only has to be shorter than
 * "forever", so the extra headroom costs nothing and removes a class of fault
 * that would otherwise be attributed to the model.
 */
/*
 * Последний рубеж, а не предел мысли.
 *
 * Пределом мысли служит ТОПЛИВО — счётчик инструкций, который вставляет
 * `sandbox/instrument.js` и который одинаков в изоляте и на хосте (A1:
 * «по инструкциям, не по времени»). Часы остаются только от того, чего
 * разметка поймать не может, и их порог обязан быть заведомо недостижим для
 * честного мозга на загруженной машине.
 *
 * Было 60 мс, и это ломало A2: под нагрузкой честный эталонный мозг не
 * укладывался, получал fault, и один сид давал разные бои — четыре
 * расхождения из шести. Повторяемость держалась ровно до первой занятой
 * машины.
 */
export const THINK_TIMEOUT_MS = 2000;
/** Compilation gets more room; it happens once. */
export const COMPILE_TIMEOUT_MS = 2000;
/**
 * Faults, COUNTED OVER THE WHOLE MATCH, after which a brain is switched off.
 *
 * Not consecutive, which is what this line used to claim: `f.faults` in
 * `src/core/sim.js` is only ever incremented, never reset by a good thought, so
 * a brain that throws once every three seconds is disabled after 25 of them
 * rather than running to the final bell. That is the behaviour worth having —
 * a program that faults 25 times is broken however it spaces them out — but the
 * comment described a different rule, and a reader checking the code against it
 * would have concluded the code was wrong.
 */
export const FAULT_LIMIT = 25;
/**
 * Two budgets, because the two kinds of verb fail differently.
 *
 * An ORDER that is dropped costs the brain one action. A QUERY that is dropped
 * has to return something, and whatever it returns is a lie — so under a single
 * shared cap a brain that probed sixteen directions per thought found `los()`
 * and `ready()` quietly answering false for the rest of the tick. Perception
 * gets its own, generous allowance, and exhausting it raises rather than
 * answers. Both remain guards against a runaway loop, not budgets to husband.
 */
export const MAX_ORDERS_PER_THINK = 64;
export const MAX_QUERIES_PER_THINK = 400;
/** Characters `api.say` will carry, and how long a line stays on the ticker. */
export const SAY_MAX_CHARS = 90;
export const SAY_SECONDS = 3.0;
/** Keys `api.remember` will keep, and the size of one stored value once JSON'd. */
export const MEM_MAX_KEYS = 48;
export const MEM_MAX_VALUE_BYTES = 4096;

// ---------------------------------------------------------------------------
// the arena
// ---------------------------------------------------------------------------

/**
 * A 40x40 square with six blocks in it.
 *
 * The layout is symmetric under a 180 degree rotation about the origin — every
 * block maps onto another block, and the two spawns map onto each other. That
 * is the only fairness property worth having here, and it is checkable rather
 * than argued: `tools/test.mjs` asserts it, under the `arena` group. Without
 * it, a win rate measures the map. (`tools/arena.mjs` has no `--check` flag; it
 * falls through to "no octopus brain for tag", which is a confusing way to
 * discover that a promised check is not where the comment says.)
 *
 * The two centre blocks sit between the spawns on purpose, so a match opens
 * with an approach rather than with a free shot down an empty corridor.
 */
export const ARENA_HALF = 20;
export const WALL_HEIGHT = 4;

export const OBSTACLES = [
  { id: 'a', x: -7, z: -3, hx: 1.2, hz: 3.5, h: 3.2 },
  { id: 'b', x: 7, z: 3, hx: 1.2, hz: 3.5, h: 3.2 },
  { id: 'c', x: 0, z: -10, hx: 3.6, hz: 1.2, h: 3.2 },
  { id: 'd', x: 0, z: 10, hx: 3.6, hz: 1.2, h: 3.2 },
  { id: 'e', x: -12.5, z: 11, hx: 1.6, hz: 1.6, h: 3.2 },
  { id: 'f', x: 12.5, z: -11, hx: 1.6, hz: 1.6, h: 3.2 },
];

/**
 * Spawns sit on a circle of this radius, at an angle drawn from the match seed,
 * diametrically opposite each other.
 *
 * Fixed spawns made every match with the same pair of brains byte-identical,
 * which turns a hundred-round balance run into one round counted a hundred
 * times. Rotating the pair keeps the 180-degree symmetry the layout was built
 * for — so the arena is still exactly as fair — while giving each match a
 * genuinely different opening: sometimes down a corridor, sometimes across the
 * open corner, sometimes already in cover.
 */
export const SPAWN_RADIUS = 15.5;

// ---------------------------------------------------------------------------
// стороны арены
// ---------------------------------------------------------------------------

/**
 * ДВЕ СТОРОНЫ, И ОНИ ЦВЕТА.
 *
 * Стороны звались `octopus` и `gorilla` — именами двух видов, у каждого из
 * которых была своя запись характеристик, свой набор умений и своя половина
 * баланса. Видов больше нет ни в одном из трёх смыслов: тело у каждого
 * существа своё (`BUILD_AXES`), набор умений свой (грамматика §8), соперник
 * любой, а сторона раздаётся по сиду матча. Основатель дословно: «между любыми
 * существами нет ничего общего, кроме того, что они просто существа».
 *
 * Осталось единственное, чем сторона действительно является, — местом на арене
 * и цветом, которым его красят: синий и оранжевый. Имя, называющее вид, врало
 * бы дважды: обещало бы наследование, которого нет, и отправляло бы читателя
 * искать таблицу, которой нет.
 *
 * ПОРЯДОК ЗНАЧИМ. Из этого массива строится `world.order`, а он задаёт порядок
 * обхода бойцов в каждом шаге тика и порядок разрешения столкновений.
 * Переставить элементы — значит поменять мир, а не запись о нём.
 */
export const SIDES = ['blue', 'orange'];

// ---------------------------------------------------------------------------
// the beam and the shared physics
// ---------------------------------------------------------------------------

/**
 * The laser is a beam with width, not a mathematical line.
 *
 * A zero-width ray against a 0.9 m body at 20 m subtends 2.6 degrees. At that
 * tolerance a shot lands or misses on the last frame of a turn, which a viewer
 * reads as the weapon being broken rather than as the shooter being out of
 * position. 0.4 m of beam roughly doubles the arc and keeps the miss legible.
 */
export const BEAM_RADIUS = 0.4;

/** Friction when no move order is standing: how fast a body coasts to rest. */
export const BRAKE_ACCEL = 30;

/** A knockback impulse decays at this rate; below this speed it is dropped. */
export const KNOCKBACK_DRAG = 9;
export const KNOCKBACK_MIN = 0.4;

// ---------------------------------------------------------------------------
// the fighters
// ---------------------------------------------------------------------------

/**
 * Equal top speed, and the gap is opened and closed by skills instead.
 *
 * The first version gave the gorilla +0.8 m/s on the reasoning that a melee
 * fighter has to be able to close. What that produced was a 47-73% melee
 * uptime — the two of them locked together for most of the match, a brawl
 * rather than the chase this is supposed to look like. Levelling them puts the
 * whole question of distance where the interesting decisions are: the charge
 * spends 4.0 s of cooldown on one committed line, the blink opens 7.5 m every
 * 3.9 s, and a laser cast costs 0.65 s at 45% speed. An octopus that fires on
 * cooldown loses ground; an octopus that never fires wins nothing. The tension
 * is the game.
 *
 * ── they were not level, and the gap is the whole lever ─────────────────────
 *
 * This paragraph said "the search walked both speeds independently and landed
 * them level" while the constants below read 4.85 and 5.35 — a 0.5 m/s, 10%
 * edge to the melee fighter. That is not a rounding error in the prose: with a
 * standing speed advantage the gorilla closes any gap the octopus opens by
 * walking, so holding distance stops being a skill the octopus can exercise and
 * becomes an arithmetic it loses. Swept on brains-l, 25 rounds over the 36-cell
 * grid (900 matches a row); the lever is the GAP, not the pace:
 *
 *     octopus  gorilla   gap    oct win   cell imbalance   melee   worst cell
 *       4.85     5.35   +0.50     34.2%        25.4%       26.4%      49.1%
 *       5.10     5.35   +0.25     35.7%        26.3%       25.2%      39.1%
 *       5.35     5.35    0        41.6%        24.3%       23.5%      40.3%
 *       4.85     4.85    0        43.3%        24.8%       21.5%      36.1%
 *       5.10     5.10    0        43.8%        22.0%       22.5%      42.2%
 *       5.10     4.95   -0.15     45.4%        22.9%       21.7%      36.3%
 *
 * Closing the gap is worth about nine points of octopus win rate; where the
 * level pair sits on the ladder is worth about two. Among the three level pairs
 * 5.10 has the lowest cell imbalance — the fight is uncertain in more of the 36
 * matchups, which is the thing a mean cannot see — and it is the midpoint of
 * the two values it replaces, so neither body moves more than 0.25 m/s and
 * every constant tuned around them (accel, the skill ranges, the cone) stays
 * closest to the world it was tuned in. Giving the octopus the edge instead
 * (the last row) measures marginally better still and was rejected: 1.6 points
 * is inside this grid's noise, and a world where the kiter simply outruns the
 * brawler is a worse fight to watch than one where neither can, whatever the
 * win rate says.
 *
 * Re-measured after a concurrent pass over `src/core/sim.js` landed, same
 * population and rounds, because a table this load-bearing should not rest on
 * one snapshot of the simulation: 4.85/5.35 reads 37.1% with 0.25 imbalance and
 * a worst melee cell of 48.8%, 5.10/5.35 reads 40.2%, 5.10/5.10 reads 47.4%
 * with 0.23 and 43.6%, 4.85/4.85 reads 49.9% with 0.25 and 37.5%. Every number
 * moved a few points; the ordering, and the finding that the gap is the lever,
 * did not.
 *
 * Out of sample, `tools/bracket.mjs` over its three populations at 20 rounds,
 * with only the speeds rolled back for the comparison: strong kiters 72% ->
 * 78%, ordinary 26% -> 43%, shipping 39% -> 47%. The median of the three moves
 * from 11.5 points below even to 3.1, which is what that tool's second
 * criterion tests — and which the split pair fails.
 *
 * ── where these numbers come from ───────────────────────────────────────────
 *
 * `tools/balance.mjs` over five passes, and then a bracket. Every candidate is
 * scored on the FULL 6x6 grid of a brain population — every octopus against
 * every gorilla — against fairness, pacing, the shape of the fight (a chase,
 * not a hug), decisiveness, and whether every skill still earns its slot.
 *
 * They are not independent of the brains, and that is the project's main result
 * rather than a caveat on it. Four things were learned the expensive way, each
 * by doing it: tuning against one PAIR and regenerating moved that matchup from
 * 52/48 to 20/80. Tuning against a three-brain SUBSET put the octopus at 50%
 * where all six of the same population put it at 62%. Tuning to 50% on a full
 * population and regenerating gave 92%. Re-tuning to 52% on THAT population and
 * regenerating again gave 14%.
 *
 * The last pair is the whole finding. Fitting to six programs finds the world
 * in which those six win half the time, and six samples of a generator are not
 * the generator. So the numbers below are not a fit: they are the point at
 * which two populations with opposite biases — one unusually good at kiting,
 * one ordinary — bracket 50%, at 79% and 46%, with the shipping population
 * inside them at 43%. `docs/EXPERIMENT.md` reports the whole sequence.
 *
 * The two `maxSpeed` values are the exception and are set by hand from the
 * table above, not by the search. They had to be: `tools/balance.mjs` searched
 * gorilla speed over [5.1 … 5.7] and octopus speed over [4.5 … 5.1], a ladder
 * on which the gorilla is never slower than the octopus and the two are level
 * in one of sixteen combinations, so the lever the table measures was outside
 * the space being searched. That ladder is now symmetric, and every axis is
 * guaranteed to contain the committed value — five of the seventeen did not, so
 * the search could not return to its own baseline once it stepped off it.
 *
 * ── the gorilla is faster ON PURPOSE, and briefly was not ────────────────────
 *
 * A review found this docstring claiming the two were level while the constants
 * gave the gorilla 10%, and levelled the constants to match the prose. That was
 * the wrong half to change. This is a kiter against a chaser: at equal top
 * speed a melee fighter can never close, so the asymmetry is not an oversight,
 * it is the only thing that makes the chase a chase. Levelled at 5.1/5.1 the
 * octopus took 71% of the grid, and returning the gorilla alone to 5.7 — a
 * wider edge than it ever had — still left the octopus at 58.6%, because speed
 * was not the only thing that moved:
 *
 *     octopus  gorilla   octopus win rate (12 rounds over the 36-cell grid)
 *       5.10     5.10          71.1%
 *       5.10     5.70          58.6%
 *       5.00     5.35          66.7%
 *       4.85     5.35          58.8%
 *       4.70     5.35          54.6%
 *       4.55     5.35          51.2%
 *
 * The other half is that the same review round fixed two defects that were
 * quietly taxing the octopus: a blink flat against a wall cancelled to zero
 * metres (9.5% of all blinks) and a point-blank laser missed with reason
 * 'cover'. Both were real and both are fixed; between them the octopus needs a
 * LARGER speed deficit than it used to in order to sit at even, not a smaller
 * one.
 *
 * ── and then the population moved under it ───────────────────────────────────
 *
 * 4.55/5.35 was fitted against the `m` population, where it measured 51% over
 * 30 rounds. The next population generated under those exact constants measured
 * 67%. That is not a tuning failure, it is this project's oldest finding
 * arriving again: a win rate is a joint property of the constants AND the six
 * brains drawn against them, and six brains are not the generator. Sweeping the
 * octopus's top speed across every archived population makes the size of the
 * effect plain — the spread BETWEEN populations is four times the span the
 * speed lever moves WITHIN one:
 *
 *     octopus     h     i     k     l     m     n
 *       4.10     51%   19%   23%   21%   34%   52%
 *       4.25     52%   12%   25%   22%   41%   58%
 *       4.40     61%   17%   27%   22%   45%   63%
 *       4.55     60%   30%   29%   30%   48%   69%
 *
 * Those columns are not equally admissible, and that is the trap. Only `n` was
 * told this world; h, i, k, l and m were each written against a prompt quoting
 * different constants, so their low numbers measure a policy calibrated for a
 * world that no longer exists, not a world that treats them unfairly.
 * `tools/bracket.mjs` prints that provenance beside every row precisely so the
 * reader does not average across it. Fitting to the median of all six would be
 * fitting to five stale opinions.
 *
 * ── measure a population in the world it was BORN in ────────────────────────
 *
 * The first attempt at this set the speed to 4.10, because `n` — the only
 * population then told this world — measured 52% there. That reasoning was
 * still wrong, in a subtler way: `n` was WRITTEN against 4.55 and merely
 * MEASURED at 4.10. A brain that expects to outrun the gorilla and does not is
 * a miscalibrated brain, so 52% described a population being surprised, not a
 * fair fight. Two populations generated AT 4.10 came in at 42% and 26%.
 *
 * The only admissible measurement is a population generated under the same
 * constants it is scored against. Two such points bracket the answer:
 *
 *     octopus   populations born there    octopus win rate
 *       4.10    o 42%, p 26%                    34% (mean)
 *       4.55    n 67%                           67%
 *
 * which is about 73 points of win rate per 1.0 m/s, and puts even at 4.32.
 *
 * Three populations were then generated AT 4.32 and measured there:
 *
 *     q 59.0%   r 32.8%   s 63.1%   ->  mean 51.6%, median 59.0%, sd 16.4
 *
 * The centre lands 1.6 points from even, so the extrapolation held. The spread
 * did not shrink, and that is the more useful result: three populations told
 * the SAME world, drawn from the same generator with the same prompt, disagree
 * by 30 points. Every earlier estimate of that variance was confounded, because
 * the populations being compared had been told DIFFERENT worlds and their
 * spread mixed genuine draw-to-draw noise with miscalibration. This one is
 * clean, and it prices every balance number this project has ever quoted:
 *
 *     a single six-brain population carries about +-16 points.
 *
 * Which is why `tools/bracket.mjs` reports its centre with a standard error and
 * is allowed to answer UNRESOLVED. At n = 3 that error is 9.5 points and a
 * 10-point bar can be neither cleared nor failed — the honest verdict, and one
 * the tool now reaches on its own rather than rounding to a pass.
 *
 * A fourth population was drawn to narrow that band, on the expectation that a
 * typical draw would tighten it enough to settle the question. It did the
 * opposite: t came in at 73%, and the four-population picture is
 *
 *     q 59.0%   r 32.8%   s 63.1%   t 73.0%  ->  mean 57.0%, sd 17.0, sem 8.5
 *
 * so the centre moved AWAY from even rather than the error shrinking around it.
 * Even remains 0.8 standard errors off, which is not a game anyone could call
 * broken, but the offset is now the binding term and no amount of sampling
 * fixes it: at a mean of 57 with this spread, clearing a 10-point bar would take
 * 33 populations, while a CENTRED mean clears it with 3. The lever is the
 * constant, not the sample size.
 *
 * 7 points at 73 points per m/s is 0.096, so the octopus loses that and sits at
 * 4.22 — the first constant here set by a correction the measurement asked for
 * rather than by a search. Four populations generated AT 4.22:
 *
 *     u 50.0%   v 49.7%   w 28.9%   x 55.0%  ->  mean 45.9%, sd 11.6, sem 5.8
 *
 * 4.1 +/- 5.8 points from even, so `off + sem` is 9.9 against the 10-point bar:
 * ESTABLISHED, and by 0.1 of a point, which is not a margin to admire.
 *
 * Two things the pass conceals. The correction OVERSHOT — the mean was aimed at
 * 50 and landed at 45.9, so the real slope is nearer 116 points per m/s than
 * the 73 fitted through two anchors that each carried +-16 points of draw
 * noise. And the spread fell from sd 17.0 to 11.6, which was not predicted and
 * is not claimed: at n = 4 that is as likely to be luck as structure.
 *
 * So the honest reading is that the constant is right to within about a tenth
 * of a metre per second, and that anyone re-deriving it should fit the slope
 * from populations born at three or more speeds rather than two.
 */
/**
 * РАЗМЕР — ОСЬ СУЩЕСТВА, А НЕ КАРТИНКА.
 *
 * До этого размер тела не существовал как игровая величина вовсе: вьювер
 * масштабировал любой сгенерированный меш под фиксированный радиус архетипа,
 * и комар с китом становились одинаковыми. Решение основателя (30.08):
 * размер выбирает модель, и у него есть цена.
 *
 * Что даёт размер, в обе стороны:
 *   МЕЛКИЙ  меньше здоровья, но быстрее и в него труднее попасть (радиус
 *           коллайдера меньше — площадь цели падает как квадрат);
 *   КРУПНЫЙ больше здоровья, но медленнее и попасть по нему легче.
 *
 * Так «сделай комара» перестаёт быть проигрышным ходом, а «сделай кита» —
 * бесплатным бонусом. Это ось с двумя концами, а не награда за одно слово в
 * описании.
 *
 * ПОКАЗАТЕЛИ ПОДОБРАНЫ ЗАМЕРОМ, а не на глаз: `tools/sizebalance.mjs` гоняет
 * лигу размеров на одинаковых наборах и одинаковом мозге, и цифры ниже — то,
 * при чём ни один размер не выигрывает у остальных. Пересчитывать их надо
 * после каждой правки констант боя, и команда записана в самом инструменте.
 *
 * Диапазон вдвое (0.75…1.5) — требование основателя: «от X до 2X».
 */
export const SIZE_MIN = 0.75;
export const SIZE_MAX = 1.5;

/*
 * ПОКАЗАТЕЛИ СТЕПЕНИ: `hp ∝ size^HP_POW`, `speed ∝ size^-SPEED_POW`,
 * `radius ∝ size` (линейно — это геометрия, а не настройка).
 *
 * ── откуда эти три числа ───────────────────────────────────────────────────
 *
 * ЗДОРОВЬЕ ^1.5, УРОН ^1.0, СКОРОСТЬ ^-0.10 — найдено перебором на
 * `tools/sizebalance.mjs`, и это настоящий минимум с гладкой окрестностью, а
 * не случайная точка: 10.4 п.п. перекоса в центре, 13.5 на шаг в обе стороны
 * по здоровью, 20.8 при уроне ^0.9 и 11.5 при ^1.1.
 *
 * Первая попытка была вывести здоровье из геометрии: площадь цели ∝ размер²,
 * значит здоровье ∝ размер². Замер это отверг — при таком показателе мелкий
 * брал 90% боёв. Дальше выяснилось, что выровнять одним здоровьем можно
 * только показателем 4.5, то есть двадцатисемикратной разницей здоровья на
 * двукратной разнице размера. Такая «ось» перестаёт быть выбором и
 * становится таблицей здоровья.
 *
 * Причина не в скорости: при нулевом её наклоне мелкий всё равно выигрывал.
 * Не хватало ВСТРЕЧНОЙ ПЛАТЫ в атаке. С ней всё сходится на простых числах:
 * **урон растёт с размером линейно** (вдвое крупнее — вдвое сильнее удар),
 * здоровье — как размер в степени полтора, скорость слегка падает.
 *
 * Обмен читается словами: мелкий бьёт слабее и живёт меньше, но быстрее и по
 * нему труднее попасть. Крупный наоборот. Ни один конец не бесплатный.
 *
 * ── чего замер сказать НЕ МОЖЕТ ────────────────────────────────────────────
 *
 * Прибор — один эталонный мозг на симметричной арене. Он уже дважды оказывался
 * причиной собственных показаний: строил навигацию под базовый радиус вместо
 * настоящего, держал дистанции в метрах вместо своих радиусов, и не применял
 * короткие умения вовсе (D105). Каждая починка меняла ответ — значит и эти
 * числа надо пересчитывать после любой правки эталонного мозга, а не только
 * после правки констант.
 *
 * Поэтому гейт требует не равенства, а ОГРАНИЧЕННОСТИ: ни один размер не
 * должен брать больше семидесяти процентов. Сделать проверку острее можно
 * одним способом — мерить на нескольких разных мозгах вместо одного, и это
 * записано как незакрытая работа.
 */
/* Из окружения — чтобы `tools/sizebalance.mjs` мог перебирать показатели, не
   правя исходник на каждом шаге. В игре переменных нет, и значения по
   умолчанию — те, что подобраны замером. */
export const SIZE_HP_POW = Number(process.env.AIRENA_SIZE_HP_POW || 1.5);
/*
 * ── 0.10, А НЕ 0.25: ПЕРЕСНЯТО 30.08 ──────────────────────────────────────
 *
 * При 0.25 у оси был СЛАДКИЙ РАЗМЕР. Замерено `tools/sizebalance.mjs
 * --rounds=40`: 0.90 брал 64.4%, а 1.00 — 41.3%, то есть «сделай чуть меньше
 * единицы» было бесплатным преимуществом в четырнадцать пунктов. Прежний гейт
 * этого не видел, потому что гонялся на шести сидах, где такой перекос тонет
 * в шуме.
 *
 * Перебор по двум осям (hp 1.5/1.8/2.1 × speed 0.25/0.10) показал, что виноват
 * не потолок здоровья, а именно скорость: при hp^1.5 замена 0.25 на 0.10
 * уронила худшее отклонение с 13.7 до 3.8 п.п. на двадцати сидах и с 14.4 до
 * 9.7 на сорока. 0.05 дал 8.1 — разница с 0.10 внутри шума (1σ ≈ 2.3 п.п.),
 * поэтому взято круглое.
 *
 * ЧТО ОСТАЛОСЬ И НЕ СПРЯТАНО: поле не стало плоским, оно стало НЕМОНОТОННЫМ —
 * 0.90 и 1.50 держатся выше половины, 1.00 и 1.20 ниже. Это не похоже на
 * преимущество размера как такового и, скорее всего, взаимодействие с чем-то
 * ещё (дальности умений, радиусы в навигационном графе). Записано как
 * незакрытая работа, а не выдано за баланс.
 */
export const SIZE_SPEED_POW = Number(process.env.AIRENA_SIZE_SPEED_POW || 0.10);
/*
 * УРОН ТОЖЕ ЗАВИСИТ ОТ РАЗМЕРА, и без этого обмен не сходится.
 *
 * Замерено: при линейном коллайдере преимущество мелкого настолько велико,
 * что выровнять его одним здоровьем можно только показателем 4.5 — а это
 * значит, что кит вдвое крупнее комара имел бы в двадцать семь раз больше
 * здоровья. Такая «ось» перестаёт быть выбором и становится таблицей
 * здоровья.
 *
 * Причина не в скорости: при нулевом наклоне скорости мелкий всё равно
 * выигрывает. Дело в площади цели, которая падает как квадрат.
 *
 * Значит недостающая половина обмена — не в защите, а в атаке: мелкий бьёт
 * слабее. Это и интуитивно (комар кусает не как медведь), и снимает нужду в
 * чудовищных показателях здоровья.
 */
export const SIZE_DMG_POW = Number(process.env.AIRENA_SIZE_DMG_POW || 1.0);

/**
 * ── ТЕЛОСЛОЖЕНИЕ: СВОИ ЧИСЛА У КАЖДОГО СУЩЕСТВА ───────────────────────────
 *
 * Решение основателя (01.09), дословно: «удаляй все привязки к каким либо
 * архетипам, никаких архетипов, никакого хардкора… любое существо должно
 * иметь возможность быть любым цветом, драться с любым, иметь любые свои
 * характеристики, никак не перенаследовать от осьминога или гориллы».
 *
 * До этого вся физика игры стояла на ДВУХ литеральных записях, и существо
 * наследовало одну из них целиком; своей у него была одна ось — множитель
 * размера. Замерено, к чему это привело: при одинаковом размере одна запись
 * выигрывала около 80% боёв, вторая около 25%, а в 11.76% боёв существо
 * вообще дралось числами ЧУЖОЙ записи, потому что сторона арены несла числа.
 *
 * Теперь числа принадлежат существу. Наследовать не от кого: записей нет.
 *
 * ── ПОЧЕМУ У СВОБОДЫ ЕСТЬ ЦЕНА ────────────────────────────────────────────
 *
 * «Любые характеристики» без цены — это «999 здоровья», и так напишет любая
 * модель, потому что её просят сделать существо сильным. Поэтому оси открыты,
 * но у каждой единицы есть стоимость, а у набора — потолок. Ровно тот же
 * приём, что уже работает для умений (§8): закрытой становится не форма, а
 * АРИФМЕТИКА.
 *
 * Диапазоны шире прежних двух записей в обе стороны — иначе «свобода»
 * означала бы выбор между теми же двумя точками.
 *
 * ── ЧТО ИСЧЕЗЛО ВМЕСТЕ С АРХЕТИПОМ ────────────────────────────────────────
 *
 * `size` как отдельная ось. Радиус ТЕПЕРЬ И ЕСТЬ размер, и он оплачивается
 * прямо, а не через показатель степени. Старая ось была сломана и это
 * замерено: мельче стоило 35% здоровья и 25% урона, а покупало 2.8% скорости.
 *
 * Множитель урона от размера. Раньше крупный бил сильнее И жил дольше И почти
 * не терял в скорости — тройная выгода за одно слово в описании. Урон теперь
 * живёт только в наборе умений, тело на него не влияет: две оси, которые
 * складывались, разведены.
 */

/**
 * Потолок телосложения.
 *
 * Оси устроены так, что каждая стоит от 0 до 10, а середина каждой — ровно 5.
 * Шесть осей, значит «всё по середине» стоит тридцать, а «всё на максимуме» —
 * шестьдесят. Потолок в тридцать означает: существо ровно вдвое дешевле
 * предельного, и любое усиление одной оси оплачивается ослаблением другой.
 *
 * Число выбрано не на глаз: при меньшем потолке телосложение по умолчанию
 * само не проходило бы бюджет, и каждое существо приезжало бы сжатым —
 * то есть умолчание было бы недостижимым идеалом, а не серединой.
 */
export const BUILD_BUDGET = 25;

/**
 * Оси телосложения: границы и цена.
 *
 * `at(x)` — сколько очков стоит значение `x`. Цена линейна: нелинейная шкала
 * прячет выгодные углы, а их потом ищут заново замером.
 *
 * `radius` считается НАОБОРОТ: мелкая цель дороже, потому что по ней труднее
 * попасть. Это единственная ось, где меньше значит лучше, и поэтому
 * единственная, где цена убывает.
 */
export const BUILD_AXES = {
  /*
   * Потолок здоровья опущен по ЗАМЕРУ, а не на глаз.
   *
   * Сначала ось шла 60…460 с серединой 260. На живой арене это дало 68%
   * ничьих (322 боя из 467 кончились двойным нокаутом по времени) против
   * прежних 1.3%: существа из старого мира дерутся телом по умолчанию, а
   * урон под тела 155/205 и калиброван. При 260 здоровья бой физически не
   * успевает закончиться за отведённые секунды — то же, из-за чего одно
   * существо не могло выиграть ни одного боя.
   *
   * Середина возвращена к 180 — туда, где стояло среднее двух прежних тел.
   * Цена середины прежняя, пять очков: сдвинуты концы, а не экономика.
   */
  hp: { min: 60, max: 300, def: 180, per: 24 },
  maxSpeed: { min: 3.0, max: 8.6, def: 5.8, per: 0.56 },
  accel: { min: 12, max: 36, def: 24, per: 2.4 },
  /*
   * `weight` — СКОЛЬКО ОСЬ РЕАЛЬНО СТОИТ, а не сколько ей причитается по
   * симметрии.
   *
   * Сначала все шесть осей стоили одинаково: от 0 до 10 очков, середина 5.
   * Красиво и неверно — прибор `tools/sizebalance.mjs` показал это сразу:
   * телосложение, вложившееся в разворот и прыжок, брало 30% вместо
   * половины, и расширение диапазонов НЕ ПОМОГЛО ВООБЩЕ — те же 30.0% при
   * вдвое большем потолке. Причина не в цене, а в насыщении: мозг думает раз
   * в такт, и разворот быстрее примерно девяти радиан в секунду доворачивает
   * туда, куда всё равно уже смотрит. Продавать за очки то, что не работает,
   * — это скрытый налог на замысел.
   *
   * Поэтому вес честный: разворот и прыжок дешевле вчетверо. Если завтра
   * умение сделает разворот решающим, вес поднимется — и это будет решение,
   * подпёртое тем же прибором, а не восстановление симметрии ради симметрии.
   */
  turnRate: { min: 2.5, max: 12.5, def: 7.5, per: 1.0, weight: 0.5 },
  radius: { min: 1.2, max: 1.8, def: 1.5, per: 0.06, inverse: true },
  jumpHeight: { min: 0.8, max: 3.2, def: 2.0, per: 0.24, weight: 0.5 },
};

/** Цена одной оси в очках. */
export function axisCost(name, value) {
  const a = BUILD_AXES[name];
  if (!a) return 0;
  const v = Math.max(a.min, Math.min(a.max, Number.isFinite(value) ? value : a.def));
  const raw = a.inverse ? (a.max - v) / a.per : (v - a.min) / a.per;
  return raw * (a.weight ?? 1);
}

/** Цена всего телосложения. Округление до сотых — чтобы отчёт не врал. */
export function buildCost(build) {
  let sum = 0;
  for (const name of Object.keys(BUILD_AXES)) sum += axisCost(name, build?.[name]);
  return Math.round(sum * 100) / 100;
}

/**
 * Телосложение по умолчанию — середина каждой оси.
 *
 * Оно НЕ является «архетипом»: это то, что получает существо, о теле которого
 * ничего не сказано. Ни одно другое существо от него не наследуется.
 */
export const DEFAULT_BUILD = Object.fromEntries(
  Object.entries(BUILD_AXES).map(([k, a]) => [k, a.def]),
);

/**
 * Привести телосложение к законному: обрезать по границам, ужать по бюджету.
 *
 * Перебор не отвергается, а СЖИМАЕТСЯ пропорционально: модель, потратившая 30
 * очков вместо 25, хотела примерно такое существо, и вернуть ей отказ значит
 * потерять существо целиком ради арифметики, которую можно поправить. Отчёт о
 * сжатии возвращается наружу — молча подменять нельзя (§5.1).
 */
export function normalizeBuild(raw) {
  const out = {};
  for (const [name, a] of Object.entries(BUILD_AXES)) {
    const v = Number(raw?.[name]);
    out[name] = Math.max(a.min, Math.min(a.max, Number.isFinite(v) ? v : a.def));
  }
  const before = buildCost(out);
  let squeezed = 0;
  if (before > BUILD_BUDGET) {
    /* Сжимаем к дешёвому концу каждой оси, сохраняя пропорции трат. */
    const k = BUILD_BUDGET / before;
    for (const [name, a] of Object.entries(BUILD_AXES)) {
      const cost = axisCost(name, out[name]) * k;
      out[name] = a.inverse ? a.max - cost * a.per : a.min + cost * a.per;
      out[name] = Math.round(out[name] * 1000) / 1000;
    }
    squeezed = Math.round((before - BUILD_BUDGET) * 100) / 100;
  }
  return { build: out, cost: buildCost(out), squeezed };
}

/**
 * Боевая запись бойца из телосложения.
 *
 * Масса выводится из радиуса, а не покупается: она нужна физике отброса и
 * обязана согласовываться с размером. Покупная масса позволила бы сделать
 * крошечное существо неотбрасываемым, и это была бы ещё одна бесплатная выгода
 * за одно слово.
 */
export function statsOf(build) {
  const b = normalizeBuild(build).build;
  return {
    ...b,
    hp: Math.round(b.hp),
    mass: Math.round((b.radius / 1.1) ** 3 * 1000) / 1000,
    /* Урон тело не трогает. См. шапку: две оси разведены. */
    dmgScale: 1,
  };
}

// ---------------------------------------------------------------------------
// the skills
// ---------------------------------------------------------------------------

/**
 * Four skills plus one shared one, each a small state machine with the same
 * three phases: `windup` (committed, telegraphed, nothing has happened yet),
 * `strike` (the instant the effect resolves) and `recover` (still committed,
 * effect already spent).
 *
 * Every skill is telegraphed because the counterplay is the spectacle. A hit
 * that arrives with no wind-up is not exciting, it is arbitrary; the wind-up is
 * what lets a watcher see the other fighter decide.
 *
 * `moveScale` is what the caster's top speed is multiplied by while committed.
 * `interruptible` says whether a knockback cancels it.
 */
export const SKILLS = {
  laser: {
    id: 'laser',
    owner: 'octopus',
    kind: 'beam',
    windup: 0.65,
    recover: 0.10,
    cooldown: 2.2,
    damage: 27,
    range: 24,
    moveScale: 0.45,
    /*
     * A third of the turn rate through the cast, and it buys a picture, not a
     * counterplay. This comment used to claim the second, and it was wrong.
     *
     * Swept on brains-l, 25 rounds over the 36-cell grid, 900 matches a setting
     * — the whole range from "turret" to "barrel welded shut" is flat:
     *
     *     turnScale   1.00   0.35   0.15   0.08   0.05   0.02
     *     laser hit  81.3%  82.0%  83.7%  83.8%  81.8%  74.0%
     *     octopus    43.3%  43.8%  44.8%  44.8%  44.0%  40.9%
     *
     * The arithmetic says why. At the 9.5 m mean gap a fighter breaking flat
     * sideways at 5.1 m/s subtends 19 degrees over the 0.65 s cast, while the
     * barrel at 6.0 * 0.35 covers 78 — four times more than it needs. Below
     * about 0.08 the two are equal, and nothing happens there either, because
     * the population does not strafe; the value only bites at 0.02, where it
     * bites the CASTER. A hand-written gorilla that walks straight at the
     * octopus and never dodges (`brains/probe-dumbape`, 30 rounds against all
     * six octopuses) takes the beam from 93.3% to 87.0% between 0.35 and 0.02,
     * which is the octopus failing to point rather than the ape evading.
     *
     * The reply to a beam is cover, and that is measured too: of 6488 casts on
     * the shipped grid, 14.7% are stopped by a block and 1.4% miss on aim. A
     * throwaway probe gorilla that deliberately crosses the octopus's line
     * during every cast (`probe-dumbape` plus one read, not kept in `brains/`)
     * pushes the blocked share to 22.3% and the aim share to 2.4% — and loses
     * for it, 62.8% to 45.6%, because crossing is not closing.
     *
     * So the constant stays at 0.35 and stops claiming to be a balance lever.
     * What it is load-bearing for is the read: at 1.0 the octopus can spin 223
     * degrees during its own wind-up, and a telegraph the caster can pivot out
     * of is not a telegraph. 0.35 caps that at 78 degrees.
     */
    turnScale: 0.35,
    /* The sim reads this: `strikeNeedsLos` in sim.js gates every strike on it.
       For the beam it is belt and braces, since the beam's own trace against
       the blocks would stop it anyway; for the smash it is the whole rule. */
    needsLos: true,
    interruptible: true,
  },
  blink: {
    id: 'blink',
    owner: 'octopus',
    kind: 'teleport',
    windup: 0.0,
    recover: 0.18,
    cooldown: 3.9,
    distance: 7.5,
    iframes: 0.28,
    moveScale: 1.0,
    turnScale: 1.0,
    needsLos: false,
    interruptible: false,
  },
  smash: {
    id: 'smash',
    owner: 'gorilla',
    kind: 'cone',
    windup: 0.28,
    recover: 0.28,
    cooldown: 1.3,
    damage: 35,
    range: 2.9,
    /** Half-angle of the cone, radians. 55 deg either side of the heading. */
    halfAngle: 0.96,
    knockback: 2.0,
    moveScale: 0.30,
    turnScale: 0.55,
    needsLos: true,
    /*
     * False because nothing can currently deliver the knockback that would
     * cancel it, not because the smash deserves protection.
     *
     * `interruptible` means "a knockback cancels it", and knockback is a
     * gorilla-only property: smash 2.0 and charge 6.0, with the octopus owning
     * none. So a `true` here would read as counterplay in the prompt while
     * being unreachable in the world -- the same defect a reviewer found in
     * `laser.turnScale`, and the prompt was already telling the gorilla that a
     * CHARGE could cancel its smash, which is its own skill and can never hit
     * it. If the octopus ever gains a knockback, this is the one word to change.
     */
    interruptible: false,
  },
  charge: {
    id: 'charge',
    owner: 'gorilla',
    kind: 'dash',
    windup: 0.28,
    recover: 0.35,
    cooldown: 4.0,
    damage: 30,
    /**
     * Dash speed and its maximum duration; 15 * 0.8 = 12 m of POSSIBLE reach.
     *
     * Delivered reach is 6.7 m. Instrumented over 4365 charges on the shipped
     * grid (brains-l, 25 rounds): 23.3% end on the octopus, 44.3% end against
     * geometry, 32.4% run the full 12 m through empty air. The mean dash lasts
     * 0.446 s of its 0.80, and the ones that end early last 0.28 s — 4.1 m.
     * The arena is a third participant in this skill, and aiming does not buy
     * it back. `brains/probe-lanecheck` ray-tests the intercept lane before
     * committing; against all six octopuses at 30 rounds it lands 19.8% of its
     * charges to plain `brains/probe-dumbape`'s 17.9% and dies on geometry
     * 43.6% of the time to dumbape's 43.3% — the wall rate does not move at
     * all, because the lane is picked a wind-up before the dash starts and the
     * octopus moves inside that window. The check also costs more than it
     * earns: the octopus beats lanecheck 62.8% and dumbape 55.0%.
     *
     * Refunding the cooldown of a charge the arena ate was measured and
     * REFUSED. It is not a legibility fix, it is a frequency buff aimed at the
     * 44% of charges that currently fail, and frequency is this skill's
     * strongest lever. Levelled speeds, brains-l, 20 rounds (720 matches each):
     *
     *     blocked charge costs   4.0 s (as now)   2.0 s   1.0 s   0.0 s
     *     octopus win                   43.2%     28.3%   31.7%   35.7%
     *
     * Pricing the refund out does not save it either. Raising the base cooldown
     * to 5.45 s, so that 0.58 * 5.45 + 0.42 * 2.0 leaves the MEAN cooldown at
     * the 4.0 it is today, still costs the octopus 10.5 points: 41.3% with that
     * cooldown and no refund, 30.8% with it. What the refund really hands the
     * gorilla is a reroll — a charge that ends badly comes back at once, from a
     * better position — and a reroll is worth more than the tempo it gives
     * back. Ten to fifteen points is more than the entire correction this pass
     * made to the octopus's win rate, spent to answer a complaint about how the
     * ape LOOKS when the arena stops it. If that legibility is worth fixing it
     * should be fixed where it is felt — in the viewer, and in what the sim
     * tells the brain — not by making the failed attempt cheaper.
     *
     * Shortening the dash so the advertised reach matched the delivered one was
     * measured too: `dashSeconds` 0.55 reads 36.4% octopus with the worst melee
     * cell back up at 49.0%, worse on every axis than leaving it alone.
     */
    dashSpeed: 15,
    dashSeconds: 0.8,
    knockback: 6.0,
    stun: 0.40,
    moveScale: 0.20,
    turnScale: 0.85,
    needsLos: false,
    interruptible: false,
  },
  /**
   * The shared verb — and on the gorilla it is currently dead.
   *
   * Per-side use counts over 900 matches of the shipped grid: octopus laser
   * 7.21/match, blink 4.22, jump 1.22; gorilla smash 3.84, charge 4.85, jump
   * 0.00. Not "rarely" — zero, across six independently generated gorillas.
   *
   * It is not that the brains missed it. `resolveStrike` tests `you.y <= 0.35`
   * for the smash cone and for nothing else, so hopping dodges the only attack
   * the gorilla is never the target of, and dodges nothing the octopus throws.
   * The proof is cheap: raising `gorilla.jumpHeight` from 1.3 to 2.2 leaves the
   * 36-cell grid bit-identical, every metric to twelve digits. A body that
   * never leaves the ground cannot tell how high it would have gone.
   *
   * The fix is in the sim, not here, and it is not the obvious one. Making the
   * beam miss an airborne target the way the cone does costs nothing today —
   * the grid comes out bit-identical again, because no generated gorilla jumps
   * — but a throwaway probe gorilla that hops so the airborne window covers the
   * beam's release (`probe-dumbape` plus one read, not kept in `brains/`) takes
   * the laser from 94.3% to 29.1% and flips that matchup from 67/33 to 32/68. The gorilla's hop keeps its take-off velocity, so
   * hopping costs a chaser almost nothing, which is why it would be worth that
   * much. At `jump.cooldown` 5.0 the same probe reads 50.6% laser hit and 40.6%
   * — a real reply rather than an answer to everything. A verb the prompt
   * offers and the world ignores is prompt budget spent on nothing, but the
   * cure has to arrive with its price already paid.
   *
   * ── ЛЕЧЕНИЕ ПРИШЛО, И ОНО ПРИШЛО СО СВОЕЙ ЦЕНОЙ (D160, 01.09) ───────────
   *
   * Прыжок стал ДЕВЯТОЙ ДОСТАВКОЙ грамматики (`DELIVERIES.jump`), то есть
   * перестал быть бесплатным глаголом и стал одним из трёх, за который платят
   * слотом набора и очками бюджета. Одновременно правило «наземная доставка
   * проходит под тем, кто в воздухе» вынесено из единственной ветки `smash` в
   * `GROUND_DELIVERIES` = {cone, zone, dash} и `AIRBORNE_DODGE_MIN`.
   *
   * ЭТА ЗАПИСЬ НЕ ТРОНУТА, И ЭТО РЕШЕНИЕ, А НЕ НЕДОСМОТР. `SKILLS.jump` —
   * вход, на котором написаны шесть эталонных мозгов и сыграны все 2450
   * матчей §1; правка любого её числа переписала бы измерение задним числом.
   * Поэтому у грамматического прыжка своя запись со своими числами (замах
   * 0.06 против 0.10 здесь — обоснование в реестре), а этот прыжок остаётся
   * ровно тем, чем был, включая описанную выше мёртвость у гориллы.
   *
   * Захардкоженный `charge` по той же причине НЕ получил проверки высоты,
   * хотя по силуэту он тот же «рывок по полу». Обещание промпта про три
   * наземные доставки — про доставки ГРАММАТИКИ; сталкиваясь с существом на
   * эталонном наборе, мозг читает его умения из `p.enemy.skills` и их
   * описания, где про воздух не сказано ничего.
   */
  jump: {
    id: 'jump',
    owner: 'both',
    kind: 'hop',
    windup: 0.10,
    airborne: 0.55,
    recover: 0.16,
    cooldown: 2.8,
    moveScale: 0.35,
    turnScale: 0.35,
    needsLos: false,
    interruptible: false,
  },
};

tune(BUILD_AXES, 'build');
tune(SKILLS, 'skills');

/**
 * ЭТАЛОННЫЕ НАБОРЫ §1 — ФИКСТУРА ЗАМЕРА, А НЕ АРХЕТИП.
 *
 * Шесть мозгов в `brains/` написаны против этих имён, и на них измерены §1 и
 * §16. Существу они не выдаются никогда: у существа есть свой набор из
 * грамматики. Это тестовый стенд, доживающий до того шага, на котором
 * захардкоженные умения уезжают целиком вместе с эталонными мозгами.
 *
 * Ключ — ТЕГ ЭТАЛОНА, а не вид: он ничего не наследует и ни на что в игре не
 * влияет.
 */
export const REFERENCE_SKILLS = {
  octopus: ['laser', 'blink', 'jump'],
  gorilla: ['smash', 'charge', 'jump'],
};

/** Умения эталонного мозга по его тегу. У существа набор свой. */
export function skillsOf(tag) {
  return REFERENCE_SKILLS[tag] ? [...REFERENCE_SKILLS[tag]] : [];
}

/**
 * Сторона арены → тег эталонной фикстуры. МОСТ, А НЕ НАСЛЕДОВАНИЕ.
 *
 * Стороны зовутся цветами (`SIDES`), а фикстура §1 — своими тегами, и её ключи
 * трогать нельзя: против них написаны шесть мозгов в `brains/` и на них
 * измерены §1 и §16. Переименуй их — и поедет замер, а не игра.
 *
 * Мост нужен ровно в одном случае: боец приехал БЕЗ набора грамматики, своих
 * умений у него нет, и захардкоженные ему выдаёт фикстура. Существу с набором
 * мост не нужен вовсе — его умения приезжают вместе с ним, и сторона про них
 * не знает ничего.
 *
 * Тег, поданный сюда напрямую, возвращается как есть: так тот же вызов годится
 * и для стороны, и для тега, и промпту не приходится выбирать между ними.
 *
 * Уедет вместе с самой фикстурой — на том шаге, где захардкоженные умения
 * исчезают вместе с эталонными мозгами.
 */
const REFERENCE_TAG_OF_SIDE = { blue: 'octopus', orange: 'gorilla' };

export function referenceTagOf(side) {
  return REFERENCE_TAG_OF_SIDE[side] || side;
}

/** Total committed time of a skill, for the prompt and for the pose bridge. */
export function skillDuration(s) {
  return (s.windup || 0) + (s.airborne || 0) + (s.dashSeconds || 0) + (s.recover || 0);
}

/**
 * Во сколько раз простоять в зоне ВСЮ её жизнь дороже одного попадания.
 *
 * До этой константы зона применяла полную величину атома КАЖДЫЕ полсекунды.
 * Зона живёт три секунды, значит шесть срабатываний, значит `zone:damage` —
 * это 156 урона против 26 у снаряда за те же четыре очка начинки. У осьминога
 * 155 здоровья: одна зона убивала его целиком. В лиге доставок
 * (`tools/kitbalance.mjs --deliveries`) зона брала 100.0% против всех семи
 * остальных форм — не «сильная форма», а «единственная».
 *
 * Правильная величина не «столько же, сколько удар»: зона видна заранее, её
 * можно обойти, и она отнимает землю, даже когда в ней никто не стоит. За это
 * полагается премия, но премия, а не победа: 1.6 попадания тому, кто простоял
 * в ней всё время и ничего не сделал.
 *
 * Делится величина, а не число срабатываний: шесть тиков по 1/6 читаются как
 * «горит, пока стоишь», а одно срабатывание в конце — как «ничего, ничего,
 * ничего, смерть».
 */
export const ZONE_TOTAL_SHARE = 1.6;

/** Как часто зона срабатывает, в секундах. */
export const ZONE_PERIOD = 0.5;

/**
 * Выше какой высоты боец считается «в воздухе» для наземных доставок.
 *
 * Число не новое: оно два года стояло голым литералом `0.35` в двух местах
 * ветки `smash` (`sim.js`, проверка попадания и причина промаха), и §182 ТЗ
 * уже описывало его как именованную константу, которой в коде не было. С D160
 * оно перестало быть частностью одного захардкоженного умения и стало
 * правилом грамматики: `cone`, `zone` и `dash` (`GROUND_DELIVERIES`) проходят
 * под тем, кто выше этой отметки.
 *
 * Почему 0.35, а не «выше нуля». Дуга прыжка (`4·h·u·(1−u)`) пересекает 0.35 м
 * при высоте 1.5 примерно через 6% воздушной фазы и уходит обратно за 6% до
 * её конца. То есть неуязвимости к земле не 0.55 с, а ~0.48 с, и отрыв с
 * приземлением остаются уязвимыми — прыжок читается как прыжок, а не как
 * мигание с длинной анимацией.
 */
export const AIRBORNE_DODGE_MIN = 0.35;
