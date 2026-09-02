/* Static file serving + global leaderboard API. Runtime counterpart of
   tools/make-worker.js (FILES/PNG constants are injected at build time). */
const CT_EXT = { '.html': 'text/html; charset=utf-8', '.json': 'application/manifest+json' };
let cache = null;
async function loadFiles() {
  if (cache) { return cache; }
  const bin = Uint8Array.from(atob(GZ), function (c) { return c.charCodeAt(0); });
  const ds = new DecompressionStream('gzip');
  const txt = await new Response(new Blob([bin]).stream().pipeThrough(ds)).text();
  cache = JSON.parse(txt);
  for (const k in PNG) {
    cache[k] = { ct: 'image/png', b64: PNG[k], cc: 'public, max-age=86400' };
  }
  return cache;
}
function bytes(f) {
  const b = atob(f.b64);
  const a = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) { a[i] = b.charCodeAt(i); }
  return a;
}
function resp(f, status) {
  return new Response(bytes(f), {
    status: status || 200,
    headers: {
      'Content-Type': f.ct,
      'Cache-Control': f.cc || 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
function json(d, s) { return new Response(JSON.stringify(d), { status: s || 200, headers: { 'Content-Type': 'application/json', ...CORS } }); }
function clampInt(v, lo, hi, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
}
async function scores(request, env, url) {
  if (!env.DB) { return json({ error: 'leaderboard database not configured' }, 501); }
  if (request.method === 'GET') {
    const mode = ['classic', 'daily', 'challenge'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'classic';
    const limit = clampInt(url.searchParams.get('limit'), 1, 100, 25);
    const rows = await env.DB.prepare('SELECT name, handle, views, likes, combo, time_ms AS timeLeftMs, mode, seed, date, at FROM scores WHERE mode = ?1 ORDER BY views DESC, likes DESC, at ASC LIMIT ?2').bind(mode, limit).all();
    return json(rows.results || []);
  }
  if (request.method === 'POST') {
    const b = await request.json().catch(function () { return null; });
    if (!b) { return json({ error: 'invalid json' }, 400); }
    const e = {
      name: String(b.name || 'anon').slice(0, 20),
      handle: String(b.handle || '').slice(0, 20),
      views: clampInt(b.views, 0, 1000000, 0),
      likes: clampInt(b.likes, 0, 10000, 0),
      combo: clampInt(b.combo, 0, 999, 0),
      timeLeftMs: clampInt(b.timeLeftMs, 0, 60000, 0),
      mode: ['classic', 'daily', 'challenge'].includes(b.mode) ? b.mode : 'classic',
      seed: String(b.seed || '').slice(0, 12),
      date: String(b.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      at: clampInt(b.at, 0, Date.now() + 60000, Date.now())
    };
    if (e.views <= 0) { return json({ error: 'nothing to record' }, 400); }
    await env.DB.prepare('INSERT INTO scores (name, handle, views, likes, combo, time_ms, mode, seed, date, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)').bind(e.name, e.handle, e.views, e.likes, e.combo, e.timeLeftMs, e.mode, e.seed, e.date, e.at).run();
    return json({ ok: true });
  }
  return json({ error: 'method not allowed' }, 405);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') { return new Response(null, { status: 204, headers: CORS }); }
    if (url.pathname === '/scores') {
      try { return await scores(request, env, url); }
      catch (err) { return json({ error: 'internal', detail: String(err && err.message) }, 500); }
    }
    const files = await loadFiles();
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') { p = '/index.html'; }
    const f = files[p] || files['/index.html'];
    return resp(f);
  }
};
