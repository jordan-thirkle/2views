'use strict';
/* Shared test harness. The game modules attach to window.V2 and touch browser
   globals (localStorage, location, matchMedia, requestAnimationFrame, ...).
   loadApp() builds a fresh fake-browser environment and re-requires every module
   so each test starts from a clean, deterministic state. */
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const MODULE_FILES = [
  'js/core/rng.js',
  'js/core/events.js',
  'js/core/storage.js',
  'js/config.js',
  'js/core/audio.js',
  'js/cosmetics/cosmetics.js',
  'js/net/leaderboard.js',
  'js/share/share.js',
  'js/net/x-oauth.js',
  'js/game/engine.js'
];

class MemoryStorage {
  constructor(initial) {
    this.m = new Map(Object.entries(initial || {}));
  }
  getItem(k) { return this.m.has(k) ? String(this.m.get(k)) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
}

function fakeCanvas() {
  const ctx = new Proxy({}, {
    get: (t, p) => (Reflect.has(t, p) ? t[p] : () => {}),
    set: (t, p, v) => { t[p] = v; return true; }
  });
  return { getContext: () => ctx, style: {} };
}

let rafCb = null;

function setGlobal(w, name, value) {
  try {
    Object.defineProperty(w, name, { value, configurable: true, writable: true, enumerable: true });
  } catch (e) {
    w[name] = value;
  }
}

function loadApp(opts = {}) {
  const w = global;
  delete w.V2;
  MODULE_FILES.forEach((m) => { delete require.cache[require.resolve(path.join(ROOT, m))]; });

  const listeners = {};
  const evt = {
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      const a = listeners[type];
      if (a) { const i = a.indexOf(fn); if (i >= 0) { a.splice(i, 1); } }
    },
    dispatch(type, evData) { (listeners[type] || []).slice().forEach((fn) => fn(evData || {})); },
    has(type) { return !!listeners[type]; }
  };

  setGlobal(w, 'window', w);
  setGlobal(w, 'addEventListener', evt.addEventListener);
  setGlobal(w, 'removeEventListener', evt.removeEventListener);
  setGlobal(w, 'document', {
    createElement: () => ({ style: {}, value: '', select() {} }),
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {}, removeEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => [],
    documentElement: { setAttribute() {}, getAttribute: () => null }
  });
  setGlobal(w, 'localStorage', opts.storage || new MemoryStorage());
  setGlobal(w, 'sessionStorage', opts.sessionStorage || new MemoryStorage());
  setGlobal(w, 'location', Object.assign(
    { hash: '', search: '', origin: 'https://example.test', pathname: '/index.html', protocol: 'https:' },
    opts.location
  ));
  setGlobal(w, 'history', { replaceState() {}, pushState() {} });
  setGlobal(w, 'navigator', Object.assign({ userAgent: 'node-test', clipboard: undefined, share: undefined }, opts.navigator));
  setGlobal(w, 'matchMedia', () => ({ matches: true })); // prefers-reduced-motion: reduce -> engine shake disabled
  setGlobal(w, 'performance', { now: () => 0 });
  setGlobal(w, 'requestAnimationFrame', (cb) => { rafCb = cb; return 1; });
  setGlobal(w, 'fetch', opts.fetch || (() => Promise.reject(new Error('unexpected fetch in test'))));
  setGlobal(w, 'crypto', {
    getRandomValues: (b) => { for (let i = 0; i < b.length; i++) { b[i] = (i * 37) % 256; } return b; },
    subtle: { digest: async () => new Uint8Array(32).buffer }
  });

  const toasts = [];
  setGlobal(w, 'V2', { app: { toast: (msg) => { toasts.push(String(msg)); } } });
  MODULE_FILES.forEach((m) => require(path.join(ROOT, m)));
  return { w, V2: w.V2, toasts, localStorage, listeners };
}

/* Drives the engine's requestAnimationFrame loop with a virtual clock. */
function makeDriver(app) {
  const w = app.w;
  let nowMs = 0;
  let cb = null;
  w.requestAnimationFrame = (fn) => { cb = fn; return 1; };
  const ends = [];
  const api = {
    init() { app.V2.engine.init({ canvas: fakeCanvas(), onEnd: (r) => ends.push(r) }); },
    tick(seconds, step = 1 / 60) {
      for (let t = 0; t < seconds; t += step) { this.step(step); }
      return seconds;
    },
    step(step = 1 / 60) {
      nowMs += step * 1000;
      if (cb) { cb(nowMs); }
    },
    tickUntil(seconds, done, step = 1 / 60) {
      for (let t = 0; t < seconds; t += step) {
        this.step(step);
        if (done && done()) { return true; }
      }
      return false;
    },
    get ends() { return ends; }
  };
  return api;
}

module.exports = { loadApp, makeDriver, fakeCanvas, MemoryStorage, ROOT };
