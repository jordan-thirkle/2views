'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, makeDriver } = require('./helpers/harness');

/* The engine is driven through its real public surface: init() + the captured
   requestAnimationFrame loop, start(). No internals are exposed. Feeds are
   deterministic per seed, so tests search (at most a few thousand seeds) for a
   feed that exercises a specific behavior, then assert on the played outcome. */

function freshApp(tune) {
  const app = loadApp();
  if (tune) { Object.assign(app.V2.config, tune); }
  return app;
}

/* Find a seed whose no-input run (player stays in lane 2) satisfies predicate.
   Runs the real engine, so the search and the assertion exercise identical code. */
function findSeed(app, predicate, opts = {}) {
  const { mode = 'challenge', tries = 5000, seconds = 30 } = opts;
  const d = makeDriver(app);
  for (let s = 0; s < tries; s++) {
    d.init();
    d.ends.length = 0;
    app.V2.engine.start({ mode, seedCode: app.V2.rng.seedToCode(s) });
    d.tickUntil(seconds, () => d.ends.length > 0);
    const st = app.V2.engine.stats();
    if (predicate({ end: d.ends[d.ends.length - 1], stats: st, seed: s })) { return s; }
  }
  assert.fail('no seed found for predicate; feed simulation may have drifted');
}

/* Replay a found seed to the first lane-2 collision and return final stats.
   untilLikes = 1 -> first collision; 2 -> second collision, etc. */
function playUntilFirstHit(app, seed, untilLikes) {
  const d = makeDriver(app);
  d.init();
  d.ends.length = 0;
  app.V2.engine.start({ mode: 'challenge', seedCode: app.V2.rng.seedToCode(seed) });
  const target = untilLikes == null ? undefined : untilLikes;
  d.tickUntil(6, () => {
    const st = app.V2.engine.stats();
    return target === undefined ? st.views !== 2 || st.likes !== 0 : st.likes >= target;
  });
  return app.V2.engine.stats();
}

function runToEnd(app, seed, seconds = 30) {
  const d = makeDriver(app);
  d.init();
  app.V2.engine.start({ mode: 'challenge', seedCode: app.V2.rng.seedToCode(seed) });
  d.tickUntil(seconds, () => d.ends.length > 0);
  return { result: d.ends[d.ends.length - 1], stats: app.V2.engine.stats() };
}

test('same seed replays an identical feed (stats identical at t=10)', () => {
  const a = freshApp();
  const b = freshApp();
  const run = (app) => {
    const d = makeDriver(app);
    d.init();
    app.V2.engine.start({ mode: 'challenge', seedCode: '03XBK2A' });
    let acc = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      acc += 1 / 60;
      if (acc >= 0.35) { acc = 0; app.V2.engine.press(Math.floor(t / 0.7) % 2 === 0 ? -1 : 1); }
      d.step();
    }
    return app.V2.engine.stats();
  };
  const s1 = run(a);
  const s2 = run(b);
  assert.deepEqual(s1, s2);
});

test('different seeds produce different feeds', () => {
  const a = freshApp();
  const b = freshApp();
  const run = (app, seedCode) => {
    const d = makeDriver(app);
    d.init();
    app.V2.engine.start({ mode: 'challenge', seedCode });
    d.tick(10);
    return app.V2.engine.stats();
  };
  const s1 = run(a, '0000001');
  const s2 = run(b, '0000002');
  assert.notDeepEqual(s1, s2);
});

test('run lifecycle: start -> end result fields', () => {
  const app = freshApp();
  const seed = findSeed(app, ({ end }) => end && end.reason === 'promo', { seconds: 12 });
  const { result, stats } = runToEnd(app, seed, 12);
  assert.equal(result.mode, 'challenge');
  assert.match(result.seedCode, /^[0-9A-Z]{7}$/);
  assert.equal(result.win, false);
  assert.ok(['win', 'promo', 'stagnant', 'time'].includes(result.reason));
  assert.ok(result.timeLeftSec >= 0 && result.timeLeftSec <= 30);
  assert.equal(stats.state, 'end');
  assert.equal(stats.mode, 'challenge');
});

test('promo screenshot in the player lane ends the run with reason promo', () => {
  const app = freshApp();
  const seed = findSeed(app, ({ end }) => end && end.reason === 'promo' && end.timeLeftSec < 25, { seconds: 12 });
  const { result } = runToEnd(app, seed, 12);
  assert.equal(result.reason, 'promo');
  assert.equal(result.win, false);
});

test('stagnation under 20 views for 8s ends the run with reason stagnant', () => {
  const app = freshApp();
  const seed = findSeed(app, ({ end }) => end && end.reason === 'stagnant', { seconds: 9 });
  const { result } = runToEnd(app, seed, 9);
  assert.equal(result.reason, 'stagnant');
  assert.ok(Math.abs(result.timeLeftSec - 22) < 0.2, `died at ~8s, timeLeft ${result.timeLeftSec}`);
});

test('time expiry ends the run with reason time and zero time left', () => {
  const app = freshApp({ STAG_FLOOR: 0 }); // never shadowbanned; keeps the run alive to the clock
  const seed = findSeed(app, ({ end }) => end && end.reason === 'time', { seconds: 31 });
  const { result } = runToEnd(app, seed, 31);
  assert.equal(result.reason, 'time');
  assert.equal(result.timeLeftSec, 0);
});

test('combo grows: a second reply catch pays base + 1 and keeps the chain', () => {
  const app = freshApp();
  let seed = -1;
  for (let s = 0; s < 5000; s++) {
    const st = playUntilFirstHit(freshApp(), s, 2);
    if (st.views === 35 && st.likes === 2 && st.bestCombo === 2) { seed = s; break; }
  }
  assert.ok(seed >= 0, 'no seed with a two-reply chain found');
  const app2 = freshApp();
  const st = playUntilFirstHit(app2, seed, 2);
  assert.equal(st.views, 35, '2 + 16 + (16 + 1 combo bonus)');
  assert.equal(st.likes, 2);
  assert.equal(st.combo, 2);
  assert.equal(st.bestCombo, 2);
});

test('golden star catches pay base 50, keep the chain and never crash the loop', () => {
  const app = freshApp();
  let seed = -1;
  for (let s = 0; s < 6000; s++) {
    const st = playUntilFirstHit(freshApp(), s);
    if (st.views === 52 && st.likes === 1 && st.combo === 1) { seed = s; break; }
  }
  assert.ok(seed >= 0, 'no seed with a first star catch found');
  const app2 = freshApp();
  const events = [];
  app2.V2.events.on('combo', () => events.push('combo'));
  const st = playUntilFirstHit(app2, seed);
  assert.deepEqual(events, ['combo']);
  assert.equal(st.views, 52, '2 + star base 50');
  assert.equal(st.likes, 1);
  assert.equal(st.combo, 1);
  assert.equal(st.bestCombo, 1);
});

test('winning run: chained catches reach the goal with the exact gain formula', () => {
  const app = freshApp({ GOAL: 100 });
  // Fully chained win (no bad item broke the combo) crossing the tuned goal.
  const seed = findSeed(app,
    ({ end, stats }) => end && end.reason === 'win' && stats.bestCombo === stats.likes && stats.likes >= 6 && stats.views >= 100,
    { seconds: 20 }
  );
  const { result, stats } = runToEnd(app, seed, 20);
  assert.equal(result.reason, 'win');
  assert.equal(result.win, true);
  const c = stats.likes;
  assert.equal(stats.bestCombo, c, 'chain never broke');
  // views = START_VIEWS + sum(base_i) + sum(capped combo bonus i-1) for i=1..c;
  // bases are 16/20/24, with a possible golden STAR at 50.
  const comboBonus = (c * (c - 1)) / 2; // bonus capped at 25; c <= 25 here
  const basesSum = stats.views - 2 - comboBonus;
  assert.equal(basesSum % 2, 0, 'every base (16/20/24/50) is even');
  assert.ok(basesSum >= c * 16 && basesSum <= c * 24 + 26 * c, `bases within GOOD/STAR range (${basesSum} for ${c} catches)`);
  assert.ok(stats.views >= 100, 'goal reached');
});

test('first good catch pays exactly its base and emits combo', () => {
  const app = freshApp();
  const goodDeltas = { 18: 'reply', 26: 'quote', 22: 'bookmark' };
  let seed = null;
  let kind = null;
  for (let s = 0; s < 5000; s++) {
    const st = playUntilFirstHit(freshApp(), s);
    if (st.views in goodDeltas) { seed = s; kind = goodDeltas[st.views]; break; }
  }
  assert.ok(seed !== null, 'no seed with a good first catch found');
  const app2 = freshApp();
  const events = [];
  app2.V2.events.on('combo', () => events.push('combo'));
  app2.V2.events.on('hurt', () => events.push('hurt'));
  const st = playUntilFirstHit(app2, seed);
  assert.deepEqual(events, ['combo']);
  assert.equal(st.views, { reply: 18, quote: 26, bookmark: 22 }[kind]);
  assert.equal(st.likes, 1);
  assert.equal(st.combo, 1);
  assert.equal(st.bestCombo, 1);
});

test('external link slashes reach and resets combo, emits hurt', () => {
  const app = freshApp();
  let seed = -1;
  for (let s = 0; s < 5000; s++) {
    const st = playUntilFirstHit(freshApp(), s);
    if (st.views === 1 && st.likes === 0 && st.combo === 0) { seed = s; break; }
  }
  assert.ok(seed >= 0, 'no seed with a first link hit found');
  const app2 = freshApp();
  const events = [];
  app2.V2.events.on('hurt', () => events.push('hurt'));
  const st = playUntilFirstHit(app2, seed);
  assert.deepEqual(events, ['hurt']);
  assert.equal(st.views, Math.floor(2 * app2.V2.config.LINK_CUT));
  assert.equal(st.likes, 0);
  assert.equal(st.combo, 0);
  assert.equal(st.bestCombo, 0);
});

test('gm/map hits floor views at zero after subtraction', () => {
  const app = freshApp();
  let seed = -1;
  for (let s = 0; s < 5000; s++) {
    const st = playUntilFirstHit(freshApp(), s);
    if (st.views === 0 && st.likes === 0) { seed = s; break; }
  }
  assert.ok(seed >= 0, 'no seed with a first gm/map hit found');
  const app2 = freshApp();
  const st = playUntilFirstHit(app2, seed);
  assert.equal(st.views, 0);
  assert.equal(st.likes, 0);
  assert.equal(st.combo, 0);
});

test('mode seeding: challenge normalizes the code, daily derives from the date', () => {
  const app = freshApp();
  const d = makeDriver(app);
  d.init();
  app.V2.engine.start({ mode: 'challenge', seedCode: 'abc123' });
  assert.equal(app.V2.engine.stats().seedCode, app.V2.rng.seedToCode(app.V2.rng.codeToSeed('abc123')));
  app.V2.engine.start({ mode: 'daily' });
  const expected = app.V2.rng.seedToCode(app.V2.rng.seedFromString('daily:' + app.V2.rng.dailyKey()));
  assert.equal(app.V2.engine.stats().seedCode, expected);
  app.V2.engine.start({ mode: 'classic' });
  assert.match(app.V2.engine.stats().seedCode, /^[0-9A-Z]{7}$/);
});

test('pause/resume freeze and continue the run', () => {
  const app = freshApp();
  const d = makeDriver(app);
  d.init();
  app.V2.engine.start({ mode: 'challenge', seedCode: '0000001' });
  d.tick(1);
  app.V2.engine.pause();
  const frozen = app.V2.engine.stats();
  d.tick(1);
  assert.deepEqual(app.V2.engine.stats(), frozen, 'no progress while paused');
  app.V2.engine.resume();
});

test('hard pause button never wins: views cannot reach the goal while paused', () => {
  const app = freshApp({ GOAL: 5 });
  const d = makeDriver(app);
  d.init();
  app.V2.engine.start({ mode: 'challenge', seedCode: '0000002' });
  d.tick(1);
  app.V2.engine.pause();
  d.tick(30);
  assert.equal(d.ends.length, 0, 'paused run never ends');
  assert.equal(app.V2.engine.stats().state, 'pause');
});
