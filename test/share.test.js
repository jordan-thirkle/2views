'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/harness');

test('challenge links parse out seed, score and challenger name', () => {
  const app = loadApp({ location: { hash: '#c=03XBK2A&s=1248&n=Ada%20Lovelace' } });
  const c = app.V2.share.parseChallenge();
  assert.equal(c.seedCode, '03XBK2A');
  assert.equal(c.seed, app.V2.rng.codeToSeed('03XBK2A'));
  assert.equal(c.score, 1248);
  assert.equal(c.name, 'Ada Lovelace');
});

test('parseChallenge normalizes case, handles missing parts and unknown hash', () => {
  const app = loadApp({ location: { hash: '#c=abc123' } });
  const c = app.V2.share.parseChallenge();
  assert.equal(c.seedCode, 'ABC123');
  assert.equal(c.score, null);
  assert.equal(c.name, null);

  const app2 = loadApp({ location: { hash: '#/game' } });
  assert.equal(app2.V2.share.parseChallenge(), null);

  const app3 = loadApp({ location: { hash: '#/leaderboard#c=ZZZZZZZ&s=0' } });
  const c3 = app3.V2.share.parseChallenge();
  assert.equal(c3.seedCode, 'ZZZZZZZ');
  assert.equal(c3.score, 0, 'score 0 is a real score, not null');
});

test('challengeURL embeds the seed and optional score', () => {
  const app = loadApp();
  assert.equal(
    app.V2.share.challengeURL('03XBK2A', 1248),
    'https://example.test/index.html#c=03XBK2A&s=1248'
  );
  assert.equal(
    app.V2.share.challengeURL('03XBK2A', null),
    'https://example.test/index.html#c=03XBK2A'
  );
});

test('seed -> challengeURL -> parseChallenge round-trips', () => {
  const app = loadApp();
  const seed = 123456789;
  const code = app.V2.rng.seedToCode(seed);
  const url = app.V2.share.challengeURL(code, 555);
  const hash = url.slice(url.indexOf('#'));
  const app2 = loadApp({ location: { hash } });
  const c = app2.V2.share.parseChallenge();
  assert.equal(c.seedCode, code);
  assert.equal(c.seed, seed);
  assert.equal(c.score, 555);
});

test('intentURL encodes the share text', () => {
  const app = loadApp();
  const u = app.V2.share.intentURL('hi & there?');
  assert.equal(u, 'https://x.com/intent/post?text=' + encodeURIComponent('hi & there?'));
});

test('resultText describes wins and losses with feed id', () => {
  const app = loadApp();
  const win = app.V2.share.resultText({ win: true, views: 1000, bestCombo: 4, likes: 3, mode: 'classic', seedCode: 'ABC123' });
  assert.match(win, /^My last post went from 2 views to 1,000 in 30s\./);
  assert.match(win, /Best combo x4, 3 likes\./);
  assert.match(win, /Feed #ABC123\./);
  assert.ok(win.endsWith('Can you beat that? #2Views'));

  const app2 = loadApp();
  const lose = app2.V2.share.resultText({ win: false, views: 4, bestCombo: 0, likes: 0, mode: 'daily', seedCode: 'D' });
  assert.match(lose, /stalled at 4 views\./);
  assert.match(lose, new RegExp('Daily feed ' + app2.V2.rng.dailyKey() + '\\.'));
});

test('copy() uses the clipboard API when available and toasts', async () => {
  const app = loadApp({ navigator: { clipboard: { writeText: async (t) => { app.__copied = t; } } } });
  app.V2.share.copy('the text', 'Copied OK.');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(app.__copied, 'the text');
  assert.deepEqual(app.toasts, ['Copied OK.']);
});

test('copy() falls back to the textarea path without the clipboard API', () => {
  const app = loadApp(); // clipboard undefined
  let appended = 0;
  app.w.document.body.appendChild = () => { appended++; };
  app.V2.share.copy('fallback text', 'Done.');
  assert.equal(appended, 1);
  assert.deepEqual(app.toasts, ['Done.']);
});

test('nativeShare falls back to the X intent when the Web Share API is missing', () => {
  const app = loadApp(); // no navigator.share
  let opened = null;
  app.w.open = (u, t, f) => { opened = [u, t, f]; };
  app.V2.share.nativeShare({ win: true, views: 5, bestCombo: 1, likes: 1, mode: 'classic', seedCode: 'A' });
  assert.ok(opened[0].startsWith('https://x.com/intent/post?text='), opened[0]);
  assert.equal(opened[1], '_blank');
});
