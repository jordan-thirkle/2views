window.V2 = window.V2 || {};
/* Deterministic RNG so feeds are replayable and shareable as challenge codes. */
V2.rng = (function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seedFromString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function randomSeed() { return (Math.random() * 0xFFFFFFFF) >>> 0; }
  function seedToCode(n) { return n.toString(36).toUpperCase().padStart(7, '0'); }
  function codeToSeed(c) { return parseInt(c, 36) >>> 0; }
  function dailyKey() { return new Date().toISOString().slice(0, 10); }
  return { mulberry32: mulberry32, seedFromString: seedFromString, randomSeed: randomSeed,
           seedToCode: seedToCode, codeToSeed: codeToSeed, dailyKey: dailyKey };
})();
