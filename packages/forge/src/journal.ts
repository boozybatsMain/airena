/**
 * Field journals — what a creature's life looks like on paper.
 *
 * The evolution lane's whole premise is that a body changes *because something
 * happened to it*. In the game that something is `Biography`: 27 event kinds
 * rolled into per-day buckets and a profile the council reads
 * (`packages/sim-core/src/world/biography.ts`). On this bench there is no world
 * running, so the pressure has to be supplied — and supplied in a shape close
 * enough to the real rollup that a stage grown here is the stage the game would
 * grow.
 *
 * So these are **fakes on purpose**, and they are written the way the profile
 * prints rather than as prose: counts, ratios, ranges, severs, and a short
 * `notes` block that says what the numbers mean. A journal with no numbers in it
 * produces a stage that answers a mood; a journal with numbers produces a stage
 * that answers a range, a mass or a temperature, which is what the real one will
 * be doing.
 *
 * Each preset presses on a **different axis** — reach, speed, footing, heat,
 * flanks, height, cold, reach-into-cracks — because the interesting question is
 * not "does the model add something" (it always will) but "does what it adds
 * follow from what happened". Eight journals that all say "it kept losing" would
 * never surface that.
 *
 * They are editable in the page. The presets are a starting point, not a menu:
 * typing your own is the fastest way to find out whether the lane is reading the
 * journal at all.
 */

export interface FieldJournal {
  /** Stable id, stored on the record so a stage can be re-read against its cause. */
  readonly id: string;
  /** Shown in the picker — the pressure in five words. */
  readonly title: string;
  /** What this one is testing, for whoever is reading the results later. */
  readonly axis: string;
  /** The journal itself, sent to the model verbatim. */
  readonly text: string;
}

/**
 * `S-114`-style specimen ids and day ranges are part of the fiction and are
 * deliberately *not* randomised: a journal that changes between two runs makes
 * two stages incomparable, and comparing stages is the entire point of the page.
 */
export const FIELD_JOURNALS: readonly FieldJournal[] = [
  {
    id: 'outranged',
    title: 'outranged — everything hit it first',
    axis: 'reach',
    text: `FIELD JOURNAL · days 14–21 · specimen S-114

fights              31      won 12    lost 19
damage taken     4 812      71% of it taken from beyond 9 m
damage dealt     1 940      mean range at commit 3.1 m
shots at it        214      it closed on 190 of them
severed            left forelimb shell (d17), right optic housing (d20)
disengaged          11      every one of them after fire it could not answer
hunger hours         0

notes
  It walks into range every time, and every time the exchange is already
  decided before it arrives. Nothing it carries reaches further than three
  metres. It survives the approach and gets there with a third of its
  plating gone.`,
  },
  {
    id: 'outrun',
    title: 'outrun — it never caught anything',
    axis: 'speed',
    text: `FIELD JOURNAL · days 9–19 · specimen S-041

pursuits            58      caught 6
mean closing speed        0.7 m/s deficit over 40 m of open pan
top sustained gait        2.9 m/s, held 11 s before the hip actuators stalled
damage dealt       310      almost all of it to things already cornered
damage taken       960      picked up on the walk home
hunger hours        44      it eats when something else has already killed
gait log           stance phase 61% — three feet down at all times

notes
  The ground is flat, hard and open for kilometres. Everything it wants is
  faster than it is over the first ten metres and it never recovers the gap.
  It is not out of power. It is out of stride: the legs cycle at a limit set
  by their own length, and it plants far more than it flies.`,
  },
  {
    id: 'sinking',
    title: 'sinking — the ground would not hold it',
    axis: 'footing',
    text: `FIELD JOURNAL · days 3–15 · specimen S-207

terrain             saturated silt flats, load bearing 12 kPa
falls               73      of which 44 while stationary
time immobilised    6 h 20  hauling a limb back out of the mud
damage taken       880      all of it while down
fights              9       won 1 — it fought every one of them off balance
mass               1 640 kg on four contact patches of 190 cm² each

notes
  It does not lose fights, it loses footing and then loses fights. Every
  contact patch is a point. Standing still, it settles nine centimetres in
  under a minute; moving, it tears a leg free and puts the next one deeper.
  The plating that keeps it alive is the mass that sinks it.`,
  },
  {
    id: 'overheated',
    title: 'overheated — it cooked itself winning',
    axis: 'heat',
    text: `FIELD JOURNAL · days 22–30 · specimen S-088

fights              27      won 24
thermal cutouts     19      first at 41 s of sustained exchange, every time
core temperature    peaked 118 °C; actuator derate begins at 90 °C
damage dealt     11 400     of it 9 100 in the first 40 s of a fight
damage taken     3 200      of it 2 700 in the 90 s AFTER a cutout
kills               11      all of them inside the first minute

notes
  It wins fast fights and loses every long one, and the switch is not
  courage or damage, it is temperature. Under load it makes far more heat
  than its shells can shed, drops to a limp, and stands in the open while it
  cools. Nothing on it is built to move air.`,
  },
  {
    id: 'flanked',
    title: 'flanked — small things, all sides',
    axis: 'coverage',
    text: `FIELD JOURNAL · days 5–17 · specimen S-152

encounters          40      of them 33 against four or more attackers
damage taken     6 010      of it 78% on the flanks and the hindquarters
damage dealt     5 400      93% of it forward of the shoulders
severed            three cable looms, left flank (d8, d11, d16)
kills               29      one at a time, always the one in front
turn rate          38°/s — it takes 4.7 s to bring its front to a new threat

notes
  Everything it has points forward. It kills whatever it is facing and is
  eaten by everything that is not. Small attackers have learned to hold the
  hips. The cable runs down the flank are open and they know it.`,
  },
  {
    id: 'grounded',
    title: 'grounded — the world went vertical',
    axis: 'height',
    text: `FIELD JOURNAL · days 12–26 · specimen S-063

terrain             broken shelf, 60–80° faces, 4–11 m steps
attempts to climb   96      completed 7
falls               61      mean drop 5.2 m, 9 of them onto their own back
time inverted       2 h 10  it cannot right itself unaided; mean 94 s to recover
food reached        11%     of what was sighted
damage taken     2 300      almost none of it from anything alive

notes
  Nothing is hunting it here. It is simply below everything it needs. It gets
  three limbs onto a face and has nothing that will hold the fourth, and when
  it comes off it comes off backwards. It has no way to grip and no way to
  turn over.`,
  },
  {
    id: 'starved',
    title: 'starved — the food was inside things',
    axis: 'manipulation',
    text: `FIELD JOURNAL · days 18–33 · specimen S-119

hunger hours       191      continuous from d24
food sighted       340 caches
food reached        22      all of them already open
attempts to open   300+     by striking, by standing on, by dragging
mean cache         a sealed pod, 11 cm wall, in a crevice 8 cm wide
damage to self     740      inflicted on its own forelimbs, striking rock
fights               2      it has no competition here and it is starving anyway

notes
  There is food everywhere and it cannot get into any of it. Its limbs end in
  pads made for standing. It has no way to enter a gap narrower than its own
  foot and nothing on it that pries, cuts or grips.`,
  },
  {
    id: 'frozen',
    title: 'frozen — the nights took what the days gave',
    axis: 'endurance',
    text: `FIELD JOURNAL · days 30–44 · specimen S-006

ambient            −29 °C for 15 h of every 24
power drawn on heating alone   61% of daily budget
active hours        5.5 of 24, falling
shutdowns           7       woke stiff, mean 22 min to full articulation
lubricant           two joints seized outright: left hip, jaw pivot (d38, d41)
fights              4       won 4, all of them inside the warm hours
food gathered      down 70% against its own week-one rate

notes
  It is not losing to anything. It is spending its whole life staying warm and
  has nothing left to live with. Heat leaves it everywhere at once: it is
  built as an open frame in a place that punishes open frames.`,
  },
];

export function journalById(id: string | undefined | null): FieldJournal | null {
  return FIELD_JOURNALS.find((j) => j.id === id) ?? null;
}
