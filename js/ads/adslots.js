window.V2 = window.V2 || {};
/* Reserved ad placements - house placeholders only until a real network is wired.
   Integration point: V2.ads.inject(slotId, function(slot){ ...render network ad... })
   See README.md § AD MONETIZATION for policy notes. */
V2.ads = (function () {
  function houseCard(label) {
    var d = document.createElement('div');
    d.className = 'adcard';
    d.innerHTML = '<span class="adtag">AD SLOT</span>' +
      '<div class="adlabel">' + label + '</div>' +
      '<div class="adnote">reserved for a future ad partner - no ad served yet</div>';
    return d;
  }
  function init() {
    var cfg = V2.config.ADS;
    var rail = document.getElementById('adSlotRail');
    if (cfg.rightRail && rail && !rail.firstChild) { rail.appendChild(houseCard('Right rail · 300x250')); }
    var end = document.getElementById('adSlotEnd');
    if (cfg.endBanner && end && !end.firstChild) { end.appendChild(houseCard('Post-run banner · responsive')); }
  }
  function inject(slotId, renderFn) {
    var slot = document.getElementById(slotId);
    if (slot && typeof renderFn === 'function') { renderFn(slot); }
  }
  function showInterstitial() {
    if (!V2.config.ADS.interstitial) { return; }
    var ov = document.getElementById('ovAd');
    if (!ov) { return; }
    ov.innerHTML = '';
    ov.appendChild(houseCard('Interstitial · between runs'));
    var b = document.createElement('button');
    b.className = 'pill small';
    b.textContent = 'CONTINUE';
    b.addEventListener('click', function () { ov.classList.add('hidden'); });
    ov.appendChild(b);
    ov.classList.remove('hidden');
  }
  return { init: init, inject: inject, showInterstitial: showInterstitial };
})();
