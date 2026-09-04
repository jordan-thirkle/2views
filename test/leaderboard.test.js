'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/harness');

function result(over) {
  return Object.assign({
    mode: 'classic', seedCode: 'ABC123', views: 50, likes: 3,
    bestCombo: 2, timeLeftSec: 12.5, win: false
  }, over);
}

test('submit records a clamped entry, bests, run log and banked impressions', () => {
  const app = loadApp();
  const entry = app.V2.leaderboard.submit(result({ views: 50 }));
  assert.deepEqual(entry, {
    name: 'you', handle: '@you', views: 50, likes: 3, combo: 2,
    timeLeftMs: 12500, mode: 'classic', seed: 'ABC123',
    date: app.V2.rng.dailyKey(), at: entry.at
  });
  assert.ok(Number.isInteger(entry.at));
  const s = app.V2.store.state;
  assert.deepEqual(s.lists.classic, [entry]);
  assert.equal(s.bests.classic, 50);
  assert.equal(s.balance, 50);
  assert.equal(s.totalEarned, 50);
  assert.equal(s.runs.length, 1);
  assert.deepEqual(s.runs[0], { mode: 'classic', views: 50, likes: 3, combo: 2, win: false, at: entry.at });
});

test('bests only move upward; balance banks only non-negative views', () => {
  const app = loadApp();
  app.V2.leaderboard.submit(result({ views: 60 }));
  app.V2.leaderboard.submit(result({ views: 20 }));
  app.V2.leaderboard.submit(result({ views: -5 }));
  assert.equal(app.V2.store.state.bests.classic, 60);
  assert.equal(app.V2.store.state.balance, 80);
  assert.equal(app.V2.store.state.totalEarned, 80);
  assert.deepEqual(app.V2.store.state.lists.classic.map((e) => e.views), [60, 20, 0]);
});

test('entryFrom clamps profile and stat fields', () => {
  const app = loadApp();
  app.V2.store.state.profile.name = 'x'.repeat(40);
  const e = app.V2.leaderboard.submit(result({
    views: 2e6, likes: -3, bestCombo: 5000, timeLeftSec: 1.234
  }));
  assert.equal(e.name.length, 20);
  assert.equal(e.views, 1000000);
  assert.equal(e.likes, 0);
  assert.equal(e.combo, 999);
  assert.equal(e.timeLeftMs, 1234);
  const badInts = app.V2.leaderboard.submit(result({ views: 'abc', likes: 'xyz', bestCombo: 'q' }));
  assert.equal(badInts.views, 0);
  assert.equal(badInts.likes, 0);
  assert.equal(badInts.combo, 0);
});

test('leaderboards are capped at 50 per key, best first by views then likes', () => {
  const app = loadApp();
  for (let i = 1; i <= 60; i++) { app.V2.leaderboard.submit(result({ views: i, likes: i % 5 })); }
  const list = app.V2.store.state.lists.classic;
  assert.equal(list.length, 50);
  assert.equal(list[0].views, 60);
  assert.equal(list[list.length - 1].views, 11);
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    assert.ok(a.views > b.views || (a.views === b.views && a.likes >= b.likes), 'sorted desc');
  }
});

test('daily boards key by the date, challenge boards by seed code', () => {
  const app = loadApp();
  const dk = app.V2.rng.dailyKey();
  app.V2.leaderboard.submit(result({ mode: 'daily', seedCode: 'daily' }));
  assert.equal(app.V2.store.state.lists.daily[dk].length, 1);
  app.V2.leaderboard.submit(result({ mode: 'challenge', seedCode: 'CH1' }));
  app.V2.leaderboard.submit(result({ mode: 'challenge', seedCode: 'CH1' }));
  app.V2.leaderboard.submit(result({ mode: 'challenge', seedCode: 'CH2' }));
  assert.equal(app.V2.store.state.lists.challenge.CH1.length, 2);
  assert.equal(app.V2.store.state.lists.challenge.CH2.length, 1);
  assert.equal(app.V2.store.state.lists.classic.length, 0);
});

test('run log is capped at 100 entries', () => {
  const app = loadApp();
  for (let i = 0; i < 105; i++) { app.V2.leaderboard.submit(result({ views: i })); }
  assert.equal(app.V2.store.state.runs.length, 100);
  assert.equal(app.V2.store.state.runs[0].views, 104);
});

test('local top() maps ranked rows with rank and source', async () => {
  const app = loadApp();
  app.V2.leaderboard.submit(result({ views: 10 }));
  app.V2.leaderboard.submit(result({ views: 20 }));
  const rows = await app.V2.leaderboard.top('classic', null, 25);
  assert.deepEqual(rows, [
    { rank: 1, source: 'local', entry: rows[0].entry },
    { rank: 2, source: 'local', entry: rows[1].entry }
  ]);
  assert.equal(rows[0].entry.views, 20);
});

test('top() merges remote rows first and dedupes identical local entries', async () => {
  const app = loadApp();
  app.V2.config.LEADERBOARD_API = 'https://lb.test';
  const me = app.V2.leaderboard.submit(result({ views: 30, likes: 4 }));
  const apiCalls = [];
  app.w.fetch = async (url, init) => {
    apiCalls.push([url, init]);
    if (init && init.method === 'POST') { return { ok: true, json: async () => ({ ok: true }) }; }
    // remote board: a top row plus an entry identical to the local one (same key)
    return { ok: true, json: async () => [
      { name: 'glob', handle: '@g', views: 99, likes: 1, at: 1 },
      { name: me.name, handle: me.handle, views: me.views, likes: me.likes, at: me.at }
    ] };
  };
  const rows = await app.V2.leaderboard.top('classic', null, 5);
  assert.equal(rows[0].source, 'remote');
  assert.equal(rows[0].entry.name, 'glob');
  assert.equal(apiCalls.length, 1, 'one GET, no POST from top()');
  assert.ok(apiCalls[0][0].startsWith('https://lb.test/scores?mode=classic&limit=5'));
  const keys = rows.map((r) => r.entry.name + ':' + r.entry.views + ':' + r.entry.at);
  assert.equal(new Set(keys).size, keys.length, 'no duplicated keys in merged view');
  assert.equal(rows.length, 2, 'identical local entry not duplicated');
});

test('remoteSubmit POSTs the entry when the API is configured, silently skips otherwise', async () => {
  const app = loadApp();
  let posted = null;
  app.V2.config.LEADERBOARD_API = 'https://lb.test';
  app.w.fetch = async (url, init) => { posted = [url, init]; return { ok: true, json: async () => ({}) }; };
  app.V2.leaderboard.submit(result({ views: 7 }));
  assert.equal(posted[0], 'https://lb.test/scores');
  assert.equal(posted[1].method, 'POST');
  assert.equal(JSON.parse(posted[1].body).views, 7);

  const app2 = loadApp(); // API unset
  app2.w.fetch = () => { throw new Error('must not fetch'); };
  app2.V2.leaderboard.submit(result({ views: 7 }));
});
