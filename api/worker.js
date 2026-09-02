/* 2 Views global leaderboard - Cloudflare Worker + D1 (optional, self-hosted).
   Deploy once, then set V2.config.LEADERBOARD_API in js/config.js to the Worker URL.
   See api/README.md for the 4-command deployment. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
function bad(msg, status = 400) { return json({ error: msg }, status); }
function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') { return new Response(null, { status: 204, headers: CORS }); }
    try {
      if (url.pathname === '/scores' && request.method === 'GET') {
        const mode = ['classic', 'daily', 'challenge'].includes(url.searchParams.get('mode')) ? url.searchParams.get('mode') : 'classic';
        const limit = clampInt(url.searchParams.get('limit'), 1, 100, 25);
        const rows = await env.DB
          .prepare('SELECT name, handle, views, likes, combo, time_ms AS timeLeftMs, mode, seed, date, at FROM scores WHERE mode = ? ORDER BY views DESC, likes DESC, at ASC LIMIT ?')
          .bind(mode, limit)
          .all();
        return json(rows.results || []);
      }
      if (url.pathname === '/scores' && request.method === 'POST') {
        const b = await request.json().catch(() => null);
        if (!b) { return bad('invalid json'); }
        const entry = {
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
        if (entry.views <= 0) { return bad('nothing to record'); }
        await env.DB.prepare(
          'INSERT INTO scores (name, handle, views, likes, combo, time_ms, mode, seed, date, at) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).bind(entry.name, entry.handle, entry.views, entry.likes, entry.combo, entry.timeLeftMs, entry.mode, entry.seed, entry.date, entry.at).run();
        return json({ ok: true });
      }
      return bad('not found', 404);
    } catch (err) {
      return json({ error: 'internal', detail: String(err && err.message) }, 500);
    }
  }
};
