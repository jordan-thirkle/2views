window.V2 = window.V2 || {};
/* Sharing everywhere: X Web Intents (no auth needed), native share, clipboard,
   and seeded challenge links that replay the exact same feed. */
V2.share = (function () {
  function resultText(r) {
    var s = V2.store.state.profile;
    var head = r.win
      ? 'My last post went from 2 views to ' + r.views.toLocaleString('en-US') + ' in 30s.'
      : 'My last post stalled at ' + r.views.toLocaleString('en-US') + ' views.';
    var mid = ' Best combo x' + r.bestCombo + ', ' + r.likes + ' likes. ' +
      (r.mode === 'daily' ? 'Daily feed ' + V2.rng.dailyKey() : 'Feed #' + r.seedCode) + '.';
    return head + mid + ' Can you beat that? #2Views';
  }
  function challengeURL(seedCode, score) {
    var u = location.origin + location.pathname + '#c=' + seedCode;
    if (score) { u += '&s=' + score; }
    return u;
  }
  function intentURL(text) {
    return 'https://x.com/intent/post?text=' + encodeURIComponent(text);
  }
  function openX(text) {
    window.open(intentURL(text), '_blank', 'noopener');
  }
  function postRun(result) {
    openX(resultText(result) + '\n' + challengeURL(result.seedCode, result.views));
  }
  function copy(text, okMsg) {
    var done = function () { V2.app.toast(okMsg || 'Copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }
  function nativeShare(result) {
    var text = resultText(result);
    if (navigator.share) {
      navigator.share({ text: text, url: challengeURL(result.seedCode, result.views) })
        .catch(function () { openX(text); });
    } else { openX(text); }
  }
  function parseChallenge() {
    var m = location.hash.match(/[#&]c=([A-Z0-9]+)/i);
    if (!m) { return null; }
    var seedCode = m[1].toUpperCase();
    var s = location.hash.match(/[#&]s=(\d+)/);
    var n = location.hash.match(/[#&]n=([^&]+)/);
    return {
      seedCode: seedCode,
      seed: V2.rng.codeToSeed(seedCode),
      score: s ? parseInt(s[1], 10) : null,
      name: n ? decodeURIComponent(n[1]).slice(0, 20) : null
    };
  }
  return { resultText: resultText, challengeURL: challengeURL, postRun: postRun, copy: copy,
           nativeShare: nativeShare, parseChallenge: parseChallenge, openX: openX, intentURL: intentURL };
})();
