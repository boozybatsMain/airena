/**
 * WORKER — pairing a colleague's laptop with the arena (docs/REDESIGN.md §6.8).
 *
 * A creature is written by a real model, and somebody pays for every call. The
 * worker is a small program a trusted person runs ON THEIR OWN MACHINE: the
 * generation happens through the Claude they are already signed into, not
 * through the game's server. The server only hands out the job and takes the
 * finished text back.
 *
 * The whole screen exists for six characters. So there is no form here, no
 * settings, no choice: three commands to run, and the code the program will
 * ask for. Everything else is the explanation of why any of this exists.
 *
 * What is deliberately absent: a box around the code. The code is set large on
 * empty ground with one hairline under it — a frame around six characters adds
 * neither legibility nor weight, and takes away both.
 *
 * The route is unlisted (§3): no rail item points here, and nothing in the
 * product links to it. People arrive because they were told to.
 */

import { post, track } from '../lib/api.js';
import { h, mount, clear } from '../lib/dom.js';
import { mmss, latinOnly } from '../lib/format.js';
import { claimSilently } from '../lib/platform.js';

/**
 * The three steps, exactly as a person performs them in their terminal.
 *
 * Commands are given whole and copied with one button: retelling a command in
 * words ("download the worker from the site") is an invitation to mistype a
 * filename and lose half an hour finding out why `node` is complaining about a
 * path that does not exist.
 */
const STEPS = [
  ['Install Claude Code and sign in', 'claude'],
  ['Download the worker', 'curl -fsSL https://airena.genex.technology/worker.mjs -o airena-worker.mjs'],
  ['Run it', 'node airena-worker.mjs'],
];

/* A frozen code for the screenshot states (§10). Six characters, the shape the
   server hands out, and a countdown that never moves. */
const DEMO = { code: 'K7QP24', secs: 598 };

/* The code's countdown and the "copied" labels that have to be put back live
   on the module, not in a closure: `leave()` is a file export and has nowhere
   else to take them from. */
let tick = null;
const timers = new Set();

function later(fn, ms) {
  const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
  return t;
}

function stop() {
  if (tick) { clearInterval(tick); tick = null; }
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

export async function enter(root, args, ctx) {
  /* Either the code with its countdown, or an honest answer about why there
     is no code. One box, repainted; never two competing explanations. */
  const box = h('div.wcode');

  mount(root, h('div.doc', h('div.doc-inner',
    h('div.worker', { role: 'main' },
      h('section.glass.panel.worker-panel',
        h('div.worker-head',
          h('div.t-label', 'Unlisted page'),
          h('h1.t-title.worker-h', 'Worker on your own laptop'),
          /* "takes the building of creatures on itself" is a calque — the
             construction exists in Russian and in no English sentence anybody
             says out loud. The verb is the point: the program BUILDS creatures,
             and it does it there, on the reader's machine. */
          h('p.t-body.worker-lede',
            'The worker is a small program that runs on your laptop and builds creatures '
            + 'there. The mind stays yours: it works through the Claude you are already '
            + 'signed into, not through the server.')),

        h('div.worker-grid',
          h('div.worker-col',
            h('div.label-line.wsec', h('div.t-label', 'Three steps')),
            h('ol.wsteps', STEPS.map(([title, cmd], i) => step(i + 1, title, cmd))),
            h('p.t-small.whint',
              /*
               * THE POINTER NAMES THE LABEL, NOT A DIRECTION.
               *
               * The order on screen repeats the order in the terminal —
               * installed, downloaded, run, and right there the program asks
               * for the code. But where the code sits depends on the width:
               * to the right of the steps when there is room, under them when
               * there is not. "Above" or "below" would be a lie on one of the
               * two, so the sentence points at the heading instead, which is
               * in the same place on both.
               */
              'The program will ask for a code. Type the one under PAIRING CODE.')),

          h('div.worker-col',
            h('div.label-line.wsec', h('div.t-label', 'Pairing code')),
            box,
            h('div.note.wnote',
              'Access to Claude never leaves your laptop: Airena does not see and does not '
              + 'store your login or your key. The program only runs the ',
              h('code.mono', 'claude'),
              ' you are already signed into, and sends the finished text back — nothing else.'))),

        h('div.hstack.gap3.wfoot',
          h('a.btn', { href: '#/live' }, 'Back to the arena')))))));

  const dbg = ctx.store.debug;
  if (dbg === 'worker-code') paintCode(DEMO.code, DEMO.secs, true);
  else if (dbg === 'worker-stale') paintStale();
  else if (dbg === 'worker-denied') paintDeny({ status: 403, code: 'not_allowed' }, false);
  else if (dbg === 'worker-guest') paintDeny({ status: 403, code: 'not_allowed' }, true);
  else if (dbg === 'worker-error') paintDeny({ code: 'offline' }, false);
  else await start();

  /** One step: the number, what it does, and the whole command with a copy button. */
  function step(n, title, cmd) {
    const copy = h('button.btn.ghost.small.wcopy', { type: 'button' }, 'Copy');
    copy.addEventListener('click', async () => {
      const ok = await copyText(cmd);
      flash(copy, ok ? 'Copied' : 'Could not copy', 'Copy', ok);
    });
    return h('li.wstep',
      h('div.n.circle', String(n)),
      h('div.b',
        h('div.wstep-t', title),
        h('div.wcmd', h('code.mono.grow', cmd), copy)));
  }

  /**
   * Ask for a code.
   *
   * The request always goes out, even on a guest session: who may run a
   * worker is known to the SERVER — the list is kept by hand and changes by
   * editing one variable — and a second, client-side answer to the same
   * question would disagree with the first the moment the list changes. The
   * session below is read for exactly one thing: to tell two different people
   * apart behind one server refusal.
   */
  async function start() {
    stop();
    mount(box,
      h('div.t-small', 'Asking for a code'),
      h('div.skel.wskel'));
    try {
      const r = await post('/api/worker/pair/start', {});
      paintCode(String(r?.code || ''), Number(r?.expiresInSec) || 0, false);
    } catch (e) {
      paintDeny(e, !!ctx.store.session?.guest);
    }
  }

  function paintCode(code, secs, frozen) {
    clear(box);
    if (!code) { paintDeny({ code: 'no_code', message: 'The server sent an empty code.' }, false); return; }

    /*
     * THE BUTTON IS THE INSTRUCTION.
     *
     * This line used to read "Click the code to copy it" — directly above a
     * button labelled COPY CODE, on a screen where each of the three steps
     * already carries its own COPY. Three ways to say one thing is not
     * helpfulness; it is a screen that does not trust its own controls.
     *
     * The element stays, blank, because it is where "Copied" appears when the
     * code itself is clicked: a feedback slot that only exists once there is
     * feedback pushes the footer down at the moment the reader is watching it.
     * A non-breaking space holds the line box and prints nothing.
     */
    const HINT = '\u00A0';
    const hint = h('div.t-small.whint2', HINT);

    const big = h('div.t-state.wbig', {
      role: 'button',
      tabindex: '0',
      title: 'Click to copy',
      onclick: async () => {
        const ok = await copyText(code);
        flash(hint, ok ? 'Copied' : 'Could not copy — select the code and copy it by hand', HINT, ok);
      },
    }, code);
    big.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); big.click(); } });

    const cd = h('div.t-label.wtimer');
    const copy = h('button.btn.small.wcopy', { type: 'button' }, 'Copy code');
    copy.addEventListener('click', async () => {
      const ok = await copyText(code);
      flash(copy, ok ? 'Copied' : 'Could not copy', 'Copy code', ok);
    });

    box.appendChild(h('div.wcode-in', big, h('div.wrule'), hint));
    box.appendChild(h('div.hstack.gap4.wcode-foot', cd, copy));

    /* Counted from the moment of the answer, not from the tick: the tab can be
       pushed into the background where intervals are throttled, and a
       "minus one per tick" counter would drift from the real deadline by
       exactly the time spent elsewhere. */
    const until = Date.now() + secs * 1000;
    const paint = () => {
      const left = frozen ? secs * 1000 : until - Date.now();
      if (left <= 0) { stop(); paintStale(); return; }
      cd.textContent = `Expires in ${mmss(left)}`;
      cd.classList.toggle('soon', left < 60_000);
    };
    paint();
    if (!frozen) tick = setInterval(paint, 1000);
  }

  /** Time is up. The code disappears whole: six dead characters are worse than empty space. */
  function paintStale() {
    mount(box,
      h('div.t-body', 'That code has expired — they are short-lived on purpose.'),
      h('div.hstack.wcode-foot', h('button.btn', { type: 'button', onclick: start }, 'Get a new code')));
  }

  /**
   * Why there is no code — in three different answers.
   *
   * "Not on the list" is not a breakage but a normal answer, and it is not
   * painted in alarm colour: that is the answer almost everyone who opens this
   * page will get. The alarm colour stays for the one case where something
   * actually broke.
   *
   * A GUEST IS TOLD APART FROM "NOT ON THE LIST" BY THE SESSION, NOT BY THE
   * RESPONSE CODE. The server answers `not_allowed` to both — and that is
   * true: the list is kept by account, and a guest has no account, so it
   * cannot be on the list. But their next step is the opposite: one needs the
   * platform to name them, the other needs a person to add them by hand. One
   * text for both would send half the readers the wrong way.
   */
  function paintDeny(e, guest) {
    clear(box);
    const closed = e?.status === 403 || e?.code === 'not_allowed';
    /* 401 barely reaches here — the server raises a guest silently for any
       browser session — but a session can be revoked, and then this is the
       answer. */
    const nameless = e?.status === 401 || e?.code === 'bad_token' || e?.code === 'guest'
      || (closed && guest);

    if (nameless) {
      const why = h('div.t-small.wwhy');
      const bind = h('button.btn.primary', { type: 'button' }, 'Link my account');
      bind.addEventListener('click', async () => {
        bind.disabled = true;
        bind.textContent = 'Asking the platform';
        clear(why);
        if (await claimSilently(post, ctx.refreshSession)) { await start(); return; }
        bind.disabled = false;
        bind.textContent = 'Link my account';
        why.textContent = 'The platform did not name you. Open Airena from its gallery under '
          + 'your own account — nobody signs in here, and we hold no passwords of our own.';
      });
      box.appendChild(h('div.t-body',
        'The code is given to an account, not to a tab: the server has to know whose '
        + 'machine the building goes to. It knows you as a guest.'));
      box.appendChild(h('div.hstack.wcode-foot', bind));
      box.appendChild(why);
      return;
    }

    if (closed) {
      /* "raise a worker" is not what anybody does to a program, and "the
         author" is a third person who appears nowhere else in the product —
         every other refusal here is written by "we". The list is still kept by
         hand; the hand now belongs to the same voice as the rest of the copy. */
      box.appendChild(h('div.t-body',
        'This account is not on the list of people who can run a worker. The list is '
        + 'short and kept by hand: we add people one at a time. Nothing is broken — '
        + 'codes are simply not given to accounts outside the list.'));
      box.appendChild(h('div.t-small.wwhy',
        'It does not get in the way of playing. A worker is only for someone lending '
        + 'the game their own mind.'));
      return;
    }

    box.appendChild(h('div.t-body.wbad',
      e?.code === 'offline'
        ? 'The server is not answering. There is no code — that is all that happened; try again in a minute.'
        /* The server's refusals are whole sentences now (`http.js` `fail`), so
           this one stops swallowing them into a clause of its own. */
        : `No code was issued. ${latinOnly(e?.message) || 'The server answered with an error.'}`));
    box.appendChild(h('div.hstack.wcode-foot', h('button.btn', { type: 'button', onclick: start }, 'Try again')));
    /* The event name comes from the server's closed dictionary (`analytics.js`):
       an event that is not there is rejected silently, and the measurement
       would have been invented. */
    track('error_shown', { code: e?.code || 'worker', screen: 'worker' });
  }
}

export function leave() {
  stop();
}

/**
 * A label for a second and a half, then back — otherwise "copied" has nowhere
 * to go. A refusal is coloured amber, not green: the same colour for "it
 * worked" and "it did not" is a confirmation that confirms anything.
 */
function flash(el, text, back, good) {
  el.textContent = text;
  el.classList.toggle('ok', !!good);
  el.classList.toggle('bad', !good);
  later(() => { el.textContent = back; el.classList.remove('ok', 'bad'); }, 1600);
}

/**
 * Copy — with a fallback.
 *
 * The game lives inside the platform's iframe, and `navigator.clipboard` is not
 * always reachable in a frame: the `clipboard-write` permission is granted by
 * the parent and we cannot influence that. So there is a second path through a
 * hidden field, and a third — tell the truth and offer to select it by hand.
 * Copying nothing silently is the worst of the three, because the person walks
 * away with an empty buffer and the certainty that they have the code.
 *
 * Returns `true` only when the copy actually happened. The answer is awaited:
 * saying "copied" without waiting for the clipboard's refusal is lying to
 * exactly the person for whom copying does not work.
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* the frame was not given permission — fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch { return false; }
}
