window.V2 = window.V2 || {};
/* Leaderboards. Local by default (private, on-device).
   Optional global board: point V2.config.LEADERBOARD_API at the /api Worker.
   Only game statistics and your chosen display name are ever stored - no emails,
   no follower data, nothing scraped. See README.md § PRIVACY. */
V2.leaderboard = (function () {
  var CAP = 50;
  function listFor(mode, key) {
    var L = V2.store.state.lists;
    if (mode === 'daily') {
      key = key || V2.rng.dailyKey();
      if (!L.daily[key]) { L.daily[key] = []; }
      return L.daily[key];
    }
    if (mode === 'challenge' && key) {
      if (!L.challenge[key]) { L.challenge[key] = []; }
      return L.challenge[key];
    }
    return L.classic;
  }
  function entryFrom(result) {
    var p = V2.store.state.profile;
    return {
      name: String(p.name).slice(0, 20),
      handle: p.handle,
      views: Math.max(0, Math.min(1000000, result.views | 0)),
      likes: Math.max(0, Math.min(10000, result.likes | 0)),
      combo: Math.max(0, Math.min(999, result.bestCombo | 0)),
      timeLeftMs: Math.round(result.timeLeftSec * 1000),
      mode: result.mode, seed: result.seedCode,
      date: V2.rng.dailyKey(), at: Date.now()
    };
  }
  function sortDesc(a, b) { return b.views - a.views || b.likes - a.likes; }
  function submit(result) {
    var entry = entryFrom(result), key = result.mode === 'daily' ? V2.rng.dailyKey() : result.seedCode;
    var list = listFor(result.mode, key);
    list.push(entry);
    list.sort(sortDesc);
    if (list.length > CAP) { list.length = CAP; }
    if (result.mode === 'classic') {
      var b = V2.store.state.bests;
      if (result.views > b.classic) { b.classic = result.views; }
    }
    V2.store.save();
    /* Recent-run log (profile screen) */
    var s = V2.store.state;
    s.runs.unshift({ mode: result.mode, views: result.views, likes: result.likes,
                     combo: result.bestCombo, win: result.win, at: entry.at });
    if (s.runs.length > 100) { s.runs.length = 100; }
    s.balance += Math.max(0, result.views);
    s.totalEarned += Math.max(0, result.views);
    V2.store.save();
    remoteSubmit(entry);
    return entry;
  }
  function remoteSubmit(entry) {
    var api = V2.config.LEADERBOARD_API;
    if (!api) { return; }
    try {
      fetch(api + '/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      }).catch(function () {});
    } catch (e) {}
  }
  function local(mode, key, limit) {
    return listFor(mode, key).slice(0, limit || 25).map(function (e, i) {
      return { rank: i + 1, source: 'local', entry: e };
    });
  }
  function remote(mode, limit) {
    var api = V2.config.LEADERBOARD_API;
    if (!api) { return Promise.resolve([]); }
    return fetch(api + '/scores?mode=' + encodeURIComponent(mode) + '&limit=' + (limit || 25))
      .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
      .then(function (rows) {
        return (rows || []).map(function (e, i) { return { rank: i + 1, source: 'remote', entry: e }; });
      })
      .catch(function () { return []; });
  }
  /* merged view: remote rows first (global), local rows appended if not duplicated */
  function top(mode, key, limit) {
    var base = local(mode, key, limit);
    if (!V2.config.LEADERBOARD_API) { return Promise.resolve(base); }
    return remote(mode, limit).then(function (rem) {
      var seen = {};
      rem.forEach(function (r) { seen[r.entry.name + ':' + r.entry.views + ':' + r.entry.at] = 1; });
      base.forEach(function (l) {
        if (!seen[l.entry.name + ':' + l.entry.views + ':' + l.entry.at]) { rem.push(l); }
      });
      return rem.slice(0, limit || 25);
    });
  }
  return { submit: submit, top: top, listFor: listFor, CAP: CAP };
})();
