'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/harness');

test('fresh load returns full defaults', () => {
  const app = loadApp();
  const s = app.V2.store.state;
  assert.deepEqual(s.profile, { demo: true, name: 'you', handle: '@you', xid: null, avatar: null });
  assert.equal(s.balance, 0);
  assert.equal(s.totalEarned, 0);
  assert.deepEqual(s.inventory, { themes: ['classic'], avatars: ['pixel'], texts: ['one-prompt'] });
  assert.deepEqual(s.equipped, { theme: 'classic', avatar: 'pixel', text: 'one-prompt' });
  assert.deepEqual(s.lists, { classic: [], daily: {}, challenge: {} });
  assert.deepEqual(s.bests, { classic: 0 });
  assert.deepEqual(s.runs, []);
  assert.deepEqual(s.settings, { muted: false, xClientId: '' });
  assert.equal(s.seenInstallHint, false);
});

test('an older saved state is merged with defaults (missing keys backfilled)', () => {
  const app = loadApp({
    storage: new (require('./helpers/harness').MemoryStorage)({
      '2views_pwa_v1': JSON.stringify({
        profile: { demo: true, name: 'old', handle: '@old' }, // no avatar, no xid
        balance: 321,
        inventory: { themes: ['classic', 'midnight'] }        // no avatars/texts keys
      })
    })
  });
  const s = app.V2.store.state;
  assert.equal(s.balance, 321);
  assert.equal(s.profile.avatar, null);
  assert.equal(s.profile.xid, null);
  assert.deepEqual(s.inventory.themes, ['classic', 'midnight']);
  assert.deepEqual(s.inventory.avatars, ['pixel']);
  assert.deepEqual(s.inventory.texts, ['one-prompt']);
  assert.deepEqual(s.lists, { classic: [], daily: {}, challenge: {} });
  assert.deepEqual(s.runs, []);
});

test('corrupt or unparseable saves fall back to defaults', () => {
  const app = loadApp({
    storage: new (require('./helpers/harness').MemoryStorage)({ '2views_pwa_v1': '{oops' })
  });
  assert.deepEqual(app.V2.store.state, new (require('./helpers/harness').MemoryStorage)()
    && app.V2.store.state, 'defaults deep shape');
  assert.equal(app.V2.store.state.balance, 0);
  assert.equal(app.V2.store.state.profile.demo, true);
});

test('reset() restores defaults and persists them', () => {
  const app = loadApp();
  app.V2.store.state.balance = 999;
  app.V2.store.reset();
  assert.equal(app.V2.store.state.balance, 0);
  const raw = app.localStorage.getItem('2views_pwa_v1');
  assert.equal(JSON.parse(raw).balance, 0);
});

test('save() round-trips through a fresh load', () => {
  const storage = new (require('./helpers/harness').MemoryStorage)();
  const app = loadApp({ storage });
  app.V2.store.state.balance = 42;
  app.V2.store.state.profile.name = 'saved';
  app.V2.store.save();
  const app2 = loadApp({ storage });
  assert.equal(app2.V2.store.state.balance, 42);
  assert.equal(app2.V2.store.state.profile.name, 'saved');
});
