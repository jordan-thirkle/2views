window.V2 = window.V2 || {};
V2.audio = (function () {
  var actx = null;
  function ensure() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') { actx.resume(); }
  }
  function beep(f, d, type, v, slide) {
    if (V2.store.state.settings.muted || !actx) { return; }
    try {
      var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type || 'square';
      o.frequency.setValueAtTime(f, t);
      if (slide) { o.frequency.linearRampToValueAtTime(Math.max(30, f + slide), t + d); }
      g.gain.setValueAtTime(v || 0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + d);
    } catch (e) {}
  }
  return {
    ensure: ensure,
    beep: beep,
    toggleMute: function () {
      V2.store.state.settings.muted = !V2.store.state.settings.muted;
      V2.store.save();
      return V2.store.state.settings.muted;
    },
    muted: function () { return V2.store.state.settings.muted; },
    catch: function (combo) { beep(400 + Math.min(combo, 22) * 38, 0.07, 'square', 0.045, 0); },
    hit: function () { beep(140, 0.18, 'sawtooth', 0.07, -80); },
    warn: function () { beep(220, 0.09, 'square', 0.05, 0); setTimeout(function () { beep(180, 0.09, 'square', 0.05, 0); }, 110); },
    win: function () { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { beep(f, 0.14, 'square', 0.06, 0); }, i * 120); }); },
    lose: function () { [300, 220, 150, 90].forEach(function (f, i) { setTimeout(function () { beep(f, 0.16, 'sawtooth', 0.07, 0); }, i * 140); }); },
    buy: function () { beep(880, 0.09, 'square', 0.05, 0); setTimeout(function () { beep(1175, 0.12, 'square', 0.05, 0); }, 90); },
    click: function () { beep(600, 0.04, 'square', 0.03, 0); }
  };
})();
