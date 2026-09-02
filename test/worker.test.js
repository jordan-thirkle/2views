'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers/harness');

/* api/worker.js is the optional public leaderboard endpoint (Cloudflare Worker).
   It uses ES module syntax, so load it by evaluating the file with the export
   rewritten to module.exports; Response/URL/Request are Node globals. */
function loadWorker() {
  const file = path.join(ROOT, 'api', 'worker.js');
  const src = fs.readFileSync(file, 'utf8').replace('export default ', 'module.exports = ');
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', src)(mod, mod.exports);
  return mod.exports;
}

function makeDB(results) {
  const calls = { binds: [], all: 0, run: 0 };
  return {
    DB: {
      prepare() {
        return {
          bind: (...args) => {
            calls.binds = args;
            return {
              all: async () => { calls.all++; return { results: results || [] }; },
              run: async () => { calls.run++; return { success: true }; }
            };
          }
        };
      }
    },
    calls
  };
}

function parse(res) { return res.json(); }

test('GET /scores: mode whitelist, limit clamp, rows, CORS headers', async () => {
  const worker = loadWorker();
  const { DB, calls } = makeDB([{ name: 'a' }]);
  const res = await worker.fetch(new Request('https://lb.test/scores?mode=hack&limit=50000'), { DB });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  const body = await parse(res);
  assert.deepEqual(body, [{ name: 'a' }]);
  assert.equal(calls.all, 1);
  assert.equal(calls.binds[0], 'classic', 'unknown mode falls back to classic');
  assert.equal(calls.binds[1], 100, 'limit clamped to the 100 cap');
});

test('GET /scores defaults and floor for garbage limit', async () => {
  const worker = loadWorker();
  const { DB, calls } = makeDB([]);
  await worker.fetch(new Request('https://lb.test/scores?limit=abc'), { DB });
  assert.equal(calls.binds[1], 25);
  await worker.fetch(new Request('https://lb.test/scores?limit=0'), { DB });
  assert.equal(calls.binds[1], 1, 'limit floored at 1');
});

test('POST /scores: valid entry is clamped and inserted', async () => {
  const worker = loadWorker();
  const { DB, calls } = makeDB();
  const body = {
    name: 'x'.repeat(30), handle: 'h', views: 2e6, likes: -1, combo: 50,
    timeLeftMs: 12345, mode: 'classic', seed: 'ABC123', date: '2026-09-02', at: 0
  };
  const res = await worker.fetch(new Request('https://lb.test/scores', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
  }), { DB });
  assert.equal(res.status, 200);
  assert.deepEqual(await parse(res), { ok: true });
  assert.deepEqual(calls.binds.slice(0, 6), ['x'.repeat(20), 'h', 1000000, 0, 50, 12345]);
});

test('POST /scores rejects bad JSON and zero views', async () => {
  const worker = loadWorker();
  const { DB } = makeDB();
  const bad = await worker.fetch(new Request('https://lb.test/scores', { method: 'POST', body: 'not json' }), { DB });
  assert.equal(bad.status, 400);
  assert.deepEqual(await parse(bad), { error: 'invalid json' });
  const zero = await worker.fetch(new Request('https://lb.test/scores', {
    method: 'POST', body: JSON.stringify({ views: 0 })
  }), { DB });
  assert.equal(zero.status, 400);
  assert.deepEqual(await parse(zero), { error: 'nothing to record' });
});

test('POST /scores: unknown mode and future at clamp to safe values', async () => {
  const worker = loadWorker();
  const { DB, calls } = makeDB();
  const now = Date.now();
  const res = await worker.fetch(new Request('https://lb.test/scores', {
    method: 'POST', body: JSON.stringify({
      mode: 'hack', views: 5, likes: 'many', combo: 'lots',
      timeLeftMs: 'slow', seed: 'abcdefghijklmnop', date: '2099-01-01', at: now + 999999999
    })
  }), { DB });
  assert.equal(res.status, 200);
  const [, , views, likes, combo, timeMs, mode, seed, date, at] = calls.binds;
  assert.equal(mode, 'classic', 'unknown mode falls back to classic');
  assert.equal(views, 5);
  assert.equal(likes, 0, 'non-numeric likes default to 0');
  assert.equal(combo, 0, 'non-numeric combo default to 0');
  assert.equal(timeMs, 0, 'non-numeric timeLeftMs defaults to 0');
  assert.equal(seed, 'abcdefghijkl', 'seed truncated to 12 chars');
  assert.equal(date, '2099-01-01');
  assert.ok(at >= now + 59990 && at <= now + 60100, `future at capped at now+60s (got ${at})`);
});

test('OPTIONS preflight and unknown paths', async () => {
  const worker = loadWorker();
  const opts = await worker.fetch(new Request('https://lb.test/scores', { method: 'OPTIONS' }), { DB: makeDB().DB });
  assert.equal(opts.status, 204);
  assert.equal(opts.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  const nf = await worker.fetch(new Request('https://lb.test/nope'), { DB: makeDB().DB });
  assert.equal(nf.status, 404);
  assert.deepEqual(await parse(nf), { error: 'not found' });
});

test('DB failures surface as a 500 without leaking internals', async () => {
  const worker = loadWorker();
  const boom = {
    DB: { prepare: () => { throw new Error('db down'); } }
  };
  const res = await worker.fetch(new Request('https://lb.test/scores'), boom);
  assert.equal(res.status, 500);
  const body = await parse(res);
  assert.equal(body.error, 'internal');
});
