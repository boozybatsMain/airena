/**
 * BIRTH — the generation, and the reveal that ends it (docs/REDESIGN.md §6.4).
 *
 * This screen owns the longest wait in the product: measured on live
 * generations the median is around two and a half minutes and the tail runs
 * past twenty. It is therefore the window with the most drop-off, and every
 * decision here is about that.
 *
 * No percentage, no estimate, no spinner. A progress bar over a job whose
 * duration is unknown to a factor of ten is a lie that is discovered exactly
 * when the player has already waited too long. What is shown instead is true:
 * the elapsed time, the stage the server is actually in, and the sentence the
 * player wrote.
 *
 * The reveal is deliberately slow. The creature is the product; it gets a
 * sequence, not a page load.
 */

import { get, track } from '../lib/api.js';
import { h, mount, svg, wait as sleep } from '../lib/dom.js';
import { latinOnly, clip } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { abilityTile } from '../ui/ability.js';
import { mindBadge } from '../ui/mind.js';
import { orbit } from '../ui/orbit.js';
import { portrait } from '../ui/portrait.js';

/**
 * Codes that are OUR breakage, not the player's — the same list as
 * `OUR_FAULT` in `src/server/limits.js`, where it decides whether a daily
 * attempt is spent. Two copies of one judgement drift silently and drift in
 * the direction of "we told the player their allowance was untouched while we
 * were taking it", so `tools/checkfaults.mjs` compares them.
 */
const OUR_FAULT = ['server_restarted', 'internal', 'no_catalog', 'no_creature',
  'no_key', 'network', 'wall', 'http', 'rate'];

/**
 * THE STAGE IS MATCHED BY CODE, NOT BY THE SERVER'S PROSE.
 *
 * Regular expressions over the stage sentence broke once already: the client
 * looked for one wording and the server wrote another, so the longest stage of
 * the generation displayed the *previous* step for minutes — the interface
 * said things were going worse than they were, exactly where a person decides
 * whether to keep waiting.
 *
 * Codes come from the server (`stageCode`, listed in `STAGE_RU` in
 * `src/server/jobs.js`) and `tools/checkstages.mjs` fails if this table and
 * that list ever disagree. The third element is the fallback for jobs started
 * before the code column existed: it must never be wider than the code it
 * stands in for.
 *
 * ONLY ONE ROW OF THIS IS EVER DRAWN — the one the generation is standing on
 * (§6.4). It was drawn as a seven-row rail for a while, with the steps still
 * ahead dimmed below the current one, on the argument that a lone sentence
 * gives no sense of position. It gives none, and the rail did not give one
 * either: a list of six future steps with no time against any of them is a
 * determinate progress bar with the number filed off, which is the exact shape
 * §1.5 exists to forbid — stages here run from four seconds to four minutes,
 * so "two of seven" says nothing true about how much is left. What answers the
 * question honestly is the median the player was already quoted on the button
 * they pressed, and that is now one line under the clock (`typicalLine`).
 */
const STAGES = [
  ['in the queue', ['queued'], /queue/i],
  ['reading the description', ['parse'], /description/i],
  ['writing its mind', ['brain', 'brain_retry'], /writing its mind|attempt/i],
  ['drawing the body', ['body', 'body_retry'], /body/i],
  ['two trial fights', ['validate', 'duel'], /trial|sparring/i],
  ['writing how it fights', ['card'], /how it fights/i],
  ['ready', ['done'], /ready|replaced|kept/i],
];

/** What a failure means when the server could not say it in words. */
const FAIL_TEXT = {
  rejected: 'The mind did not pass its two trial fights.',
  no_key: 'The arena could not reach the mind you chose.',
  network: 'The connection to the mind dropped.',
  wall: 'The generation ran past its time limit.',
  /* NOT "something broke on our side": the line under this one already says
     whose fault it was, in the same words, eight pixels lower ("This one is on
     us — your daily allowance is untouched."). Two sentences that carry one
     fact leave the reason line saying nothing about what actually happened, on
     the one screen where the player has just lost three minutes. This one
     reports the event; the line below keeps the ownership. */
  internal: 'The generation stopped before it finished.',
  server_restarted: 'The server restarted while your creature was being made.',
};

/**
 * The creature revealed in the `?ui=birth-reveal` capture. Frozen, fake.
 *
 * `bodyRef` is the one field that is not decoration: without a body the reveal
 * has nothing to render and falls through to the drawn stand-in, which is how
 * the §10 capture came back showing a line drawing where the product shows a
 * machine. A capture state has no generated body — nothing was generated — so
 * it borrows a stock one that ships with the client (`/bodies/gorilla.js`,
 * the same source the arena builds its stock fighters from). It is the only
 * place in the product where the name and the body were not made together.
 */
const DEMO_CREATURE = {
  id: null,
  bodyRef: 'gorilla',
  name: 'CROCODILE',
  model: 'google/gemini-3.7-flash:plain',
  abilities: [
    { slot: 0, key: 'k1', name: 'EMBER BEAM', delivery: 'beam', element: 'ember', blurb: 'A straight beam that stops at the first obstacle. Deals 26 damage.' },
    { slot: 1, key: 'k2', name: 'VOID BLINK', delivery: 'blink', element: 'void', blurb: 'A short step through space. It does not cross a wall.' },
    { slot: 2, key: 'k3', name: 'FROST BOLT', delivery: 'bolt', element: 'frost', blurb: 'A slow bolt that chills on hit. Deals 18 damage.' },
  ],
};

const DEMO_PROMPT = 'A heavy mechanical crocodile that becomes more aggressive when wounded';

/**
 * ONE FROZEN CLOCK, DERIVED TWICE — never written twice.
 *
 * `?ui=birth-wait` photographs a generation at 01:38, and the chrome's chip
 * stands over that same frame counting the same wait. The two were separate
 * literals in separate files — `98_000` here, the string `'01:38'` in
 * `app.js` — describing one fact about one capture, with nothing keeping them
 * in step: moving either one silently desynchronised the chip from the screen
 * it stands over. The number is stated once and the label is computed from it.
 */
export const BIRTH_FREEZE_MS = 98_000;

/** `98_000` → `01:38`. The elapsed clock's only format, live or frozen. */
export const elapsedClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const BIRTH_FREEZE_CLOCK = elapsedClock(BIRTH_FREEZE_MS);

/**
 * The measured wait of the mind the capture is using — Gemini 3.7 Flash,
 * quick, 206 s in the dev stand's catalogue. A capture cannot go to the
 * network for it (§10: deterministic, frozen), and the whole point of the line
 * is that it is the number Create already quoted, so the state that
 * photographs Create's mind carries Create's number for that mind.
 */
const DEMO_WAIT_SECS = 206;

/**
 * WHAT THE WAIT USUALLY IS — said once, in words, and never redrawn.
 *
 * A stranger watching 00:08 climb has no scale: thirty seconds and ten minutes
 * look identical for the first thirty seconds. They were told `~3 MIN` on the
 * mind they picked, and then the screen that actually spends those minutes
 * never mentioned it again. This is that same measured median (§6.3, §8.5
 * `waitSecs`), in the register of a sentence rather than a chip.
 *
 * It is a median, not an estimate: it does not count down, it does not move,
 * it does not narrow as the clock climbs, and it disappears entirely for a
 * mind nobody has measured yet. §1.5 forbids inventing a number for THIS
 * generation; it does not forbid repeating the one that was measured over all
 * the others.
 */
function typicalLine(secs) {
  const n = Number(secs);
  if (!Number.isFinite(n) || n <= 0) return '';
  const min = Math.max(1, Math.round(n / 60));
  return `Usually about ${min} ${min === 1 ? 'minute' : 'minutes'}.`;
}

/**
 * The chosen mind's measured wait, from the catalogue Create read (§8.5).
 *
 * Read here rather than carried in the draft because the draft is written by
 * the previous screen and a stale number is worse than none: the catalogue is
 * re-measured on the server, and this screen asks for it at the one moment it
 * has minutes to spare. Never awaited by anything the player is looking at —
 * the line simply appears when the answer arrives, and never if it does not.
 */
async function typicalWait(bundleId) {
  if (!bundleId) return null;
  try {
    const cat = await get('/api/catalog');
    const list = Array.isArray(cat?.bundles) ? cat.bundles : [];
    const want = String(bundleId);
    const b = list.find((x) => String(x?.id ?? x?.bundle ?? '') === want);
    const n = Number(b?.waitSecs ?? b?.secs);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

/**
 * THE CAPTURE WEARS THE SESSION'S OWN CREATURE (§10).
 *
 * `birth-reveal.png` came back with CROCODILE under a chrome chip that read
 * STONE GOLEM #4 · 1,574 MMR beside a different mind — two creatures on one
 * frame, and a reviewer reading it has no way to know which one is the
 * product. `screens/live.js` had already met this and solved it with
 * `fixtures()`; this is the same treatment for the screen that shows a
 * creature being born.
 *
 * The body is the one field that stays fake: nothing was generated for a
 * capture, so the reveal borrows the stock body it always borrowed. Everything
 * a chip can contradict — the name, the mind, the abilities — comes from the
 * session when there is one.
 */
function fixtures(session) {
  const c = session?.creature || null;
  const name = (latinOnly(c?.name || '') || '').toUpperCase();
  if (!name) return DEMO_CREATURE;
  const abilities = Array.isArray(c.abilities) && c.abilities.length === 3
    ? c.abilities : DEMO_CREATURE.abilities;
  return { ...DEMO_CREATURE, name, model: c.model || DEMO_CREATURE.model, abilities };
}

let poll = null;
let tick = null;
let orb = null;
let port = null;
let keys = null;
let gone = false;
/** The screen element this run mounted into — the thing whose removal ends the fade. */
let rootEl = null;
/** `{ p, el }` — a portrait still on screen, fading out with the card it stands in. */
let falling = null;
let fallTimer = null;

/**
 * ONE REVEAL PER BIRTH.
 *
 * `poll` fires every 1.5 s at a `step()` that awaits the network, so two ticks
 * can be inside `step()` at once and both can read `state === 'done'`.
 * `stopPolling()` only stops future ticks and `stale(turn)` cannot tell the two
 * apart — same screen, same `run`. The second one would mount a second reveal
 * over the first mid-sequence and send a second timing chain at `ctx.go`.
 * `busy` keeps the ticks from overlapping at all; `revealing` is the belt to
 * that braces, because the cost of being wrong here is the player watching
 * their creature be born twice.
 */
let revealing = false;
let busy = false;

/**
 * REDUCED MOTION IS ANSWERED HERE TOO, NOT ONLY IN THE CANVASES.
 *
 * `ui/base.css` flattens transitions and `ui/orbit.js` and `ui/portrait.js`
 * stop their loops — but this screen's reveal is not a transition, it is four
 * and a half seconds of awaited beats. A player who asked their system for
 * less motion was still made to sit through all of it, watching animations
 * that had already been flattened to nothing: the worst of both.
 *
 * So beats collapse to a frame and the sequence lands on its end state at
 * once. Reading time is not motion and does not collapse — see `hold()`.
 * Read live, like the other two modules, so a setting changed while the page
 * is open takes effect without a reload.
 */
const CALM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const calm = () => !!(CALM && CALM.matches);

/**
 * The reveal's clock — and the way out of it.
 *
 * Every beat waits on this instead of on a bare timer, which buys two things.
 * Reduced motion shortens each beat to a frame (`wait`). And a gesture —
 * a click, Enter, Space, Escape — wakes every pending beat at once
 * (`skip`), so the sequence runs to its end state in one tick instead of
 * being something the player has no way out of.
 */
function beatclock() {
  let hit = false;
  let wake = null;

  const sleeper = (ms) => new Promise((r) => {
    if (ms <= 0) { r(); return; }
    const t = setTimeout(() => { wake = null; r(); }, ms);
    wake = () => { clearTimeout(t); wake = null; r(); };
  });

  return {
    /** A beat of motion: a frame under reduced motion, nothing once skipped. */
    wait: (ms) => (hit ? Promise.resolve() : sleeper(calm() ? Math.min(ms, 60) : ms)),

    /**
     * Reading time, which is the opposite case: with every beat collapsed the
     * finished card would otherwise be pulled away half a second after it
     * appeared, and a player who skipped forward asked to see the end, not to
     * leave. So this one lengthens where `wait` shortens — and the next
     * gesture ends the screen rather than the sequence.
     */
    hold: (ms) => {
      const ms2 = hit ? 1400 : (calm() ? Math.max(ms, 2400) : ms);
      hit = false;
      return sleeper(ms2);
    },

    skip: () => { hit = true; if (wake) wake(); },
  };
}

/**
 * WHICH RUN OWNS THE SCREEN.
 *
 * The reveal is a three-and-a-half second sequence that deliberately outlives
 * the call that starts it (see `enter`), so a player who leaves the screen and
 * comes back inside those seconds has two sequences in flight at once. The
 * older one must not type into the newer screen, and must not — at its last
 * beat — navigate the newer one away. `gone` alone cannot say this, because
 * `enter` clears it; a counter can.
 */
let run = 0;
const stale = (turn) => gone || turn !== run;

export async function enter(root, args, ctx) {
  const turn = ++run;
  gone = false;
  revealing = false;
  busy = false;
  rootEl = root;                          /* what `watchFall()` watches leave the page */
  const debug = ctx.store.debug;

  /* When the job started, as the server dates it: two clocks never agree and
     the elapsed line is the one number on this screen. */
  let started = null;

  /* The job knows nothing about the sentence or the mind — both were chosen on
     the previous screen and live in the draft until the creature is born. */
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem('airena.draft') || '{}') || {}; } catch { draft = {}; }
  const promptText = debug ? DEMO_PROMPT : latinOnly(String(draft.prompt || ''));
  const mindId = debug ? DEMO_CREATURE.model : (draft.bundle || null);

  const word = h('div.t-state.birth-word', 'Creating life');
  const canvas = h('canvas.birth-orbit', { width: 240, height: 240, 'aria-hidden': 'true' });
  const mindLine = h('div.birth-mind', mindId ? mindBadge(mindId, { mode: false }) : null);
  const elapsed = h('div.birth-elapsed.t-num', '00:00');
  /* The median, when the catalogue knows one. Empty until it answers, and
     `:empty` hides it — a line that appears is fine, a placeholder is not. */
  const typical = h('div.birth-typical.t-small');
  const promptLine = h('div.birth-prompt', promptText ? `“${clip(promptText, 160)}”` : null);
  const notes = h('div.birth-notes');

  /*
   * THE STAGE, IN ONE LOWER-CASE LINE (§6.4).
   *
   * The dot is the only thing on this screen that says "still running" without
   * claiming to know how much is left: it breathes, and it stops breathing
   * under reduced motion (`ui/base.css` pins every animation). The words are
   * the server's own stage, spoken in the client's vocabulary (`stageLabel`).
   *
   * `role="status"` because this is the one line whose CHANGES are news — six
   * or seven of them over three minutes, which is a reasonable thing to hear.
   * The clock beside it is not announced: a live region that rewrites itself
   * every second reads the same two words for the whole wait.
   */
  const stageWords = h('span.stage-words');
  const stageLine = h('div.birth-stage.t-small', { role: 'status' },
    h('span.stage-dot', { 'aria-hidden': 'true' }), stageWords);
  let stageNow = '';
  function setStage(text) {
    if (!text || text === stageNow) return;
    stageNow = text;
    stageWords.textContent = text;
    stageLine.classList.remove('is-in');
    void stageLine.offsetWidth;           /* restart the fade on a live node */
    stageLine.classList.add('is-in');
  }

  /*
   * THE WAY OUT OF THE WAIT THAT IS NOT LEAVING.
   *
   * The arena is already running behind this screen's veil (§2.4) — a real
   * fight, the thing the whole product is. `#/live` cannot be linked to while
   * a job is running, because `app.js` sends that route straight back here (and
   * rightly: leaving would end the polling and the player would have to find
   * their way back). So the veil lifts in place instead: the fight comes
   * forward, this column folds into one bar at the bottom, and the poll never
   * stops. When the creature is done the reveal takes the screen back.
   *
   * IT IS A BUTTON, NOT A FOOTNOTE. It was `.btn.ghost.small`: 10 px tracked
   * label type in `--muted`, at the bottom of four hundred pixels of empty
   * warm ground — the faintest element on the screen, and the only one that
   * moves the player anywhere. A stranger waiting out three to six minutes has
   * exactly one thing to press and it was styled like a legal disclaimer. It
   * now wears the kit's SECONDARY surface (`.btn`'s own glass, uikit.png) as a
   * pill, with the play glyph that says what pressing it does.
   */
  const peekBtn = h('button.btn.birth-peek-btn', {
    type: 'button',
    'aria-pressed': 'false',
    onclick: () => setPeek(!peeking),
  });

  /* §6.4's column, top to bottom: the state word, the orbit, whose mind it is,
     the clock, what that clock usually reaches, the sentence the player wrote,
     and the stage the server is in. */
  const waitView = h('div.birth-wait',
    word, h('div.birth-orbit-hold', canvas), mindLine, elapsed, typical, promptLine,
    stageLine, notes, peekBtn);

  const stage = h('div.birth-stagearea', waitView);
  const wrap = h('div.birth-wrap', stage);
  mount(root, wrap);

  let peeking = false;
  function setPeek(on) {
    peeking = !!on;
    wrap.classList.toggle('is-peek', peeking);
    peekBtn.setAttribute('aria-pressed', peeking ? 'true' : 'false');
    mount(peekBtn, peeking
      ? [icon('arrow-left'), h('span', 'Back to the birth')]
      : [icon('play', 14), h('span', 'Watch the arena while you wait')]);
  }
  setPeek(false);

  /* Escape is the gesture every other overlay in the product answers to. */
  if (keys) removeEventListener('keydown', keys);
  keys = (e) => { if (e.key === 'Escape' && peeking) { e.preventDefault(); setPeek(false); } };
  addEventListener('keydown', keys);

  orb = orbit(canvas, { mode: 'birth', seed: 7, color: '#2E2E33' });

  if (debug === 'birth-reveal') {
    stopOrbit();
    /*
     * NOT AWAITED, ON PURPOSE — AND THE SAME GOES FOR THE REAL ONE BELOW.
     *
     * `app.js` holds an incoming screen at `opacity: 0` (`.screen.entering`,
     * `ui/base.css`) until `enter()` resolves. A sequence awaited here would
     * therefore play its whole three seconds behind an invisible layer and
     * pop in finished — the exact opposite of §6.4's deliberately slow reveal
     * and of §1.8's continuous transition. Measured: the §10 capture of this
     * state came back empty for precisely this reason.
     */
    reveal(stage, fixtures(ctx.store.session), ctx, turn, { freeze: true, instant: true })
      .catch(() => { /* the frozen state has nowhere to fall back to */ });
    return;
  }

  if (debug === 'birth-wait') {
    typical.textContent = typicalLine(DEMO_WAIT_SECS);
    paint({
      id: 'demo', state: 'running', stage: 'writing its mind', stageCode: 'brain',
      attempts: 1, createdAt: Date.now() - BIRTH_FREEZE_MS,
    }, { frozen: BIRTH_FREEZE_CLOCK });
    return;
  }

  /* Not awaited: the catalogue is a network call and this screen has minutes.
     The line appears under the clock when the answer lands, and never at all
     for a mind whose wait nobody has measured. */
  typicalWait(mindId).then((secs) => {
    if (stale(turn)) return;
    typical.textContent = typicalLine(secs);
  }, () => {});

  await step();
  poll = setInterval(step, 1500);
  tick = setInterval(() => { if (started) paintElapsed(Date.now() - started); }, 1000);

  async function step() {
    /* A tick that arrives while the previous one is still on the network is a
       second reader of the same state (see `busy` above), and every branch
       below is a one-time event. */
    if (busy || revealing) return;
    busy = true;
    let job;
    try { job = await get(`/api/job/${args.jobId}`); } catch (e) {
      /* Somebody else's generation, or one that no longer exists: the arena is
         always a valid place to be. */
      if (e?.status === 404 || e?.status === 403) { stopPolling(); ctx.go('/live'); }
      return;
    } finally { busy = false; }
    if (stale(turn)) return;
    started = job.createdAt || Date.now();

    if (job.state === 'done') {
      if (revealing) return;
      revealing = true;
      stopPolling();
      track('create_done', { jobId: job.id });
      try { localStorage.removeItem('airena.job'); localStorage.removeItem('airena.draft'); } catch { /* private mode */ }
      const creature = await loadCreature(job.creatureId);
      if (stale(turn)) return;
      /* The chrome stops saying BEING BORN at the moment this screen says
         SIGNAL ACQUIRED — see `adoptCreature`. Before beat 1, so the corner
         and the card announce the same creature in the same frame. */
      adoptCreature(ctx, creature);
      /*
       * THE HANDOFF OVERLAPS; IT DOES NOT SWAP.
       *
       * This used to be `stopOrbit()` and then a `mount()` that cleared the
       * node: CREATING LIFE, the orbit, the clock, the sentence and the rail
       * all vanished in one frame, the orbit's 700 ms collapse played on a
       * canvas that had already been removed, and the stage then sat empty for
       * 600 ms while SIGNAL ACQUIRED faded up from nothing. The one moment the
       * whole product exists for was a page swap with a hole in the middle.
       *
       * Now the point keeps collapsing on a canvas that is still on screen, the
       * waiting column leaves under `is-leaving`, and the reveal is mounted
       * underneath it and starts its word 200 ms in — so the new word is
       * already rising while the old point is still there. Dead time: none.
       */
      setPeek(false);
      stopOrbit();
      waitView.classList.add('is-leaving');
      /* Runs on its own (see the note in the debug branch) so the screen is
         visible while the sequence plays. If it breaks anyway the creature is
         still alive and the arena is where it is going. */
      reveal(stage, creature, ctx, turn, { freeze: false, leaving: waitView })
        .catch(() => { if (!stale(turn)) ctx.go('/live'); });
      return;
    }

    if (job.state === 'failed') {
      stopPolling();
      track('create_failed', { jobId: job.id, code: job.error || '' });
      stopOrbit();
      paintFailure(job, ctx);
      return;
    }

    /* The renderer the reveal will need takes a second or two to appear the
       first time, and this screen is about to spend minutes doing nothing.
       Fetching it now means the creature's own body is what the player sees at
       the moment the wait ends, instead of a drawing that stood in while a
       megabyte of renderer arrived. */
    warmRenderer();
    paint(job, {});
  }

  function paint(job, { frozen = null }) {
    started = job.createdAt || Date.now();
    paintElapsed(frozen ? null : Date.now() - started);
    if (frozen) elapsed.textContent = frozen;

    setStage(stageLabel(job));

    /* Two facts the player has earned by waiting: a retry is running, and it
       is taking longer than usual. Silence on either reads as a hang. */
    const kids = [];
    if (job.attempts > 1) kids.push(h('div.t-small', 'First attempt failed — trying again (free).'));
    if (Date.now() - started > 240_000) kids.push(h('div.t-small', 'Taking longer than usual — still working.'));
    mount(notes, kids);
  }

  function paintElapsed(ms) {
    if (ms == null) return;
    elapsed.textContent = elapsedClock(ms);
  }

  function paintFailure(job, c) {
    setPeek(false);                       /* the bar's node is about to be replaced */
    const reason = latinOnly(String(job.errorMessage || '')) || FAIL_TEXT[job.error] || 'It did not come together.';
    /* The corner is announcing a birth that is over, and both ways out of this
       screen lead back into it — see `dropJob`. */
    dropJob(c, job);
    const said = h('p.birth-sr', { role: 'status' });
    mount(stage, h('div.birth-fail',
      h('div.t-state.birth-fail-word', 'It did not take shape'),
      h('div.t-body.birth-reason', reason),
      /* §1.4 bans money words, and the second line used to say one that was
         also untrue: on this branch the attempt DID come out of the day's
         three. Both branches now say what actually happened to them. */
      /* §9.1: the daily allowance is counted in GENERATIONS, and it is counted
         in that word on Create's deny line, in `limits.js` and in the
         creature page's strip. "Creations" was an eighth noun for the same
         countable, on the one screen where the player has just lost one. */
      h('div.t-small.birth-cost', OUR_FAULT.includes(job.error)
        ? 'This one is on us — your daily allowance is untouched.'
        : 'This attempt used one of today’s generations.'),
      h('div.birth-actions',
        h('button.btn.primary', { type: 'button', onclick: () => c.go('/create') }, 'Try again', icon('arrow-right')),
        h('button.btn.ghost', { type: 'button', onclick: () => c.go('/live') }, 'Watch the arena')),
      said));
    /* A live region has to be on the page BEFORE it is written into, or the
       announcement is simply the initial content of a new node and is never
       made. One tick is the whole difference. */
    setTimeout(() => { said.textContent = `It did not take shape. ${reason}`; }, 0);
  }
}

/**
 * THE CORNER STOPS COUNTING WHEN THE GENERATION IS OVER.
 *
 * `app.js` builds the my-chip from the session alone: no creature and a job
 * that is `queued` or `running` means BEING BORN with a climbing clock. The
 * session is only re-read every twenty seconds, so a job that has just FAILED
 * left the shell counting up towards a birth for as long as the player stood
 * on the words IT DID NOT TAKE SHAPE — the chrome contradicting the screen it
 * stands over, which is exactly what `adoptCreature` fixes on the branch where
 * things went well. Same fact, arriving on time, on the branch where they did
 * not: `session.job` is finished, so it is no longer a job in flight. The next
 * `refreshSession()` replaces this with the server's own word on it.
 *
 * IT ALSO UNLOCKS THE TWO DOORS. `app.js` sends `#/live` and `#/create` back
 * to `#/birth/:jobId` while a job is queued or running, so with a stale
 * session both of this card's buttons — TRY AGAIN and WATCH THE ARENA — landed
 * back on the failure they were pressed to leave, until the session happened
 * to be re-read. The one screen in the product where the player is already
 * unhappy had no exit for up to twenty seconds.
 */
function dropJob(ctx, job) {
  const s = ctx.store?.session;
  if (!s || !s.job) return;
  ctx.set({ session: { ...s, job: { ...s.job, state: 'failed', error: job?.error || s.job.error || null } } });
}

/**
 * THE CREATURE OUTLIVES THE SCREEN IT WAS BORN ON.
 *
 * `leave()` runs at frame zero of a navigation and `app.js` only then starts
 * the 620 ms cross-fade (its "TEARDOWN IN TWO PHASES" note names this exact
 * screen as the worst case). Destroying the portrait here therefore deleted —
 * `ui/portrait.js` `destroy()` ends with `canvas.remove()` — the creature the
 * player had just watched materialise, one frame into the reveal's own
 * dissolve: what faded out was an empty `.portrait-hold` with its light pool
 * and contact shadow still lit. And the reveal navigates itself (`ctx.go
 * ('/live')` at the end of beat 7), so it was the ordinary path, not an edge.
 *
 * So `leave()` stops the screen from ACTING — the run token, the polling, the
 * orbit, the key handler — and hands the live renderer to `falling`.
 * `dispose()` is the shell's late hook and puts it down; `watchFall()` is the
 * belt to that brace, for a shell that never calls it, and is the same pair
 * `screens/creature.js` uses on the same object. Whichever arrives first, the
 * renderer is destroyed exactly once.
 */
export function leave() {
  gone = true;
  run++;                                  /* any sequence still in flight is now an older run */
  revealing = false;
  busy = false;
  stopPolling();
  stopOrbit();
  if (keys) { removeEventListener('keydown', keys); keys = null; }
  fell();                                 /* an older portrait still fading has had its time */
  if (port) { falling = { p: port, el: rootEl }; watchFall(); }
  port = null;
  rootEl = null;
}

/** The screen contract's late hook: the card is off the page, put the body down. */
export function dispose() { fell(); }

function fell() {
  if (fallTimer) { clearTimeout(fallTimer); fallTimer = null; }
  const going = falling;
  falling = null;
  if (!going) return;
  try { going.p.destroy?.(); } catch { /* a dead handle has nothing to free */ }
}

/*
 * A `WebGPURenderer` is not something to leave running on a guess. The screen
 * element's own removal is the signal; the four-second cap is there because a
 * shell that never removes it — a screen re-entered from the back button, a
 * cross-fade interrupted half-way — must not leak a renderer either.
 */
function watchFall() {
  const at = Date.now();
  const tick2 = () => {
    if (!falling) return;
    if (!falling.el || !falling.el.isConnected || Date.now() - at > 4000) { fell(); return; }
    fallTimer = setTimeout(tick2, 120);
  };
  fallTimer = setTimeout(tick2, 140);
}

function stopPolling() {
  if (poll) { clearInterval(poll); poll = null; }
  if (tick) { clearInterval(tick); tick = null; }
}

function stopOrbit() {
  try { orb?.collapse?.(); } catch { /* nothing to collapse */ }
  const stop = orb;
  orb = null;
  setTimeout(() => { try { stop?.stop?.(); } catch { /* already stopped */ } }, 700);
}

/** Which row of the rail a job is standing on, and how it was decided. */
function stageAt(job) {
  const code = job.stageCode || (job.state === 'queued' ? 'queued' : null);
  let i = STAGES.findIndex(([, codes]) => codes.includes(code));
  let known = i >= 0;
  if (!known) {
    i = STAGES.findIndex(([, , re]) => re.test(String(job.stage || '')));
    known = i >= 0;
  }
  return { i: known ? i : 0, code, known };
}

/**
 * The stage in words — THE RAIL'S WORDS, not the server's sentence.
 *
 * This printed `job.stage` verbatim, and the server's retry sentences then
 * said two things the interface must not say. `body_retry` read "the body did
 * not come out the first time, drawing with another mind": the one thing the
 * product promises the player controls is which mind they chose, and a muted
 * micro-line was telling them it had been swapped. `brain_retry` read "the
 * first attempt failed, trying again" — the same sentence as the note printed
 * eight pixels below it, in a second register.
 *
 * The rail already holds the right words for every code the server sends, and
 * `tools/checkstages.mjs` keeps the two lists in step, so the retry codes are
 * spoken as what they are: the same step, again. The failure itself is named
 * once, in the note. A code the client has never heard of still falls through
 * to the server's own sentence — better an unknown phrase than a wrong one.
 */
function stageLabel(job) {
  const { i, code, known } = stageAt(job);
  if (!known) {
    const said = latinOnly(String(job.stage || ''));
    if (said) return said.toLowerCase();
  }
  return String(code || '').endsWith('_retry') ? `${STAGES[i][0]} again` : STAGES[i][0];
}

async function loadCreature(id) {
  if (!id) return null;
  try {
    const res = await get(`/api/creature/${id}`);
    const c = res?.creature || res || null;
    /* The session's own card carries `rank` alongside the card fields (§8.1);
       this endpoint returns it as a sibling of the card. Folding it in is what
       lets the chrome's chip read `#rank · 1,214 MMR` the instant the reveal
       starts, instead of a card missing the number it is mostly made of. */
    if (c && res?.rank != null && c.rank == null) c.rank = res.rank;
    return c;
  } catch { return null; }
}

/**
 * THE CORNER STOPS SAYING "BEING BORN" WHEN THE SCREEN SAYS "SIGNAL ACQUIRED".
 *
 * `app.js` chooses the chrome's chip from the session alone: a queued or
 * running job means BEING BORN with a clock, a creature means the creature's
 * card. Nothing told it that the job had finished until `refreshSession()` at
 * the very END of the reveal, so for the whole four seconds the product spends
 * revealing a creature the chrome above it insisted the creature was still
 * being made — `SIGNAL ACQUIRED / STONE GOLEM` under `BEING BORN 01:38`.
 *
 * The job is done and the creature is loaded; that is exactly the session
 * `app.js` would have fetched. Patching it here is not optimism, it is the
 * same fact arriving on time — and it turns the reveal into two things landing
 * at once, the card and the corner. `refreshSession()` still runs at the end
 * and replaces this with the server's own word on it.
 *
 * The capture states patch nothing: their session already owns the creature
 * `fixtures()` is drawing (§10), and a debug state persists no state anywhere.
 */
function adoptCreature(ctx, creature) {
  const s = ctx.store?.session;
  if (!s || !creature) return;
  ctx.set({ session: { ...s, creature, job: null } });
}

/* ── the reveal (§6.4, steps 1–7) ────────────────────────────────────────── */

/**
 * Every beat awaits the previous one. The sequence is the point: a creature
 * that simply appears has not been born, it has been rendered.
 *
 * `instant` is the one exception, and it is not a shortcut for the player —
 * it is the screenshot state (§10), which needs the *end* of the sequence in
 * a single frame.
 */
async function reveal(stage, creature, ctx, turn, { freeze = false, instant = false, leaving = null } = {}) {
  const c = creature || {};
  const name = latinOnly(String(c.name || '')) || 'YOUR CREATURE';
  const abilities = Array.isArray(c.abilities) ? c.abilities.slice(0, 3) : [];

  /*
   * THE SCAN IS INSIDE THE PORTRAIT, NOT ACROSS THE PAGE.
   *
   * The sweep used to hang off both sides of its box, which at 390 px meant a
   * blue rule crossing the whole viewport — a line through the chrome, the
   * ground and the creature at once, reading as a rendering fault rather than
   * as a machine looking at a body. It now travels inside `.portrait-hold`,
   * which clips it (`ui/screens/birth.css`): the beam belongs to the specimen.
   *
   * `light` and `ground` are the only frame this gets: a warm pool behind the
   * body and a soft contact shadow under it, so the creature stands on
   * something instead of floating in the middle of an empty screen. Neither
   * draws an edge — this screen has no panels on purpose.
   */
  const box = h('div.portrait-box');
  const hold = h('div.portrait-hold',
    h('div.portrait-light', { 'aria-hidden': 'true' }),
    box,
    h('div.portrait-ground', { 'aria-hidden': 'true' }),
    h('div.portrait-scan', { 'aria-hidden': 'true' }));
  /* The name arrives one letter at a time, which a screen reader would read as
     nine separate updates; it is hidden from the reader and the fact is
     announced once instead, when the creature is actually there. */
  const nameEl = h('div.t-hero.reveal-name', { 'aria-hidden': 'true' });
  const mindEl = h('div.reveal-mind', c.model ? [h('span.t-label', 'Mind'), mindBadge(c.model, { mode: false })] : null);
  const abilityRow = h('div.reveal-abilities');
  /* Three words teach nothing. One line under the row says what the ability
     the player is looking at actually does, and it changes as the tiles land —
     the last one stays through the hold, which is the longest still moment on
     the screen. */
  const blurbEl = h('div.reveal-blurb.t-small', { 'aria-hidden': 'true' });
  const said = h('p.birth-sr', { role: 'status' });

  const view = h('div.birth-reveal',
    h('div.t-state.reveal-word', 'Signal acquired'),
    hold, nameEl, mindEl, abilityRow, blurbEl, said);

  /**
   * ALL THREE TILES ARE BUILT NOW, AND REVEALED ONE PER BEAT.
   *
   * `ui/ability.js` judges a creature's tiles as a row: either every icon is a
   * drawing or the row wears the marks it can always draw. That grouping only
   * holds if the tiles are constructed together — the group settles as soon as
   * every tile it knows about has answered. Built one per 200 ms beat, tile 0's
   * image answered while it was the only member, the group closed, and tiles 1
   * and 2 each became a group of one: a generated icon beside two procedural
   * glyphs, the exact mixed row the grouping exists to prevent. It could not be
   * seen in `birth-reveal.png` either, because the capture builds all three in
   * one pass — so it was reachable on every real birth and on no screenshot.
   *
   * Constructing them here also gives the icons the whole sequence to arrive
   * instead of the 200 ms before their tile is shown.
   */
  const tiles = [0, 1, 2].map((i) => {
    const a = abilities[i] || null;
    return h('div.reveal-ability',
      abilityTile({ creatureId: c.id || null, slot: i, ability: a || {}, size: 56, label: !!a?.name }));
  });

  /**
   * The blurb of the tile that just landed — AND THE TILE IT BELONGS TO.
   *
   * One sentence under three tiles is an orphan: on the desktop capture the
   * line described the third ability and nothing said so, and a kit whose
   * grammar produced two shapes with the same name (`KINETIC LUNGE · DAMAGE`
   * beside `KINETIC LUNGE · STUN`) left the reader with no way to tell which
   * one they had just been told about. The owning tile wears an `--info` ring
   * while its line is up, so the sentence and its subject are one object; the
   * last tile keeps the ring through the final hold, which is where the player
   * actually reads it.
   */
  const showBlurb = (i) => {
    tiles.forEach((t, n) => t.classList.toggle('is-reading', n === i));
    const b = latinOnly(String(abilities[i]?.blurb || ''));
    if (!b) return;
    blurbEl.textContent = clip(b, 120);
    blurbEl.classList.remove('is-in');
    void blurbEl.offsetWidth;             /* restart the fade on a live node */
    blurbEl.classList.add('is-in');
  };

  /*
   * The waiting column is still on screen when there is one: it is mounted
   * beside this view, not replaced by it, and removed once it has faded
   * (`.birth-wait.is-leaving`, `ui/screens/birth.css`). The two share a grid
   * cell, so they overlap instead of stacking.
   */
  if (leaving) stage.appendChild(view);
  else mount(stage, view);
  if (leaving) setTimeout(() => leaving.remove(), calm() ? 0 : 780);

  if (instant) {
    /*
     * THE FROZEN STATE (§10) — every beat's end, composed in one pass.
     *
     * A capture of a timed sequence photographs whatever millisecond it
     * arrives in, which for `?ui=birth-reveal` was an empty stage. So the
     * classes all land at once, the name is set rather than typed, and the
     * tiles are appended without their staggering. `is-frozen`
     * (`ui/screens/birth.css`) pins the transitions at their end and holds
     * the scan line mid-sweep, so the beat that is pure motion is still
     * visible in a still.
     */
    view.classList.add('is-frozen', 'step-word', 'step-shape', 'step-scan', 'step-mind');
    nameEl.textContent = name;
    said.textContent = `${name} is alive.`;
    for (const t of tiles) abilityRow.appendChild(t);
    showBlurb(2);
    /* The renderer wants three.js, a fetched body and a GPU; a headless
       capture may get none of the three. The drawing takes over after four
       seconds so the frame is never empty. */
    const shape = await mountPortrait(box, c, turn, { timeout: 4000 });
    if (stale(turn)) return;
    shape.silhouette(false);
    shape.wire(false);
    return;
  }

  await raf();

  /*
   * THE BODY STARTS BUILDING NOW, NOT AT ITS BEAT.
   *
   * `portrait()` imports three.js, fetches the body's source, builds it and
   * spins up a renderer — a second or two the first time, which is exactly as
   * long as beat 1. Started here it is standing by when beat 2 asks for it, so
   * what fades in is the creature the player just made. Started at beat 2 it
   * held the sequence still on the word for as long as it took, and the timed
   * fallback fired on slow machines: that is how the reveal came to show a
   * drawing of a creature instead of the creature.
   */
  const shaping = mountPortrait(box, c, turn, { timeout: 4500 });

  /* A gesture ends the wait: the first finishes the sequence, the second the
     screen (see `beatclock`). Nothing on screen advertises it — the reveal is
     four seconds long and asks for nothing — but a player who does not want it
     is never trapped in it. */
  const beats = beatclock();
  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
    e.preventDefault();
    beats.skip();
  };
  const onClick = () => beats.skip();
  view.addEventListener('click', onClick);
  addEventListener('keydown', onKey);

  try {
    /* 1 — the word, rising while the orbit is still gathering into its point */
    if (leaving) { await beats.wait(200); if (stale(turn)) return; }
    view.classList.add('step-word');
    await beats.wait(600);
    if (stale(turn)) return;

    /* 2 — a silhouette, nothing more */
    const shape = await shaping;
    if (stale(turn)) return;
    shape.silhouette(true);
    view.classList.add('step-shape');
    await beats.wait(700);
    if (stale(turn)) return;

    /* 3 — the scan sweeps, wireframe, then matter */
    view.classList.add('step-scan');
    await beats.wait(450);
    if (stale(turn)) return;
    shape.wire(true);
    shape.silhouette(false);
    await beats.wait(450);
    if (stale(turn)) return;
    shape.wire(false);
    view.classList.add('step-body');

    /* 4 — the name, letter by letter */
    await typeIn(nameEl, name, 500, turn, beats);
    if (stale(turn)) return;
    said.textContent = `${name} is alive.`;

    /* 5 — whose mind it is */
    view.classList.add('step-mind');
    await beats.wait(300);
    if (stale(turn)) return;

    /* 6 — three abilities, left to right, each one saying what it does.
       The awaited beat IS the stagger: the tiles also carried a CSS
       `animation-delay` of 40 ms each, so the row ran 3 × 200 ms *plus* its
       own ladder and the third tile landed at 800 ms against §6.4's 600. */
    for (let i = 0; i < 3; i++) {
      abilityRow.appendChild(tiles[i]);
      showBlurb(i);
      await beats.wait(200);
      if (stale(turn)) return;
    }

    /* 7 — hold, then the arena. No confirmation button: the creature is alive
       and the next thing that happens to it is a fight. The hold is the only
       still moment the player gets with the thing they made — long enough to
       read the last ability's line and look at the body once more. */
    if (freeze) return;
    await beats.hold(1800);
    if (stale(turn)) return;
    try { await ctx.refreshSession(); } catch { /* the arena will re-read it */ }
    if (stale(turn)) return;
    ctx.set({ live: { phase: 'searching' } });
    ctx.go('/live');
  } finally {
    view.removeEventListener('click', onClick);
    removeEventListener('keydown', onKey);
  }
}

/**
 * The real portrait when there is one, a drawn one when there is not.
 *
 * `ui/portrait.js` renders the actual body; while it cannot (no body, no
 * renderer, a stub) the sequence still has to play, because the sequence is
 * what makes the moment. The stand-in is derived from the creature's id, so
 * the same creature always gets the same shape.
 *
 * NOBODY MAY WALK AWAY FROM A LIVE RENDERER. A portrait takes one to three
 * seconds to build, and `portrait()` hands back a `WebGPURenderer` whose
 * `setAnimationLoop` then draws every frame until something calls `destroy()`.
 * Two ways to end up with one nobody holds: the player leaves while it is
 * building (the old code assigned it to `port` *after* `leave()` had already
 * nulled that field, so the loop ran on a canvas in a removed subtree for the
 * life of the tab), and the `timeout` below giving up on it. Both are handled
 * here, once — `screens/creature.js` makes the same check on the same object.
 */
async function mountPortrait(box, c, turn, { timeout = 0 } = {}) {
  const built = (async () => {
    try { return await portrait(box, { creatureId: c.id || null, bodyRef: c.bodyRef || null, size: c.size || 1 }, { turn: true }); }
    catch { return null; }
  })();

  /* Not a beat: a deadline on a network fetch and a GPU, which reduced motion
     has no opinion about and a skipped sequence cannot hurry. */
  const timer = timeout > 0 ? sleep(timeout).then(() => null) : null;
  const p = timer ? await Promise.race([built, timer]) : await built;

  if (p?.canvas && !stale(turn)) {
    port = p;
    return {
      silhouette: (on) => { try { p.silhouette(on); } catch { /* a stub has no surface to hide */ } },
      wire: (on) => { try { p.wire(on); } catch { /* nor any wires */ } },
    };
  }

  /* Whatever the race left behind — late, or arriving after the player was
     gone — is released as soon as it exists. */
  built.then((late) => {
    if (port === late) port = null;
    try { late?.destroy?.(); } catch { /* a dead handle has nothing to free */ }
  }, () => {});

  /* Only here: no body, no renderer, or one that took too long. The drawing is
     the failure path, never the ordinary one. */
  const el = silhouetteSvg(c.id || c.name || 'airena');
  box.classList.add('is-drawn');
  box.appendChild(el);
  return {
    silhouette: (on) => el.classList.toggle('is-sil', !!on),
    wire: (on) => el.classList.toggle('is-wire', !!on),
  };
}

/**
 * THE RENDERER, FETCHED WHILE THERE IS TIME.
 *
 * Called once per page from the waiting screen: the generation takes minutes
 * and the module it will need takes seconds, so the two overlap instead of
 * queueing. Failures are not interesting here — the reveal asks for the same
 * module again and handles the answer either way.
 */
let warmed = false;
function warmRenderer() {
  if (warmed) return;
  warmed = true;
  import('three').catch(() => { /* the reveal will ask again, and cope */ });
}

/** Letters land one after another; the whole word takes `ms`. */
async function typeIn(el, text, ms, turn, beats) {
  /* Letters arriving one at a time is motion like any other: with the beats
     collapsed the name simply is there. */
  if (calm()) { el.textContent = text; return; }
  const step = Math.max(16, Math.floor(ms / Math.max(1, text.length)));
  el.textContent = '';
  el.classList.add('typing');
  for (const ch of text) {
    if (stale(turn)) return;
    el.textContent += ch;
    await beats.wait(step);
  }
  el.classList.remove('typing');
  el.textContent = text;                  /* a skip lands on the whole word */
}

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ── the stand-in silhouette ─────────────────────────────────────────────── */

function hashOf(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

function rngOf(seed) {
  let s = seed || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * A creature-shaped drawing from an id, for the one case where the body could
 * not be rendered: no source, no renderer, or one that took longer than the
 * sequence could wait.
 *
 * WHY IT WAS REDRAWN. The first version was an ellipse with four triangular
 * spikes, four stick legs ending in circles and a circle for a head — read at
 * review as a child's drawing of a hedgehog, standing in for a creature called
 * CROCODILE at the emotional high point of the whole product. It is a
 * stand-in, and a stand-in is allowed to be plain, but it is not allowed to be
 * comic. So: one weighted body, a wedge head with a jaw, a tapered tail, four
 * thick planted limbs and a low ridge of back plates — the same heavy quadruped
 * grammar the arena's own bodies are built on. Every measurement is drawn from
 * the id, so a creature always gets its own animal, and the same one twice.
 */
function silhouetteSvg(seed) {
  const r = rngOf(hashOf(String(seed)));
  const pick = (a, b) => a + (b - a) * r();
  const f = (n) => n.toFixed(1);

  /* Centred in the 320×260 box with the legs given room: measured, the drawn
     figure spans x 45–265 and y 79–205 across seeds. */
  const cx = 152;
  const cy = 122;
  const half = pick(58, 70);            /* body half-length */
  const hh = pick(23, 30);              /* body half-height */
  const ground = cy + hh + pick(44, 54);

  /* the trunk: heavier at the shoulder than at the hip, like something that
     walks at the front */
  const body = `M${f(cx - half)} ${f(cy + hh * 0.2)}`
    + ` C${f(cx - half * 1.02)} ${f(cy - hh * 0.75)} ${f(cx - half * 0.4)} ${f(cy - hh * 1.12)} ${f(cx + half * 0.08)} ${f(cy - hh * 1.05)}`
    + ` C${f(cx + half * 0.62)} ${f(cy - hh * 0.98)} ${f(cx + half * 0.98)} ${f(cy - hh * 0.72)} ${f(cx + half)} ${f(cy - hh * 0.1)}`
    + ` C${f(cx + half * 1.02)} ${f(cy + hh * 0.72)} ${f(cx + half * 0.55)} ${f(cy + hh * 1.06)} ${f(cx - half * 0.05)} ${f(cy + hh * 1.02)}`
    + ` C${f(cx - half * 0.6)} ${f(cy + hh * 0.98)} ${f(cx - half * 0.98)} ${f(cy + hh * 0.8)} ${f(cx - half)} ${f(cy + hh * 0.2)} Z`;

  /* the head: a wedge, not a ball — a jaw is what makes a shape look like it
     can bite */
  const snout = cx + half + pick(30, 44);
  const brow = cy - hh * pick(0.55, 0.95);
  const chin = cy + hh * pick(0.28, 0.5);
  const head = `M${f(cx + half * 0.72)} ${f(brow - 6)} L${f(snout)} ${f(cy - hh * 0.18)}`
    + ` L${f(snout - 6)} ${f(chin)} L${f(cx + half * 0.66)} ${f(chin + 4)} Z`;
  const jaw = `M${f(snout - 4)} ${f(cy + hh * 0.06)} L${f(cx + half * 0.7)} ${f(cy + hh * 0.14)}`;

  /* the tail: a taper off the hip, drooping or level with the spine */
  const tailLen = pick(52, 76);
  const tailDrop = pick(-14, 16);
  const tail = `M${f(cx - half * 0.86)} ${f(cy - hh * 0.5)}`
    + ` Q${f(cx - half - tailLen * 0.55)} ${f(cy - hh * 0.2 + tailDrop * 0.5)} ${f(cx - half - tailLen)} ${f(cy + tailDrop)}`
    + ` Q${f(cx - half - tailLen * 0.5)} ${f(cy + hh * 0.5 + tailDrop * 0.4)} ${f(cx - half * 0.86)} ${f(cy + hh * 0.55)} Z`;

  /* four planted limbs, front pair heavier */
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const x = cx - half * 0.62 + (half * 1.34 / 3) * i;
    const lean = pick(-6, 6);
    const foot = ground - pick(0, 7);
    const wgt = i > 1 ? pick(7.5, 9) : pick(6, 7.5);
    legs.push(`<path d="M${f(x)} ${f(cy + hh * 0.7)} Q${f(x + lean * 0.5)} ${f((cy + foot) / 2)} ${f(x + lean)} ${f(foot)}" stroke-width="${f(wgt)}" stroke-linecap="round"/>`);
    legs.push(`<path d="M${f(x + lean - 7)} ${f(foot)} L${f(x + lean + 8)} ${f(foot)}" stroke-width="3.4" stroke-linecap="round"/>`);
  }

  /* the ridge: low plates along the spine, never a row of needles */
  const plates = [];
  const n = Math.round(pick(3, 4));
  for (let i = 0; i < n; i++) {
    const x = cx - half * 0.5 + (half * 1.1 / (n - 1 || 1)) * i;
    const w = pick(11, 15);
    const hgt = pick(9, 16) * (1 - Math.abs(i - (n - 1) / 2) / (n + 2));
    const base = cy - hh * (1.0 + 0.04 * i);
    plates.push(`<path d="M${f(x - w)} ${f(base)} Q${f(x - w * 0.3)} ${f(base - hgt)} ${f(x + w * 0.35)} ${f(base - hgt * 0.72)} L${f(x + w)} ${f(base)} Z"/>`);
  }

  const eyeX = cx + half * 0.95;
  const eyeY = cy - hh * 0.42;

  return svg(`<svg class="sil" viewBox="0 0 320 260" width="100%" height="100%" aria-hidden="true">
    <g class="sil-fill" stroke="currentColor" stroke-linejoin="round">
      <path d="${body}"/>
      <path d="${head}"/>
      <path d="${tail}"/>
      ${plates.join('')}
    </g>
    <g class="sil-line" fill="none" stroke="currentColor">
      ${legs.join('')}
      <path d="${jaw}" stroke-width="1.6"/>
      <circle cx="${f(eyeX)}" cy="${f(eyeY)}" r="2.6" stroke-width="1.6"/>
    </g>
  </svg>`);
}
