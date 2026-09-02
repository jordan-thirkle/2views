window.V2 = window.V2 || {};
/* Sign in with X - OAuth 2.0 Authorization Code Flow with PKCE (public client).
   The Client ID comes from developer.x.com and can be pasted in the Profile tab
   (stored locally) or set in js/config.js. No Client Secret is needed - PKCE only.
   Without a Client ID the app stays fully playable with a local demo profile. */
V2.oauth = (function () {
  var cfg = V2.config.X_OAUTH;
  function clientId() {
    return (V2.store.state.settings.xClientId || '').trim() || cfg.clientId || '';
  }
  function configured() { return !!clientId(); }
  function redirectUri() { return location.origin + location.pathname; }
  function b64url(bytes) {
    var s = btoa(String.fromCharCode.apply(null, bytes));
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomB64url(len) {
    var b = new Uint8Array(len);
    crypto.getRandomValues(b);
    return b64url(b);
  }
  function sha256B64url(s) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (buf) {
      return b64url(new Uint8Array(buf));
    });
  }
  /* ---- session (access + refresh tokens) ---- */
  function session() {
    try { return JSON.parse(localStorage.getItem('2views_x_session') || 'null'); } catch (e) { return null; }
  }
  function saveSession(tok) {
    localStorage.setItem('2views_x_session', JSON.stringify({
      access: tok.access_token,
      refresh: tok.refresh_token || null,
      exp: Date.now() + (tok.expires_in || 7200) * 1000
    }));
  }
  function clearSession() { localStorage.removeItem('2views_x_session'); }
  function signedIn() { return !!(session() && !V2.store.state.profile.demo); }

  function demoProfile(name) {
    var s = V2.store.state;
    s.profile = { demo: true, name: (name || 'you').slice(0, 20),
                  handle: '@' + ((name || 'you').replace(/[^a-z0-9_]/gi, '').slice(0, 15).toLowerCase() || 'you'), xid: null, avatar: null };
    V2.store.save();
    V2.events.emit('auth');
  }
  function applyXProfile(u) {
    var s = V2.store.state;
    var av = u.profile_image_url_https ? String(u.profile_image_url_https).replace('_normal', '_400x400') : null;
    s.profile = { demo: false, name: u.name || 'X user', handle: '@' + (u.username || 'user'), xid: u.id || null, avatar: av };
    V2.store.save();
    V2.events.emit('auth');
  }
  function connectFallback(reason) {
    /* token worked but profile lookup failed (e.g. API tier limits): keep the session */
    if (session()) {
      var s = V2.store.state;
      if (s.profile.demo) {
        s.profile = { demo: false, name: 'X user', handle: '@x-user', xid: null, avatar: null };
        V2.store.save();
        V2.events.emit('auth');
      }
      V2.app.toast('Signed in. Profile lookup skipped (' + reason + ').');
      return true;
    }
    V2.app.toast('X sign-in failed (' + reason + '). Demo profile kept - see README.');
    return false;
  }

  function signIn() {
    V2.audio.ensure();
    if (!configured()) {
      V2.app.toast('Paste your X Client ID in Profile > X sign-in setup first (README has the 2-minute guide).');
      return;
    }
    if (!(window.crypto && crypto.subtle && crypto.getRandomValues)) {
      V2.app.toast('Sign-in needs a secure context - serve over http://127.0.0.1 or https (see README).');
      return;
    }
    var verifier = randomB64url(48), state = randomB64url(16);
    sessionStorage.setItem('2views_pkce', JSON.stringify({ verifier: verifier, state: state }));
    sha256B64url(verifier).then(function (challenge) {
      var u = cfg.authorizeUrl +
        '?response_type=code&client_id=' + encodeURIComponent(clientId()) +
        '&redirect_uri=' + encodeURIComponent(redirectUri()) +
        '&scope=' + encodeURIComponent(cfg.scopes) +
        '&state=' + encodeURIComponent(state) +
        '&code_challenge=' + encodeURIComponent(challenge) +
        '&code_challenge_method=S256';
      location.href = u;
    });
  }
  function exchange(code, verifier) {
    var body = new URLSearchParams({
      grant_type: 'authorization_code', code: code,
      redirect_uri: redirectUri(), client_id: clientId(), code_verifier: verifier
    });
    return fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(function (r) {
      if (!r.ok) { throw new Error('token ' + r.status); }
      return r.json();
    });
  }
  function fetchMe(access) {
    return fetch(cfg.usersMeUrl + '?user.fields=name,username,profile_image_url_https', {
      headers: { 'Authorization': '***' + access }
    }).then(function (r) {
      if (!r.ok) { throw new Error('users/me ' + r.status); }
      return r.json();
    });
  }
  function handleCallbackIfPresent() {
    var q = new URLSearchParams(location.search);
    var err = q.get('error');
    var code = q.get('code'), state = q.get('state');
    if (err) {
      history.replaceState(null, '', location.pathname);
      V2.app.toast('X sign-in cancelled (' + err + '). Demo profile active.');
      return Promise.resolve(false);
    }
    if (!code || !state) { return Promise.resolve(false); }
    history.replaceState(null, '', location.pathname);
    var pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('2views_pkce') || 'null'); } catch (e) {}
    if (!pending || pending.state !== state) {
      V2.app.toast('Sign-in state mismatch - start again from the Profile tab.');
      return Promise.resolve(false);
    }
    sessionStorage.removeItem('2views_pkce');
    return exchange(code, pending.verifier).then(function (tok) {
      saveSession(tok);
      return fetchMe(tok.access_token);
    }).then(function (me) {
      applyXProfile(me.data || {});
      V2.app.toast('Signed in as ' + V2.store.state.profile.handle);
      return true;
    }).catch(function (e) {
      return connectFallback(String(e && e.message || e));
    });
  }
  function refreshIfNeeded() {
    var s = session();
    if (!s || !s.refresh) { return Promise.resolve(); }
    if (s.exp && s.exp - 60000 > Date.now()) { return Promise.resolve(); }
    var body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: s.refresh, client_id: clientId()
    });
    return fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(function (r) {
      if (!r.ok) { throw new Error('refresh ' + r.status); }
      return r.json();
    }).then(function (tok) { saveSession(tok); })
      .catch(function () { clearSession(); });
  }
  function signOut() {
    clearSession();
    demoProfile('you');
    V2.app.toast('Signed out. Demo profile active.');
  }
  return { configured: configured, clientId: clientId, redirectUri: redirectUri,
           signIn: signIn, handleCallbackIfPresent: handleCallbackIfPresent,
           refreshIfNeeded: refreshIfNeeded, signOut: signOut, signedIn: signedIn,
           demoProfile: demoProfile };
})();
