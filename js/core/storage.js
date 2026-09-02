window.V2 = window.V2 || {};
V2.store = (function () {
  var KEY = '2views_pwa_v1';
  function defaults() {
    return {
      profile: { demo: true, name: 'you', handle: '@you', xid: null, avatar: null },
      balance: 0,          // banked impressions (cosmetics currency)
      totalEarned: 0,
      inventory: { themes: ['classic'], avatars: ['pixel'], texts: ['one-prompt'] },
      equipped: { theme: 'classic', avatar: 'pixel', text: 'one-prompt' },
      lists: { classic: [], daily: {}, challenge: {} },  // local leaderboards (top 50 each)
      bests: { classic: 0 },
      runs: [],            // recent run log, capped at 100
      settings: { muted: false, xClientId: '' },
      seenInstallHint: false
    };
  }
  var state = load();
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = defaults(), s = JSON.parse(raw), k;
        for (k in d) { if (!(k in s)) { s[k] = d[k]; } }
        for (k in d.profile) { if (!(k in s.profile)) { s.profile[k] = d.profile[k]; } }
        if (!('avatar' in s.profile)) { s.profile.avatar = null; }
        for (k in d.inventory) { if (!(s.inventory && s.inventory[k])) { s.inventory[k] = d.inventory[k]; } }
        if (!s.lists) { s.lists = d.lists; }
        return s;
      }
    } catch (e) {}
    return defaults();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function reset() { state = defaults(); save(); }
  return { get state() { return state; }, save: save, reset: reset };
})();
