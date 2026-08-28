/**
 * Every animation a creature in this world has. One list, three readers.
 *
 * ── why this file exists ─────────────────────────────────────────────────────
 *
 * A forged body carries exactly one animation function — `userData.pose(s)`,
 * handed the creature's *situation* rather than a clip name — and that decision
 * is right and is not what this file changes. What it fixes is that the
 * situation was only ever **sampled at eight points**, and those eight were
 * written down in three places that could not see each other:
 *
 *   - `bake.ts` held `GAIT_SPEEDS` and `POSE_ACTIONS` as two private consts;
 *   - `prompt.ts` recited a *different* list to the model in prose;
 *   - the client dropped every clip that was not locomotion, so the five action
 *     clips every bake on disk carries have never once been played.
 *
 * Three copies of a list is three chances to disagree, and they did: the model
 * was told `s.action` could be `'gather'`, the bake sampled `gather`, and the
 * viewer threw it away. Every reader now imports from here.
 *
 * ── the shape of the answer ──────────────────────────────────────────────────
 *
 * "All animations are functions that accept a value" is exactly right, and it
 * is why there is no clip list in the model's contract. There are three kinds of
 * entry below, and they differ by *what value drives them*:
 *
 *   LOCOMOTION  a continuous function of `s.speed`. Sampled at six speeds and
 *               blended, so a body creeping at 0.4 body-lengths a second and one
 *               flat out at 6 are the same function read at two points. This is
 *               the whole "a walk should know how fast it is" requirement, and
 *               the grid is where it is paid for: two samples cannot express a
 *               gait *change*, and every quadruped has at least two of them.
 *   OVERLAY     a continuous function of some other axis — how hard it is
 *               turning, whether it is off the ground, how hurt it is. Sampled
 *               against the standing pose and applied ADDITIVELY, so banking
 *               into a turn works at every speed instead of needing a clip per
 *               (speed x turn) pair. Six speeds x three turn states x two ground
 *               states would be thirty-six clips; this is six plus four.
 *   ACTION      a one-shot function of `s.phase`, 0 to 1, played once through.
 *               Discrete because the thing it depicts is discrete: a body either
 *               struck or it did not.
 *
 * ── why these entries and not others ─────────────────────────────────────────
 *
 * Every action below is emitted by the simulation today — the kind is named in
 * the `sim` column of the table in `docs/ANIMATION.md`, and `tests/anim.test.ts`
 * fails if an entry here names a `SimEventKind` or `BrainActionKind` that
 * `@autoage/sim-core` does not export. An animation nothing can trigger is dead
 * weight on every payload for ever, and the way that happens is somebody adding
 * a verb because it sounded like something a creature does.
 *
 * ── the cost, measured ───────────────────────────────────────────────────────
 *
 * Over the four bodies on disk that actually carry a grid, eight clips cost
 * between 0.4 % (`gorilla-pose`: 495 kB of 12.5 MB) and 48 % (`spider-gemini`:
 * 1.29 MB of 2.67 MB) of the payload. The spread is not about clip count — it is
 * about how many NODES the pose function moves, and `spider-gemini` moves all
 * 372 of them on every key. Going from eight entries to twenty-five multiplies
 * whichever of those a body is; it is shared per species by
 * `render/bakedSpecies.ts`, so it is paid once for twenty skitterlings, and
 * `sampleDriven` already drops every channel that does not move.
 */

/** What drives one entry. See the header. */
export type AnimKind = 'locomotion' | 'overlay' | 'action';

export interface AnimEntry {
  /** The clip's name on the wire, and the key every reader addresses it by. */
  readonly name: string;
  readonly kind: AnimKind;
  /**
   * The situation to drive `pose` with while sampling this entry. Merged over
   * the standing situation, so an omitted field means "as it is when standing".
   */
  readonly at: AnimSituation;
  /**
   * One line, in the model's own second person, saying what the body should be
   * doing. This is not documentation — `animBrief()` renders these straight
   * into the system prompt, so a body is told about exactly the clips that will
   * be sampled off it.
   */
  readonly brief: string;
}

/** The subset of the pose situation an entry pins. */
export interface AnimSituation {
  readonly speed?: number;
  readonly turn?: number;
  readonly grounded?: boolean;
  readonly health?: number;
  readonly action?: string;
}

/**
 * Speeds the locomotion grid is sampled at, in body-lengths per second.
 *
 * Six and not three. The old grid was `[0, 1, 3]`, and the two gaps in it are
 * the two places a real body changes what it is doing:
 *
 *   0 → 1   a creature does not walk at a tenth of walking pace; it creeps,
 *           and a creep is a different stance, not a slow walk. Sampling 0.5
 *           is what stops a stalking cat reading as a cat in slow motion.
 *   1 → 3   the walk/run transition. Blending straight from a walk to a run
 *           across a 3x span puts every intermediate speed in a pose that is
 *           neither, which is exactly what a two-beat-to-four-beat change
 *           looks like when you linearly interpolate through it. 2 is the
 *           sample that lets a body actually be told to change gait there.
 *
 * And 6 at the top, because the grid CLAMPS (`forge/gait.ts`) — above the
 * fastest sample the fastest clip plays alone, so 3 as the ceiling meant every
 * sprint in the game was a body running at walking-and-a-bit cadence while the
 * ground went past three times faster.
 */
export const GAIT_SPEEDS: readonly number[] = [0, 0.5, 1, 2, 3, 6];

/**
 * The whole catalogue, in the order it is sampled and the order it reads.
 *
 * Sampling order matters for one reason and it is not aesthetic: `bake.ts`
 * restores the standing pose before every entry, and `stand` has to be first
 * because it is what that baseline is read from.
 */
export const ANIMATIONS: readonly AnimEntry[] = [
  // ── locomotion: a continuous function of s.speed ───────────────────────────
  {
    name: 'stand',
    kind: 'locomotion',
    at: { speed: 0 },
    brief:
      'standing still, and ALIVE — idling hardware: the chest or hull breathing, '
      + 'a slow weight shift, the head scanning, a cable swaying. A body that is '
      + 'rigid at speed 0 is a statue, and this is the pose the game shows most.',
  },
  {
    name: 'move-0.5',
    kind: 'locomotion',
    at: { speed: 0.5 },
    brief:
      'moving at half a body length a second — a creep, a stalk, a careful amble. '
      + 'Not a walk played slowly: the stance is lower, the steps are longer in '
      + 'time and shorter in ground, and the body is gathered.',
  },
  {
    name: 'move-1',
    kind: 'locomotion',
    at: { speed: 1 },
    brief: 'walking — the ordinary gait, one body length a second.',
  },
  {
    name: 'move-2',
    kind: 'locomotion',
    at: { speed: 2 },
    brief:
      'moving at two body lengths a second. If this body changes gait between a '
      + 'walk and a run, change it HERE — this sample exists so the change can be '
      + 'seen rather than interpolated through.',
  },
  {
    name: 'move-3',
    kind: 'locomotion',
    at: { speed: 3 },
    brief: 'running — three body lengths a second, committed, longer suspension.',
  },
  {
    name: 'move-6',
    kind: 'locomotion',
    at: { speed: 6 },
    brief:
      'flat out, six body lengths a second. Everything is longer and flatter: the '
      + 'body extends, the head drops in line with the spine, the limbs reach '
      + 'their whole range. This is the top of the grid — nothing is sampled '
      + 'faster, so whatever this looks like is what a sprint looks like.',
  },

  // ── overlays: continuous, additive over the standing pose ──────────────────
  {
    name: 'turn-left',
    kind: 'overlay',
    at: { speed: 1, turn: -1 },
    brief:
      'walking and turning hard to its LEFT. Lean and bank into it, swing the '
      + 'head and the tail, shorten the inside limbs. Only the DIFFERENCE from '
      + 'standing is kept, and it is added on top of whatever gait is playing — '
      + 'so put the turn in the spine, the head and the limbs, not in the whole '
      + 'body\'s yaw (the game already yaws the body).',
  },
  {
    name: 'turn-right',
    kind: 'overlay',
    at: { speed: 1, turn: 1 },
    brief: 'the same, mirrored: walking and turning hard to its RIGHT.',
  },
  {
    name: 'airborne',
    kind: 'overlay',
    at: { speed: 3, grounded: false },
    brief:
      'off the ground. What that means is this body\'s business: a flier beats or '
      + 'sets its wings, a jumper tucks and then reaches for the landing, a '
      + 'legged body lets the limbs hang and trail. Whatever it is, the feet stop '
      + 'walking — a body pedalling in mid-air is the failure this clip prevents.',
  },
  {
    name: 'hurt',
    kind: 'overlay',
    at: { speed: 1, health: 0.2 },
    brief:
      'badly damaged — health 0.2 — but still moving. Favour a side, drop a '
      + 'shoulder, let something hang, sag the head. Added over whatever it is '
      + 'doing, so this is the DIFFERENCE a wound makes and not a whole new pose.',
  },

  // ── actions: one-shot, a function of s.phase 0..1 ──────────────────────────
  {
    name: 'attack',
    kind: 'action',
    at: { action: 'attack' },
    brief:
      'striking, in close. phase 0 is the wind-up, the middle is the commit, the '
      + 'end is the recovery back toward standing. Whatever this body hits with — '
      + 'jaws, a claw, a tail, a ram — that is what travels, and the rest of the '
      + 'body drives it.',
  },
  {
    name: 'fire',
    kind: 'action',
    at: { action: 'fire' },
    brief:
      'launching something at range — a shot, a spit, a spine, a bolt. Aim, then '
      + 'release, then absorb the recoil. It is a different motion from `attack`: '
      + 'the body stays put and the weapon end steadies.',
  },
  {
    name: 'hit',
    kind: 'action',
    at: { action: 'hit' },
    brief:
      'taking a hit. A sharp flinch away from the impact at the start and a '
      + 'settle back — fast, and it must read in a quarter of a second.',
  },
  {
    name: 'block',
    kind: 'action',
    at: { action: 'block' },
    brief:
      'bracing against a blow: weight back and down, whatever this body has that '
      + 'is thickest turned toward the front, the head tucked behind it.',
  },
  {
    name: 'gather',
    kind: 'action',
    at: { action: 'gather' },
    brief:
      'reaching for something on the ground and taking it — go down for it, close '
      + 'on it, come back up with it.',
  },
  {
    name: 'deposit',
    kind: 'action',
    at: { action: 'deposit' },
    brief: 'putting what it carries down, or handing it over. The reverse of gather, and slower.',
  },
  {
    name: 'eat',
    kind: 'action',
    at: { action: 'eat' },
    brief:
      'feeding. Head down to the source and a repeated working of whatever it '
      + 'eats with — this one CYCLES two or three times across the phase rather '
      + 'than happening once.',
  },
  {
    name: 'drink',
    kind: 'action',
    at: { action: 'drink' },
    brief:
      'drinking from something on the ground: head down and held there, a slower '
      + 'and stiller motion than eating, then up.',
  },
  {
    name: 'jump',
    kind: 'action',
    at: { action: 'jump' },
    brief:
      'launching upward: a crouch and load through the first third, then the '
      + 'extension. It ends with the body committed and reaching — the airborne '
      + 'overlay takes it from there.',
  },
  {
    name: 'land',
    kind: 'action',
    at: { action: 'land' },
    brief:
      'arriving from the air: reach for the ground, take the shock, compress, and '
      + 'push back up to standing.',
  },
  {
    name: 'signal',
    kind: 'action',
    at: { action: 'signal' },
    brief:
      'making itself heard or seen — a call, a roar, a display. The body '
      + 'ANNOUNCES: it rises, opens, spreads whatever it has to spread, holds, '
      + 'and comes back down.',
  },
  {
    name: 'sleep',
    kind: 'action',
    at: { action: 'sleep' },
    brief:
      'shutting down for the night: lowering onto the ground, folding, and going '
      + 'still. It ENDS at rest — the last frame is where the body stays.',
  },
  {
    name: 'wake',
    kind: 'action',
    at: { action: 'wake' },
    brief:
      'coming up from the ground and back to standing: the first stir, the push, '
      + 'the settle. It ends exactly on the standing pose.',
  },
  {
    name: 'die',
    kind: 'action',
    at: { action: 'die' },
    brief:
      'dying. `s.health` runs 1 to 0 across the phase and the body must go down '
      + 'and STAY down — the last frame is a wreck on the ground, not a body '
      + 'standing. Nothing about this loops.',
  },
  {
    name: 'evolve',
    kind: 'action',
    at: { action: 'evolve' },
    brief:
      'changing: the body braces, opens along its seams, holds at the top of the '
      + 'phase, and closes back down. This is the moment a creature levels — it '
      + 'is meant to look like effort, not like a flourish.',
  },
];

/** The locomotion entries, ascending by the speed they were sampled at. */
export const LOCOMOTION: readonly AnimEntry[] = ANIMATIONS.filter((a) => a.kind === 'locomotion');
/** The additive overlays. */
export const OVERLAYS: readonly AnimEntry[] = ANIMATIONS.filter((a) => a.kind === 'overlay');
/** The one-shots, by the `s.action` string that names each. */
export const ACTIONS: readonly AnimEntry[] = ANIMATIONS.filter((a) => a.kind === 'action');

/** Every `s.action` value the bake will pass, in catalogue order. */
export const POSE_ACTIONS: readonly string[] = ACTIONS.map((a) => a.at.action as string);

/**
 * The catalogue, rendered for the system turn.
 *
 * Generated rather than written out, for the same reason `FORGE_SYSTEM` is
 * assembled from constants: a body must be told about exactly the clips that
 * will be sampled off it, and the only way a prose list and a sampler cannot
 * drift is for there to be one of them. `tests/anim.test.ts` pins that every
 * entry's name appears in the rendered text.
 */
export function animBrief(): string {
  const speeds = LOCOMOTION.map((a) => a.at.speed ?? 0).join(', ');
  const line = (a: AnimEntry): string => {
    const head =
      a.kind === 'locomotion'
        ? `s.speed = ${String(a.at.speed)}`
        : a.kind === 'action'
          ? `s.action = '${String(a.at.action)}'`
          : overlayHead(a);
    return `  ${a.name.padEnd(11)} ${head}\n      ${wrap(a.brief, 6)}`;
  };
  return `THE SITUATIONS YOUR POSE FUNCTION WILL BE ASKED FOR — all ${ANIMATIONS.length} of them.

This is not a menu. Every one of these is driven through your function and
recorded, on every body, and a situation you did not write a response to comes
back as a creature that does not move when the game says it is doing that. There
is no second chance to add one later: what is recorded here is what the game has
for the life of this creature.

LOCOMOTION — read s.speed and pick the gait. Sampled at ${speeds} body-lengths
per second and blended between, so speeds in between are covered for free and
the samples are where you get to CHANGE something. Drive the cycle off s.stride,
never off s.t, or the feet will skate.

${LOCOMOTION.map(line).join('\n')}

OVERLAYS — recorded as the DIFFERENCE from standing and added on top of whatever
gait is playing. Put them in the parts that should carry them; do not rebuild the
whole pose.

${OVERLAYS.map(line).join('\n')}

ACTIONS — s.action is set and s.phase runs 0 to 1, once. Each is played through
once and then the body returns to its gait, except 'die' and 'sleep', which end
where they end.

${ACTIONS.map(line).join('\n')}

WRITE ONE FUNCTION THAT HANDLES ALL OF THEM. Read s.action first — if it is set,
that is what the body is doing — and otherwise pose from s.speed, s.turn,
s.grounded and s.health. Anything you leave unhandled is recorded as a body
standing there.`;
}

/** Overlay heads read as the axis, not as a fixed number, because that is what they are. */
function overlayHead(a: AnimEntry): string {
  if (a.at.turn !== undefined) return `s.turn = ${a.at.turn > 0 ? '+1' : '-1'} (at a walk)`;
  if (a.at.grounded === false) return 's.grounded = false';
  if (a.at.health !== undefined) return `s.health = ${String(a.at.health)}`;
  return '';
}

/** Soft-wraps a brief so the prompt reads as a table rather than as one long line. */
function wrap(text: string, indent: number): string {
  const width = 72 - indent;
  const pad = ' '.repeat(indent);
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line !== '') out.push(line);
  return out.join(`\n${pad}`);
}
