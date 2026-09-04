window.V2 = window.V2 || {};
/* 2 Views game engine. DOM-free: renders the canvas, reports via onFrame/onEnd.
   Feeds are deterministic per seed -> challenge links replay the exact same feed. */
V2.engine = (function () {
  var W = 320, H = 480, LANES = 5, LANE_W = 64;
  var cv, ctx;
  var S = 'idle';
  var views = 2, likes = 0, combo = 0, comboT = 0, bestCombo = 0;
  var elapsed = 0, stag = 0, shake = 0, scrollY = 0;
  var items = [], floats = [];
  var promo = null, promoT = 5.5, spawnAcc = 0;
  var particles = [], speedLines = [], stars = null, shield = false, banner = null, bannerT = 0, milestoneIdx = 0;
  var P = { lane: 2, x: 0, y: H - 96, w: 54, h: 46, cd: 0 };
  var held = { L: false, R: false }, th = { L: false, R: false };
  var last = 0, rafId = 0;
  var mode = 'classic', seed = 0, seedCode = '', rng = null;
  var onFrame = null, onEnd = null;
  var shakeEnabled = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var style = { color: '#1d9bf0', avatar: 'pixel', text: 'one prompt.' };
  var avatarImg = null, avatarImgOk = false;
  /* avatar = accent block + dark feature rects [x,y,w,h] in a 14x14 space */
  var AV = {
    pixel:  [[4, 5, 2, 3], [8, 5, 2, 3]],
    smiley: [[4, 4, 2, 2], [8, 4, 2, 2], [4, 9, 6, 2]],
    skull:  [[3, 4, 3, 3], [8, 4, 3, 3], [5, 10, 4, 2]],
    bot:    [[2, 5, 10, 4], [6, 2, 2, 2]],
    egg:    []
  };

  function laneX(l) { return l * LANE_W + (LANE_W - P.w) / 2; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function init(opts) {
    cv = opts.canvas;
    ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    onFrame = opts.onFrame || null;
    onEnd = opts.onEnd || null;
    P.x = laneX(P.lane);
    bindInput();
    stars = makeStars();
    var si0;
    for (si0 = 0; si0 < 7; si0++) { speedLines.push({ x: Math.random() * W, y: Math.random() * H, len: 8 + Math.random() * 16 }); }
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function setStyle(s) { style = s; }
  function setAvatarImage(img) {
    avatarImg = img || null;
    avatarImgOk = false;
    if (avatarImg) {
      if (avatarImg.complete && avatarImg.naturalWidth > 0) { avatarImgOk = true; }
      else {
        avatarImg.onload = function () { avatarImgOk = true; };
        avatarImg.onerror = function () { avatarImgOk = false; };
      }
    }
  }
  function dailyKey() { return V2.rng.dailyKey(); }

  function start(opts) {
    opts = opts || {};
    mode = opts.mode || 'classic';
    if (mode === 'daily') { seed = V2.rng.seedFromString('daily:' + dailyKey()); }
    else if (mode === 'challenge') { seed = V2.rng.codeToSeed(opts.seedCode); }
    else { seed = V2.rng.randomSeed(); }
    seedCode = V2.rng.seedToCode(seed);
    rng = V2.rng.mulberry32(seed);
    var c = V2.config;
    views = c.START_VIEWS; likes = 0; combo = 0; comboT = 0; bestCombo = 0;
    elapsed = 0; stag = 0; shake = 0; scrollY = 0;
    items = []; floats = []; promo = null; promoT = c.PROMO_FIRST; spawnAcc = 0;
    particles = []; speedLines = []; shield = false; banner = null; bannerT = 0; milestoneIdx = 0;
    stars = makeStars();
    var si;
    for (si = 0; si < 7; si++) { speedLines.push({ x: Math.random() * W, y: Math.random() * H, len: 8 + Math.random() * 16 }); }
    P.lane = 2; P.x = laneX(2); P.cd = 0;
    S = 'play';
  }
  function pause() { if (S === 'play') { S = 'pause'; } }
  function resume() { if (S === 'pause') { S = 'play'; last = performance.now(); } }
  function abort() { S = 'end'; }  /* leaving the game screen mid-run */

  function press(dir) {  /* -1 left, +1 right; used by touch buttons */
    if (S !== 'play') { return; }
    P.lane = clamp(P.lane + dir, 0, LANES - 1);
    P.cd = 0.15;
  }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      var k = e.code;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'Space') { e.preventDefault(); }
      V2.audio.ensure();
      if (k === 'ArrowLeft' || k === 'KeyA') { if (!e.repeat && S === 'play') { press(-1); } held.L = true; }
      else if (k === 'ArrowRight' || k === 'KeyD') { if (!e.repeat && S === 'play') { press(1); } held.R = true; }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.code;
      if (k === 'ArrowLeft' || k === 'KeyA') { held.L = false; }
      if (k === 'ArrowRight' || k === 'KeyD') { held.R = false; }
    });
    document.addEventListener('pointerdown', function () { V2.audio.ensure(); }, { passive: true });
  }
  function bindStage(stageEl, canvasEl) {
    stageEl.addEventListener('pointerdown', function (e) {
      if (S !== 'play') { return; }
      var r = canvasEl.getBoundingClientRect();
      if ((e.clientX - r.left) < r.width / 2) { th.L = true; press(-1); }
      else { th.R = true; press(1); }
    });
    window.addEventListener('pointerup', function () { th.L = false; th.R = false; });
    window.addEventListener('pointercancel', function () { th.L = false; th.R = false; });
  }

  function spawnItem() {
    var c = V2.config, type, r = rng();
    var special = rng();
    if (special < 0.025) { type = 'star'; }
    else if (special < 0.075) { type = 'shield'; }
    else if (r < c.GOOD_P) {
      var q = rng();
      type = q < 0.45 ? 'reply' : (q < 0.75 ? 'quote' : 'bookmark');
    } else {
      var q2 = rng();
      type = q2 < 0.38 ? 'link' : (q2 < 0.72 ? 'gm' : 'map');
    }
    var order = [0, 1, 2, 3, 4], i, j, tmp;
    for (i = order.length - 1; i > 0; i--) {
      j = (rng() * (i + 1)) | 0;
      tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    for (i = 0; i < order.length; i++) {
      var l = order[i], busy = false, k;
      for (k = 0; k < items.length; k++) { if (items[k].lane === l && items[k].y < 70) { busy = true; break; } }
      if (!busy) {
        var iw = (type === 'star') ? 54 : 46, ih = (type === 'star') ? 46 : 38;
        items.push({ type: type, lane: l, y: -50, w: iw, h: ih, dead: false });
        return;
      }
    }
  }
  function burst(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.45 + Math.random() * 0.25, c: color });
    }
  }
  function makeStars() {
    var arr = [];
    for (var i = 0; i < 26; i++) { arr.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * Math.PI * 2 }); }
    return arr;
  }
  function hitItem(it, ix, iy) {
    var c = V2.config;
    if (it.type === 'star') {
      var sg = c.EXTRA.star.base + Math.min(combo, c.COMBO_BONUS_CAP);
      views += sg; likes += 1; combo++; bestCombo = Math.max(bestCombo, combo); comboT = c.COMBO_WINDOW;
      floats.push({ t: '★ +' + sg, x: ix + 23, y: iy, c: c.EXTRA.star.c, life: 1.1 });
      burst(ix + 23, iy + 19, c.EXTRA.star.c, 14);
      V2.audio.star(); V2.events.emit('combo');
      return;
    }
    if (it.type === 'shield') {
      shield = true;
      floats.push({ t: 'SHIELD UP', x: ix + 23, y: iy, c: c.EXTRA.shield.c, life: 1 });
      burst(ix + 23, iy + 19, c.EXTRA.shield.c, 10);
      V2.audio.shieldUp();
      return;
    }
    var g = c.GOOD[it.type];
    if (g) {
      var gain = g.base + Math.min(combo, c.COMBO_BONUS_CAP);
      views += gain; likes += 1; combo++; bestCombo = Math.max(bestCombo, combo); comboT = c.COMBO_WINDOW;
      floats.push({ t: '+' + gain, x: ix + 23, y: iy, c: g.c, life: 0.8 });
      burst(ix + 23, iy + 19, g.c, 8);
      V2.audio.catch(combo);
      V2.events.emit('combo');
    } else if (shield) {
      shield = false;
      floats.push({ t: 'BLOCKED', x: ix + 23, y: iy, c: c.EXTRA.shield.c, life: 0.9 });
      V2.audio.block();
    } else {
      combo = 0; comboT = 0;
      if (it.type === 'link') { views = Math.floor(views * c.LINK_CUT); floats.push({ t: 'REACH SLASHED', x: ix - 8, y: iy, c: '#f4212e', life: 1 }); shake = 14; }
      else if (it.type === 'gm') { views = Math.max(0, views - c.GM_HIT); floats.push({ t: 'gm. -' + c.GM_HIT, x: ix - 4, y: iy, c: '#8b98a5', life: 1 }); shake = 9; }
      else { views = Math.max(0, views - c.MAP_HIT); floats.push({ t: '"MAP?" -' + c.MAP_HIT, x: ix - 12, y: iy, c: '#f4212e', life: 1 }); shake = 12; }
      burst(ix + 23, iy + 19, '#f4212e', 10);
      V2.audio.hit();
      V2.events.emit('hurt');
    }
  }
  function endGame(reason) {
    S = 'end';
    held.L = false; held.R = false; th.L = false; th.R = false;
    var result = {
      mode: mode, seedCode: seedCode, views: views, likes: likes,
      bestCombo: bestCombo, timeLeftSec: Math.max(0, V2.config.TIME - elapsed),
      win: reason === 'win', reason: reason
    };
    if (reason === 'win') { V2.audio.win(); } else { V2.audio.lose(); }
    if (onEnd) { onEnd(result); }
  }

  function update(dt) {
    var c = V2.config;
    elapsed += dt;
    if (elapsed >= c.TIME) { endGame('time'); return; }
    var prog = elapsed / c.TIME;
    var speed = c.SPEED0 + (c.SPEED1 - c.SPEED0) * prog;
    scrollY = (scrollY + speed * dt) % 48;
    spawnAcc += dt;
    var si = c.SPAWN0 + (c.SPAWN1 - c.SPAWN0) * prog;
    while (spawnAcc >= si) { spawnAcc -= si; spawnItem(); }
    if (!promo) {
      promoT -= dt;
      if (promoT <= 0) {
        promo = { phase: 'warn', lane: (rng() * LANES) | 0, t: c.PROMO_WARN };
        V2.audio.warn(); V2.events.emit('promoWarn');
      }
    } else if (promo.phase === 'warn') {
      promo.t -= dt;
      if (promo.t <= 0) { promo.phase = 'fall'; promo.y = -158; }
    } else {
      promo.y += speed * c.PROMO_SPEED * dt;
      if (!promo.near && promo.y + 150 > P.y) {
        promo.near = true;
        if (promo.lane !== P.lane) {
          floats.push({ t: 'CLOSE!', x: promo.lane * LANE_W + 32, y: P.y - 8, c: '#f4212e', life: 0.9 });
          V2.audio.whoosh();
        }
      }
      if (promo.y > H + 20) {
        promo = null;
        promoT = c.PROMO_MIN + rng() * (c.PROMO_MAX - c.PROMO_MIN);
        V2.events.emit('promoGone');
      }
    }
    var i, it;
    for (i = 0; i < items.length; i++) { it = items[i]; it.y += speed * dt; }
    var pi;
    for (pi = 0; pi < particles.length; pi++) {
      var pt = particles[pi];
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 60 * dt; pt.life -= dt;
    }
    var kp = [];
    for (pi = 0; pi < particles.length; pi++) { if (particles[pi].life > 0) { kp.push(particles[pi]); } }
    particles = kp;
    for (pi = 0; pi < speedLines.length; pi++) {
      speedLines[pi].y += speed * 1.8 * dt;
      if (speedLines[pi].y > H) { speedLines[pi].y = -20; speedLines[pi].x = Math.random() * W; speedLines[pi].len = 8 + Math.random() * 16; }
    }
    if (bannerT > 0) { bannerT -= dt; }
    P.cd -= dt;
    var L = held.L || th.L, R = held.R || th.R;
    if (P.cd <= 0 && (L !== R)) { press(L ? -1 : 1); }
    var tx = laneX(P.lane);
    P.x += (tx - P.x) * Math.min(1, dt * 16);
    var px = P.x + 4, py = P.y + 4, pw = P.w - 8, ph = P.h - 8;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.dead) { continue; }
      var ix = it.lane * LANE_W + (LANE_W - it.w) / 2 + 2, iy = it.y + 2, iw = it.w - 4, ih = it.h - 4;
      if (px < ix + iw && px + pw > ix && py < iy + ih && py + ph > iy) { it.dead = true; hitItem(it, ix, iy); }
    }
    var kept = [];
    for (i = 0; i < items.length; i++) { if (!items[i].dead && items[i].y < H + 60) { kept.push(items[i]); } }
    items = kept;
    if (promo && promo.phase === 'fall') {
      var ax = promo.lane * LANE_W + 4, ay = promo.y + 4, aw = 48, ah = 142;
      if (px < ax + aw && px + pw > ax && py < ay + ah && py + ph > ay) { endGame('promo'); return; }
    }
    if (views >= c.GOAL) { endGame('win'); return; }
    var mi = c.MILESTONES[milestoneIdx];
    if (mi && views >= mi.v) { banner = mi.t; bannerT = 1.8; milestoneIdx++; V2.audio.milestone(); }
    comboT -= dt;
    if (comboT <= 0 && combo > 0) { combo = 0; }
    if (views < c.STAG_FLOOR) { stag += dt; if (stag >= c.STAG_LIMIT) { endGame('stagnant'); return; } }
    else { stag = 0; }
    var nf = [];
    for (i = 0; i < floats.length; i++) { var f = floats[i]; f.y -= 30 * dt; f.life -= dt; if (f.life > 0) { nf.push(f); } }
    floats = nf;
    shake = Math.max(0, shake - 30 * dt);
  }

  function drawItem(it) {
    var g = V2.config.GOOD[it.type] || V2.config.BAD[it.type] || V2.config.EXTRA[it.type];
    var x = Math.round(it.lane * LANE_W + (LANE_W - it.w) / 2), y = Math.round(it.y), w = it.w, h = it.h;
    var flash = (it.type === 'star') && (Math.sin(Date.now() / 110) > 0);
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(x, y, w, h);
    if (flash) { ctx.fillStyle = g.c; ctx.fillRect(x + 1, y + 1, w - 2, h - 2); }
    ctx.fillStyle = g.c;
    var bw = (it.type === 'star') ? 4 : 3;
    ctx.fillRect(x, y, w, bw); ctx.fillRect(x, y + h - bw, w, bw); ctx.fillRect(x, y, bw, h); ctx.fillRect(x + w - bw, y, bw, h);
    ctx.fillRect(x + 5, y + 7, 6, 6);
    ctx.fillStyle = flash ? '#000' : g.c;
    ctx.font = (g.t.length > 6 ? 'bold 8px' : 'bold 10px') + ' monospace';
    ctx.textAlign = 'center';
    ctx.fillText(g.t, x + w / 2, y + h / 2 + 9);
  }
  function drawPromo(p, t) {
    var x = p.lane * LANE_W + 4, y = Math.round(p.y), w = 56, h = 150;
    ctx.fillStyle = '#cfd9de'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#657786'; ctx.fillRect(x + 4, y + 4, 26, 6);
    ctx.fillStyle = '#8899a6'; ctx.fillRect(x + 4, y + 16, 14, 14);
    ctx.fillStyle = '#aab8c2';
    ctx.fillRect(x + 22, y + 16, 28, 3); ctx.fillRect(x + 22, y + 22, 20, 3);
    ctx.fillRect(x + 4, y + 36, 48, 4); ctx.fillRect(x + 4, y + 44, 40, 4);
    ctx.fillStyle = '#8899a6'; ctx.fillRect(x + 4, y + 54, 48, 42);
    ctx.fillStyle = '#f4212e'; ctx.fillRect(x + 4, y + 124, 48, 18);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.fillText('PROMO', x + 28, y + 137);
    if (Math.floor(t * 6) % 2 === 0) { ctx.strokeStyle = '#f4212e'; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); ctx.lineWidth = 1; }
  }
  function drawPlayer() {
    var x = Math.round(P.x), y = P.y, w = P.w, h = P.h;
    var ac = style.color;
    ctx.fillStyle = '#000'; ctx.fillRect(x + 4, y + 4, w, h);
    ctx.fillStyle = '#15202b'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ac;
    ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y + h - 3, w, 3); ctx.fillRect(x, y, 3, h); ctx.fillRect(x + w - 3, y, 3, h);
    if (avatarImgOk) {
      ctx.drawImage(avatarImg, x + 7, y + 8, 14, 14);
    } else {
      ctx.fillStyle = ac;
      ctx.fillRect(x + 7, y + 8, 14, 14);
      ctx.fillStyle = '#000';
      var feats = AV[style.avatar] || AV.pixel, i;
      for (i = 0; i < feats.length; i++) { ctx.fillRect(x + 7 + feats[i][0], y + 8 + feats[i][1], feats[i][2], feats[i][3]); }
    }
    ctx.fillStyle = '#8899a6'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left';
    ctx.fillText(V2.store.state.profile.handle, x + 25, y + 14);
    ctx.fillStyle = '#e7e9ea'; ctx.font = '7px monospace';
    ctx.fillText(style.text.slice(0, 14), x + 25, y + 22);
    ctx.fillStyle = '#f91880'; ctx.font = 'bold 8px monospace'; ctx.fillText('\u2665', x + 7, y + h - 7);
    ctx.fillStyle = '#8899a6'; ctx.font = '7px monospace'; ctx.fillText(views + ' views', x + 16, y + h - 7);
  }
  function render(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (shake > 0 && shakeEnabled) { ctx.translate(((Math.random() * 2 - 1) * shake) | 0, ((Math.random() * 2 - 1) * shake) | 0); }
    var i, y;
    for (i = 0; i < LANES; i++) { if (i % 2 === 1) { ctx.fillStyle = '#07090c'; ctx.fillRect(i * LANE_W, 0, LANE_W, H); } }
    ctx.fillStyle = '#141a20';
    for (i = 1; i < LANES; i++) { ctx.fillRect(i * LANE_W - 1, 0, 2, H); }
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (y = (scrollY % 48) - 48; y < H; y += 48) { ctx.fillRect(0, y, W, 2); }
    for (i = 0; i < stars.length; i++) {
      ctx.globalAlpha = 0.2 + 0.22 * Math.sin(t * 2 + stars[i].p);
      ctx.fillStyle = '#8b98a6';
      ctx.fillRect(Math.round(stars[i].x), Math.round(stars[i].y), 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(231,233,234,0.09)';
    for (i = 0; i < speedLines.length; i++) {
      ctx.fillRect(Math.round(speedLines[i].x), Math.round(speedLines[i].y), 1, Math.round(speedLines[i].len));
    }
    if (promo && promo.phase === 'warn') {
      var wx = promo.lane * LANE_W + 18;
      if (Math.floor(t * 8) % 2 === 0) {
        ctx.fillStyle = '#f4212e'; ctx.fillRect(wx, 6, 28, 28);
        ctx.fillStyle = '#000'; ctx.fillRect(wx + 11, 12, 6, 10); ctx.fillRect(wx + 11, 25, 6, 5);
      }
    }
    for (i = 0; i < items.length; i++) { drawItem(items[i]); }
    if (promo && promo.phase === 'fall') { drawPromo(promo, t); }
    drawPlayer();
    if (shield) {
      ctx.strokeStyle = '#00ba7c';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(P.x) - 3, Math.round(P.y) - 3, P.w + 6, P.h + 6);
      ctx.lineWidth = 1;
    }
    for (i = 0; i < particles.length; i++) {
      var pc = particles[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, pc.life * 2.2));
      ctx.fillStyle = pc.c;
      ctx.fillRect(Math.round(pc.x), Math.round(pc.y), 2, 2);
    }
    ctx.globalAlpha = 1;
    if (bannerT > 0 && banner) {
      ctx.globalAlpha = Math.min(1, bannerT);
      ctx.fillStyle = '#000';
      ctx.fillRect(W / 2 - 112, 92, 224, 26);
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
      ctx.strokeRect(W / 2 - 112, 92, 224, 26);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(banner, W / 2, 109);
      ctx.globalAlpha = 1;
    }
    if (S === 'play' && V2.config.TIME - elapsed <= 5) {
      ctx.globalAlpha = 0.15 + 0.13 * Math.sin(t * 10);
      ctx.strokeStyle = '#f4212e';
      ctx.lineWidth = 6;
      ctx.strokeRect(2, 2, W - 4, H - 4);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    for (i = 0; i < floats.length; i++) {
      var f = floats[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.8));
      ctx.fillStyle = f.c; ctx.font = 'bold 10px monospace';
      ctx.fillText(f.t, clamp(f.x, 34, W - 34), f.y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S === 'play') { update(dt); }
    render(now / 1000);
    if (onFrame) {
      onFrame({
        state: S, mode: mode, seedCode: seedCode, views: views, likes: likes, combo: combo,
        timeLeft: Math.max(0, V2.config.TIME - elapsed),
        progress: Math.min(1, views / V2.config.GOAL),
        stagWarn: S === 'play' && views < V2.config.STAG_FLOOR && stag > 0.5,
        stagLeft: Math.max(0, V2.config.STAG_LIMIT - stag),
        promoWarn: !!(promo && promo.phase === 'warn')
      });
    }
    rafId = requestAnimationFrame(loop);
  }
  function stats() {
    return { state: S, mode: mode, seedCode: seedCode, views: views, likes: likes, combo: combo, bestCombo: bestCombo,
             timeLeft: Math.max(0, V2.config.TIME - elapsed) };
  }
  function fit(hudH) {
    var availH = window.innerHeight - hudH - 30;
    var availW = Math.min(window.innerWidth - 16, 560);
    var s = Math.min(availW / W, availH / H);
    if (!(s > 0.3)) { s = 0.3; }
    cv.style.width = Math.round(W * s) + 'px';
    cv.style.height = Math.round(H * s) + 'px';
  }
  return { init: init, start: start, pause: pause, resume: resume, abort: abort, press: press,
           bindStage: bindStage, setStyle: setStyle, setAvatarImage: setAvatarImage, stats: stats, fit: fit, dailyKey: dailyKey,
           W: W, H: H };
})();
