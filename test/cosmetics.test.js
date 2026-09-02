'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/harness');

/* The shop is the app's only money-spending surface: buy must deduct the banked
   balance, persist the item to the right inventory key, and mark it owned so
   EQUIP works and defaults show as already-owned. */

test('default items are owned and equipped from the start', () => {
  const app = loadApp();
  assert.equal(app.V2.cosmetics.owned(app.V2.cosmetics.byId('classic')), true);
  assert.equal(app.V2.cosmetics.owned(app.V2.cosmetics.byId('pixel')), true);
  assert.equal(app.V2.cosmetics.owned(app.V2.cosmetics.byId('one-prompt')), true);
  assert.equal(app.V2.cosmetics.owned(app.V2.cosmetics.byId('midnight')), false);
  assert.deepEqual(app.V2.cosmetics.current(), { color: '#1d9bf0', avatar: 'pixel', text: 'one prompt.' });
});

test('buy deducts balance, adds to the owning kind list and emits cosmetics', () => {
  const app = loadApp();
  const events = [];
  app.V2.events.on('cosmetics', () => events.push('cosmetics'));
  app.V2.store.state.balance = 1000;
  const res = app.V2.cosmetics.buy(app.V2.cosmetics.byId('midnight'));
  assert.deepEqual(res, { ok: true });
  assert.equal(app.V2.store.state.balance, 600); // 1000 - 400
  assert.deepEqual(app.V2.store.state.inventory.themes, ['classic', 'midnight']);
  assert.equal(app.V2.cosmetics.owned(app.V2.cosmetics.byId('midnight')), true);
  assert.deepEqual(events, ['cosmetics']);
  assert.equal(JSON.parse(app.localStorage.getItem('2views_pwa_v1')).balance, 600, 'persisted');
});

test('buying an owned item is refused and costs nothing', () => {
  const app = loadApp();
  app.V2.store.state.balance = 1000;
  assert.deepEqual(app.V2.cosmetics.buy(app.V2.cosmetics.byId('classic')), { ok: false, reason: 'owned' });
  assert.equal(app.V2.store.state.balance, 1000);
});

test('buying without funds is refused and costs nothing', () => {
  const app = loadApp();
  assert.deepEqual(app.V2.cosmetics.buy(app.V2.cosmetics.byId('midnight')), { ok: false, reason: 'funds' });
  assert.equal(app.V2.store.state.balance, 0);
  assert.deepEqual(app.V2.store.state.inventory.themes, ['classic']);
});

test('every catalog kind maps to a real inventory list and equipped key', () => {
  const app = loadApp();
  const s = app.V2.store.state;
  const kinds = new Set(app.V2.cosmetics.CATALOG.map((i) => i.kind));
  assert.equal(kinds.size, 3);
  for (const k of kinds) {
    assert.ok(k + 's' in s.inventory || k in s.inventory, `inventory reachable for kind ${k}`);
    assert.ok(k in s.equipped, `equipped key exists for kind ${k}`);
  }
});

test('equip persists to the live style and refuses unowned items', () => {
  const app = loadApp();
  assert.equal(app.V2.cosmetics.equip(app.V2.cosmetics.byId('gold')), false, 'cannot equip unowned');
  app.V2.store.state.balance = 2000;
  app.V2.cosmetics.buy(app.V2.cosmetics.byId('gold'));
  assert.equal(app.V2.cosmetics.equip(app.V2.cosmetics.byId('gold')), true);
  assert.equal(app.V2.store.state.equipped.theme, 'gold');
  assert.deepEqual(app.V2.cosmetics.current(), { color: '#d4a017', avatar: 'pixel', text: 'one prompt.' });
  app.V2.cosmetics.buy(app.V2.cosmetics.byId('egg'));
  assert.equal(app.V2.cosmetics.equip(app.V2.cosmetics.byId('egg')), true);
  assert.equal(app.V2.store.state.equipped.avatar, 'egg');
  assert.equal(app.V2.cosmetics.current().avatar, 'egg');
});

test('current() falls back to defaults for unknown equipped ids', () => {
  const app = loadApp();
  app.V2.store.state.equipped = { theme: 'nope', avatar: 'void', text: 'missing' };
  assert.deepEqual(app.V2.cosmetics.current(), { color: '#1d9bf0', avatar: 'pixel', text: 'one prompt.' });
});
