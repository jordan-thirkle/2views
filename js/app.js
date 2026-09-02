window.V2 = window.V2 || {};
/* App shell: x.com-style navigation, auth, HUD, screens, share panel, challenge
   links, install prompt, and a built-in self-test (?autotest=1). */
V2.app = (function () {
  var pendingChallenge = null;
  var selectedMode = 'classic';
  var deferredInstall = null;
  var endScreenShown = false;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) { d.className = cls; }
    if (html != null) { d.innerHTML = html; }
    return d;
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2800);
  }

  /* ---------- navigation ---------- */
  var ROUTES = { '#/game': 'screen-game', '#/leaderboard': 'screen-leaderboard', '#/shop': 'screen-shop', '#/profile': 'screen-profile' };
  function route() {
    var h = location.hash || '#/game';
    if (!ROUTES[h]) { h = '#/game'; }
    Object.keys(ROUTES).forEach(function (r) {
      $(ROUTES[r]).classList.toggle('hidden', r !== h);
    });
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-route') === h);
    });
    if (h === '#/leaderboard') { renderLeaderboard(); }
    if (h === '#/shop') { renderShop(); }
    if (h === '#/profile') { renderProfile(); }
    if (h !== '#/game' && V2.engine.stats().state === 'play') { pauseGame(); }
    fitStage();
  }
  function go(r) { location.hash = r; }

  /* ---------- game wiring ---------- */
  function fitStage() {
    var hud = $('hud');
    if (hud) { V2.engine.fit(hud.offsetHeight); }
  }
  function startRun(mode, seedCode) {
    V2.audio.ensure();
    V2.engine.setStyle(V2.cosmetics.current());
    hideOverlays();
    endScreenShown = false;
    V2.engine.start({ mode: mode, seedCode: seedCode });
    selectedMode = mode;
    go('#/game');
  }
  function hideOverlays() {
    ['ovStart', 'ovEnd', 'ovPause', 'ovAd'].forEach(function (id) { $(id).classList.add('hidden'); });
    $('warn').classList.add('hidden');
    $('pband').classList.add('hidden');
  }
  function showStart() {
    hideOverlays();
    var ov = $('ovStart');
    ov.classList.remove('hidden');
    var best = V2.store.state.bests.classic;
    $('startBest').textContent = best > 0 ? ('PERSONAL BEST: ' + best.toLocaleString('en-US') + ' VIEWS') : 'FIRST RUN - GOOD LUCK';
    document.querySelectorAll('#modeCards .modecard').forEach(function (c) {
      c.classList.toggle('selected', c.getAttribute('data-mode') === selectedMode);
    });
    var dk = V2.rng.dailyKey(), done = V2.store.state.runs.some(function (r) { return r.mode === 'daily' && new Date(r.at).toISOString().slice(0, 10) === dk; });
    $('dailyDone').textContent = done ? 'POSTED TODAY' : 'FEED ' + dk;
    renderChallengeCard();
    fitStage();
  }
  function pauseGame() {
    if (V2.engine.stats().state === 'play') {
      V2.engine.pause();
      $('ovPause').classList.remove('hidden');
    }
  }
  function resumeGame() {
    if (V2.engine.stats().state === 'pause') {
      V2.engine.resume();
      $('ovPause').classList.add('hidden');
    }
  }

  var REASONS = {
    win:      { t: 'VIRAL.',        c: '#00ba7c', l: function (r) { return r.views.toLocaleString('en-US') + ' views. The people have spoken.'; } },
    promo:    { t: 'BURIED.',       c: '#f4212e', l: function (r) { return 'A giant promo screenshot flattened your post at ' + r.views.toLocaleString('en-US') + ' views.'; } },
    stagnant: { t: 'SHADOWBANNED.', c: '#f4212e', l: function () { return 'Stuck under 20 views for 8 straight seconds. The feed moved on.'; } },
    time:     { t: "TIME'S UP.",    c: '#ffd400', l: function (r) { return 'You stalled at ' + r.views.toLocaleString('en-US') + ' views when the clock died.'; } }
  };
  function onRunEnd(result) {
    if (endScreenShown) { return; }
    endScreenShown = true;
    var entry = V2.leaderboard.submit(result);
    var s = V2.store.state;
    var r = REASONS[result.reason] || REASONS.time;
    var isBest = result.mode === 'classic' && result.views >= s.bests.classic && result.views > 2;
    var beatCh = result.mode === 'challenge' && pendingChallenge && pendingChallenge.score != null && result.views > pendingChallenge.score;
    var box = $('endBox');
    box.innerHTML = '';
    var title = el('div', 'big', r.t); title.style.color = r.c; box.appendChild(title);
    box.appendChild(el('div', 'line', r.l(result)));
    var st = el('div', 'stats');
    st.innerHTML = '<span>VIEWS ' + result.views.toLocaleString('en-US') + '</span>' +
      '<span>LIKES ' + result.likes + '</span>' +
      '<span>COMBO x' + result.bestCombo + '</span>' +
      '<span>LEFT ' + result.timeLeftSec.toFixed(1) + 's</span>' +
      '<span>FEED #' + result.seedCode + '</span>';
    box.appendChild(st);
    if (isBest) { box.appendChild(el('div', 'bestline', 'NEW PERSONAL BEST')); }
    if (beatCh) { box.appendChild(el('div', 'bestline win', 'CHALLENGE BEATEN')); }
    box.appendChild(el('div', 'bankline', '+' + result.views.toLocaleString('en-US') + ' impressions banked - balance ' + s.balance.toLocaleString('en-US')));
    var btns = el('div', 'btnrow');
    var again = el('button', 'pxbtn', 'RUN IT BACK'); again.type = 'button';
    again.addEventListener('click', function () { startRun(result.mode, result.mode === 'challenge' ? result.seedCode : null); });
    var post = el('button', 'pxbtn primary', 'POST RESULT ON X'); post.type = 'button';
    post.addEventListener('click', function () { V2.share.postRun(result); });
    btns.appendChild(again); btns.appendChild(post);
    box.appendChild(btns);
    var row2 = el('div', 'btnrow');
    var ch = el('button', 'pill small', 'CHALLENGE A FRIEND'); ch.type = 'button';
    ch.addEventListener('click', function () {
      V2.share.copy(V2.share.challengeURL(result.seedCode, result.views), 'Challenge link copied - send it to a friend.');
    });
    var cp = el('button', 'pill small', 'COPY RESULT'); cp.type = 'button';
    cp.addEventListener('click', function () { V2.share.copy(V2.share.resultText(result), 'Result copied.'); });
    var sh = el('button', 'pill small', 'SHARE...'); sh.type = 'button';
    sh.addEventListener('click', function () { V2.share.nativeShare(result); });
    var mode = el('button', 'pill small', 'CHANGE MODE'); mode.type = 'button';
    mode.addEventListener('click', function () { $('ovEnd').classList.add('hidden'); showStart(); });
    row2.appendChild(ch); row2.appendChild(cp); row2.appendChild(sh); row2.appendChild(mode);
    box.appendChild(row2);
    box.appendChild(el('div', 'credit', 'Made in AutoClaw with GLM-5.3-Flash in one prompt.'));
    var adHolder = el('div'); adHolder.id = 'adSlotEnd'; box.appendChild(adHolder);
    V2.ads.init();
    $('ovEnd').classList.remove('hidden');
    refreshAuth();
  }

  function onFrame(st) {
    $('hudViews').textContent = st.views.toLocaleString('en-US');
    $('hudFill').style.width = (st.progress * 100).toFixed(1) + '%';
    var tl = st.timeLeft;
    $('hudTimer').textContent = '0:' + String(tl < 1 ? 0 : Math.ceil(tl)).padStart(2, '0');
    $('hudTimer').classList.toggle('low', st.state === 'play' && tl <= 10);
    $('hudLikes').textContent = '\u2665 ' + st.likes;
    $('hudCombo').textContent = 'COMBO x' + st.combo;
    $('hudCombo').style.visibility = st.combo >= 2 ? 'visible' : 'hidden';
    $('hudCombo').classList.toggle('pop', st.combo >= 2);
    $('hudFeed').textContent = st.mode === 'daily' ? 'DAILY FEED' : 'FEED #' + st.seedCode;
    var w = $('warn');
    if (st.stagWarn) {
      w.textContent = 'SHADOWBAN IN ' + st.stagLeft.toFixed(1) + 's - GET VIEWS';
      w.classList.remove('hidden');
    } else { w.classList.add('hidden'); }
    $('pband').classList.toggle('hidden', !st.promoWarn);
    if (st.state === 'end' && !endScreenShown) { /* safety net */ }
  }

  /* ---------- auth ---------- */
  function refreshAuth() {
    var box = $('authbox'), s = V2.store.state.profile;
    box.innerHTML = '';
    if (V2.oauth.signedIn()) {
      var av = document.createElement('button');
      av.type = 'button'; av.className = 'avatar';
      av.title = 'Open profile';
      if (s.avatar) {
        var aim = document.createElement('img');
        aim.src = s.avatar; aim.alt = ''; aim.width = 30; aim.height = 30;
        av.appendChild(aim); av.classList.add('hasimg');
      } else { av.textContent = (s.name || 'X')[0].toUpperCase(); }
      av.addEventListener('click', function () { go('#/profile'); });
      var nm = el('span', 'handle', s.handle);
      box.appendChild(av); box.appendChild(nm);
      var out = el('button', 'pill small', 'SIGN OUT'); out.type = 'button';
      out.addEventListener('click', function () { V2.oauth.signOut(); refreshAuth(); });
      box.appendChild(out);
    } else {
      var inb = el('button', 'pill small xsignin', 'SIGN IN WITH X'); inb.type = 'button';
      inb.addEventListener('click', function () { V2.oauth.signIn(); refreshAuth(); });
      var demo = el('button', 'pill small ghost', 'DEMO: ' + s.handle); demo.type = 'button';
      demo.title = 'Set your local display name';
      demo.addEventListener('click', function () {
        var n = window.prompt('Display name for leaderboards and your card:', s.name);
        if (n) { V2.oauth.demoProfile(n.trim()); refreshAuth(); V2.events.emit('cosmetics'); }
      });
      box.appendChild(inb); box.appendChild(demo);
    }
  }

  /* ---------- leaderboard screen ---------- */
  var lbMode = 'classic';
  function renderLeaderboard() {
    var body = $('lbBody'), src = $('lbSource');
    body.innerHTML = '<div class="loading">LOADING...</div>';
    $('lbDate').textContent = lbMode === 'daily' ? V2.rng.dailyKey() : 'ALL TIME';
    V2.leaderboard.top(lbMode, lbMode === 'daily' ? V2.rng.dailyKey() : null, 25).then(function (rows) {
      body.innerHTML = '';
      var remote = rows.some(function (x) { return x.source === 'remote'; });
      src.textContent = remote ? 'GLOBAL (WORKER API) + LOCAL' : 'LOCAL (THIS DEVICE)';
      if (!rows.length) {
        body.appendChild(el('div', 'line', 'No scores yet in this mode. Play a run - your results land here.'));
        return;
      }
      var table = el('table', 'lbtable');
      table.innerHTML = '<thead><tr><th>#</th><th>NAME</th><th>VIEWS</th><th>LIKES</th><th>COMBO</th><th>DATE</th></tr></thead>';
      var tb = el('tbody');
      rows.forEach(function (row) {
        var e = row.entry;
        var tr = el('tr');
        tr.innerHTML = '<td>' + row.rank + '</td><td class="lbname">' + esc(e.name) + ' <span class="muted">' + esc(e.handle || '') + '</span></td>' +
          '<td class="lbviews">' + Number(e.views).toLocaleString('en-US') + '</td><td>' + e.likes + '</td>' +
          '<td>x' + e.combo + '</td><td class="muted">' + esc(e.date || '') + '</td>';
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      body.appendChild(table);
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- shop screen ---------- */
  function renderShop() {
    var s = V2.store.state;
    $('shopBalance').textContent = s.balance.toLocaleString('en-US') + ' IMPRESSIONS BANKED (+' + s.totalEarned.toLocaleString('en-US') + ' lifetime)';
    var grid = $('shopGrid');
    grid.innerHTML = '';
    var kinds = [['theme', 'CARD THEMES'], ['avatar', 'AVATARS'], ['text', 'POST TEXTS']];
    kinds.forEach(function (kv) {
      grid.appendChild(el('div', 'shophead', kv[1]));
      V2.cosmetics.CATALOG.filter(function (it) { return it.kind === kv[0]; }).forEach(function (it) {
        var card = el('div', 'shopcard');
        var own = V2.cosmetics.owned(it);
        var eq = s.equipped[it.kind] === it.id;
        var prev = el('div', 'swatch');
        if (it.kind === 'theme') { prev.style.background = it.color; }
        else if (it.kind === 'avatar') { prev.style.background = V2.cosmetics.current().color; prev.classList.add('av-' + it.id); }
        else { prev.classList.add('swatch-text'); prev.textContent = '"' + it.text + '"'; }
        card.appendChild(prev);
        card.appendChild(el('div', 'shopname', it.name));
        var b = el('button', 'pill small'); b.type = 'button';
        if (eq) { b.textContent = 'EQUIPPED'; b.classList.add('equipped'); b.disabled = true; }
        else if (own) { b.textContent = 'EQUIP'; b.addEventListener('click', function () { V2.cosmetics.equip(it); V2.audio.click(); }); }
        else {
          b.textContent = 'BUY ' + it.price;
          if (s.balance < it.price) { b.disabled = true; b.classList.add('ghost'); }
          b.addEventListener('click', function () {
            var res = V2.cosmetics.buy(it);
            if (res.ok) { V2.audio.buy(); toast('Purchased ' + it.name + '.'); }
            else if (res.reason === 'funds') { toast('Not enough impressions banked.'); }
          });
        }
        card.appendChild(b);
        grid.appendChild(card);
      });
    });
  }

  /* ---------- profile screen ---------- */
  function renderProfile() {
    var s = V2.store.state, p = s.profile;
    var id = $('profIdentity');
    var bigAv = s.profile.avatar
      ? '<img class="bigavatar-img" src="' + esc(s.profile.avatar) + '" alt="">'
      : '<div class="bigavatar" style="background:' + V2.cosmetics.current().color + '">' + esc((p.name || '?')[0].toUpperCase()) + '</div>';
    id.innerHTML = bigAv +
      '<div><div class="profname">' + esc(p.name) + (p.demo ? ' <span class="badge">DEMO PROFILE</span>' : ' <span class="badge x">X VERIFIED SESSION</span>') + '</div>' +
      '<div class="muted">' + esc(p.handle) + '</div></div>';
    var best = 0, likes = 0, combo = 0;
    s.runs.forEach(function (r) { best = Math.max(best, r.views); likes += r.likes; combo = Math.max(combo, r.combo); });
    var stats = $('profStats');
    stats.innerHTML = '';
    [['RUNS PLAYED', s.runs.length], ['BEST RUN (VIEWS)', best.toLocaleString('en-US')],
     ['TOTAL LIKES', likes], ['BEST COMBO', 'x' + combo],
     ['IMPRESSIONS EARNED', s.totalEarned.toLocaleString('en-US')], ['BANKED BALANCE', s.balance.toLocaleString('en-US')],
     ['CLASSIC PERSONAL BEST', (s.bests.classic || 0).toLocaleString('en-US')], ['COSMETICS OWNED',
      s.inventory.themes.length + s.inventory.avatars.length + s.inventory.texts.length + ' / ' + V2.cosmetics.CATALOG.length]
    ].forEach(function (kv) {
      stats.appendChild(el('div', 'statcard', '<div class="statv">' + kv[1] + '</div><div class="statk">' + kv[0] + '</div>'));
    });
    var runs = $('profRuns');
    runs.innerHTML = '';
    if (!s.runs.length) { runs.appendChild(el('div', 'line', 'No runs yet.')); }
    else {
      var t = el('table', 'lbtable');
      t.innerHTML = '<thead><tr><th>WHEN</th><th>MODE</th><th>VIEWS</th><th>LIKES</th><th>COMBO</th><th>RESULT</th></tr></thead>';
      var tb = el('tbody');
      s.runs.slice(0, 10).forEach(function (r) {
        var d = new Date(r.at);
        tb.appendChild(el('tr', null, '<td class="muted">' + d.toISOString().slice(0, 10) + '</td><td>' + r.mode.toUpperCase() + '</td>' +
          '<td class="lbviews">' + r.views.toLocaleString('en-US') + '</td><td>' + r.likes + '</td><td>x' + r.combo + '</td>' +
          '<td>' + (r.win ? 'WIN' : 'LOSS') + '</td>'));
      });
      t.appendChild(tb);
      runs.appendChild(t);
    }
  }

  /* ---------- challenge ---------- */
  function renderChallengeCard() {
    var card = $('challengeCard');
    if (!pendingChallenge) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    $('chText').textContent = (pendingChallenge.name ? esc(pendingChallenge.name) + ' scored ' : 'Someone scored ') +
      (pendingChallenge.score != null ? pendingChallenge.score.toLocaleString('en-US') + ' views' : 'a run') +
      ' on feed #' + pendingChallenge.seedCode + '. Same feed, no excuses.';
  }

  /* ---------- boot ---------- */
  function init() {
    /* nav */
    document.querySelectorAll('.navbtn').forEach(function (b) {
      b.addEventListener('click', function () { V2.audio.click(); go(b.getAttribute('data-route')); });
    });
    window.addEventListener('hashchange', route);
    /* engine */
    V2.engine.init({
      canvas: $('cv'),
      onFrame: onFrame,
      onEnd: onRunEnd
    });
    V2.engine.bindStage($('stage'), $('cv'));
    V2.engine.setStyle(V2.cosmetics.current());
    V2.events.on('cosmetics', function () { V2.engine.setStyle(V2.cosmetics.current()); });
    V2.events.on('auth', function () {
      refreshAuth();
      var p = V2.store.state.profile;
      if (p.avatar && !p.demo) {
        var xim = new Image();
        xim.crossOrigin = 'anonymous';
        xim.onload = function () { V2.engine.setAvatarImage(xim); };
        xim.onerror = function () { V2.engine.setAvatarImage(null); };
        xim.src = p.avatar;
      } else { V2.engine.setAvatarImage(null); }
      if (!document.getElementById('screen-profile').classList.contains('hidden')) { renderProfile(); }
    });
    V2.events.on('hurt', function () {
      var st = $('stage');
      st.classList.add('hurt');
      setTimeout(function () { st.classList.remove('hurt'); }, 150);
    });
    /* start overlay */
    document.querySelectorAll('#modeCards .modecard').forEach(function (c) {
      c.addEventListener('click', function () {
        selectedMode = c.getAttribute('data-mode');
        document.querySelectorAll('#modeCards .modecard').forEach(function (x) { x.classList.toggle('selected', x === c); });
      });
    });
    $('btnStart').addEventListener('click', function () { startRun(selectedMode, selectedMode === 'challenge' && pendingChallenge ? pendingChallenge.seedCode : null); });
    $('btnAcceptCh').addEventListener('click', function () { startRun('challenge', pendingChallenge.seedCode); });
    $('btnDeclineCh').addEventListener('click', function () { pendingChallenge = null; renderChallengeCard(); });
    $('btnResume').addEventListener('click', resumeGame);
    $('btnPauseQuit').addEventListener('click', function () { V2.engine.abort(); $('ovPause').classList.add('hidden'); showStart(); });
    $('btnMute').addEventListener('click', function () {
      var m = V2.audio.toggleMute();
      $('btnMute').textContent = m ? 'SOUND OFF' : 'SOUND ON';
    });
    $('btnMute').textContent = V2.store.state.settings.muted ? 'SOUND OFF' : 'SOUND ON';
    $('btnPauseHud').addEventListener('click', pauseGame);
    $('postBtn').addEventListener('click', function () {
      var b = V2.store.state.bests.classic;
      if (b > 2) {
        V2.share.openX('My last post peaked at ' + b.toLocaleString('en-US') + ' views in 2 Views. Beat that. #2Views ' + V2.share.challengeURL('', 0).replace(/#c=$/, ''));
      } else { toast('Play a run first - then post the score.'); }
    });
    document.querySelectorAll('#lbTabs .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        lbMode = t.getAttribute('data-lbmode');
        document.querySelectorAll('#lbTabs .tab').forEach(function (x) { x.classList.toggle('active', x === t); });
        renderLeaderboard();
      });
    });
    $('btnLbShare').addEventListener('click', function () {
      var b = V2.store.state.bests.classic;
      V2.share.openX(b > 0
        ? 'My last post peaked at ' + b.toLocaleString('en-US') + ' views in 2 Views. Beat that. #2Views'
        : 'Just found 2 Views - 2 views to 1,000 in 30 seconds. #2Views');
    });
    /* X sign-in setup panel */
    $('xClientIdInput').value = V2.store.state.settings.xClientId || '';
    $('xCallbackUrl').textContent = location.origin + location.pathname;
    $('btnCopyCallback').addEventListener('click', function () {
      V2.share.copy(location.origin + location.pathname, 'Callback URL copied - paste it into your X app settings.');
    });
    $('btnSaveClientId').addEventListener('click', function () {
      var v = $('xClientIdInput').value.trim();
      V2.store.state.settings.xClientId = v;
      V2.store.save();
      refreshXStatus();
      if (v) { V2.oauth.signIn(); }
      else { toast('Client ID cleared. Demo profile active.'); }
    });
    $('btnTestSignIn').addEventListener('click', function () { V2.oauth.signIn(); });
    refreshXStatus();
    /* owner-only panel: hidden for public visitors unless ?setup=1 */
    if (!/[?&]setup=1/.test(location.search)) { $('xsetup').classList.add('hidden'); }
    var resetArmed = false, resetTimer = null;
    $('btnResetData').addEventListener('click', function () {
      var b = $('btnResetData');
      if (!resetArmed) {
        resetArmed = true;
        b.textContent = 'TAP AGAIN TO CONFIRM RESET';
        resetTimer = setTimeout(function () { resetArmed = false; b.textContent = 'RESET ALL LOCAL DATA'; }, 3500);
      } else {
        clearTimeout(resetTimer); resetArmed = false;
        V2.store.reset();
        b.textContent = 'RESET ALL LOCAL DATA';
        refreshAuth();
        V2.engine.setStyle(V2.cosmetics.current());
        renderProfile();
        toast('All local data reset.');
      }
    });
    function refreshXStatus() {
      $('xStatus').textContent = V2.oauth.configured()
        ? 'Client ID set - TEST SIGN-IN redirects to x.com and returns you here signed in.'
        : 'No Client ID yet - demo profile mode. Paste one above to enable X sign-in.';
    }
    /* touch */
    $('btnL').addEventListener('pointerdown', function (e) { e.preventDefault(); V2.engine.press(-1); });
    $('btnR').addEventListener('pointerdown', function (e) { e.preventDefault(); V2.engine.press(1); });
    /* keyboard pause */
    document.addEventListener('keydown', function (e) {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (V2.engine.stats().state === 'play') { pauseGame(); }
        else if (V2.engine.stats().state === 'pause') { resumeGame(); }
      }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { pauseGame(); } });
    window.addEventListener('blur', function () { pauseGame(); });
    window.addEventListener('resize', fitStage);
    /* install */
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstall = e;
      $('installBtn').classList.remove('hidden');
    });
    $('installBtn').addEventListener('click', function () {
      if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; $('installBtn').classList.add('hidden'); }
    });
    var iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (iOS && !standalone && !V2.store.state.seenInstallHint) {
      toast('Install 2 Views: Share menu -> Add to Home Screen.');
      V2.store.state.seenInstallHint = true;
      V2.store.save();
    }
    /* service worker (needs http/https; silently skipped on file://) */
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(function () {
          document.documentElement.setAttribute('data-sw', 'ready');
        }).catch(function () {
          document.documentElement.setAttribute('data-sw', 'failed');
        });
      }
    } else {
      document.documentElement.setAttribute('data-sw', 'file-protocol');
    }
    /* challenge deep link */
    pendingChallenge = V2.share.parseChallenge();
    refreshAuth();
    showStart();
    route();
    autotest();
  }

  /* ---------- built-in self-test (?autotest=1) ---------- */
  function autotest() {
    if (!/[?&]autotest=1/.test(location.search)) { return; }
    window.__errs = [];
    window.addEventListener('error', function (e) { window.__errs.push(String(e.message || e)); });
    setTimeout(function () { var b = $('btnStart'); if (b) { b.click(); } }, 400);
    var iv = setInterval(function () {
      var dir = (Math.floor(Date.now() / 500) % 2) ? 'ArrowRight' : 'ArrowLeft';
      window.dispatchEvent(new KeyboardEvent('keydown', { code: dir }));
      setTimeout(function () {
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft' }));
      }, 60);
    }, 500);
    setTimeout(function () {
      clearInterval(iv);
      var st = V2.engine.stats();
      var out = { errors: window.__errs, state: st.state, views: st.views, likes: st.likes,
                  combo: st.combo, timeLeft: +st.timeLeft.toFixed(1), mode: st.mode, sw: document.documentElement.getAttribute('data-sw') };
      console.log('SELFTEST_RESULT ' + JSON.stringify(out));
      document.documentElement.setAttribute('data-selftest', 'done');
    }, 10500);
  }

  return { init: init, toast: toast, refreshAuth: refreshAuth, showStart: showStart, startRun: startRun };
})();

/* boot: handle any OAuth callback first, then start the app */
(function () {
  function start() {
    V2.oauth.handleCallbackIfPresent()
      .then(function () { return V2.oauth.refreshIfNeeded(); })
      .then(function () { V2.app.init(); });
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); }
  else { start(); }
})();
