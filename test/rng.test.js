'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/harness');

test('mulberry32 is deterministic per seed and bounded', () => {
  const app = loadApp();
  const a = app.V2.rng.mulberry32(42);
  const b = app.V2.rng.mulberry32(42);
  const seqA = [];
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1, 'output within [0,1)');
    seqA.push(v);
    assert.equal(v, b(), 'same seed yields identical stream');
  }
});

test('different seeds diverge', () => {
  const app = loadApp();
  const a = app.V2.rng.mulberry32(1);
  const b = app.V2.rng.mulberry32(2);
  assert.notEqual(a(), b(), 'first draw differs between seeds');
});

test('seedToCode pads, uppercases and round-trips through codeToSeed', () => {
  const app = loadApp();
  const { seedToCode, codeToSeed } = app.V2.rng;
  const samples = [0, 1, 35, 36, 123456789, 0xFFFFFFFF];
  for (const n of samples) {
    const code = seedToCode(n);
    assert.match(code, /^[0-9A-Z]{7}$/, `code ${code} is 7 chars upper-alnum`);
    assert.equal(codeToSeed(code), n, `round-trip ${n} -> ${code} -> ${n}`);
  }
  assert.equal(seedToCode(0), '0000000');
  assert.equal(seedToCode(35), '000000Z');
  assert.equal(seedToCode(36), '0000010');
  assert.equal(codeToSeed('0000000'), 0);
});

test('seedFromString is stable and sensitive to input', () => {
  const app = loadApp();
  const { seedFromString } = app.V2.rng;
  assert.equal(seedFromString('daily:2026-09-02'), seedFromString('daily:2026-09-02'));
  assert.notEqual(seedFromString('abc'), seedFromString('abd'));
  const s = seedFromString('daily:2026-09-02');
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xFFFFFFFF);
});

test('dailyKey is a UTC YYYY-MM-DD string', () => {
  const app = loadApp();
  assert.match(app.V2.rng.dailyKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('randomSeed returns a 32-bit integer', () => {
  const app = loadApp();
  const s = app.V2.rng.randomSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xFFFFFFFF);
});
