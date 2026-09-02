window.V2 = window.V2 || {};
/* Cosmetics: player card themes, avatar patterns, post texts.
   Currency = "impressions" banked from every run's views. */
V2.cosmetics = (function () {
  var CATALOG = [
    { id: 'classic',    kind: 'themes',  name: 'Classic Blue',   color: '#1d9bf0', price: 0   },
    { id: 'midnight',   kind: 'themes',  name: 'Midnight',       color: '#71767b', price: 400 },
    { id: 'gold',       kind: 'themes',  name: 'Verified Gold',  color: '#d4a017', price: 900 },
    { id: 'toxic',      kind: 'themes',  name: 'Toxic Green',    color: '#00ba7c', price: 500 },
    { id: 'blood',      kind: 'themes',  name: 'Blood Red',      color: '#f4212e', price: 750 },
    { id: 'pixel',      kind: 'avatars', name: 'Pixel',          price: 0   },
    { id: 'egg',        kind: 'avatars', name: 'Egg',            price: 250 },
    { id: 'smiley',     kind: 'avatars', name: 'Smiley',         price: 300 },
    { id: 'bot',        kind: 'avatars', name: 'Bot',            price: 300 },
    { id: 'skull',      kind: 'avatars', name: 'Skull',          price: 450 },
    { id: 'one-prompt', kind: 'texts',   name: 'One prompt',     text: 'one prompt.',              price: 0   },
    { id: 'day1',       kind: 'texts',   name: 'Day one',        text: 'day 1 of posting.',        price: 200 },
    { id: 'gm2',        kind: 'texts',   name: 'gm to 2 viewers',text: 'gm to my 2 viewers',       price: 350 },
    { id: 'algo',       kind: 'texts',   name: 'Algorithm pls',  text: 'algorithm notice me pls',  price: 500 },
    { id: 'ratio',      kind: 'texts',   name: 'Ratio me',       text: 'ratio me, coward',         price: 600 }
  ];
  function byId(id) {
    for (var i = 0; i < CATALOG.length; i++) { if (CATALOG[i].id === id) { return CATALOG[i]; } }
    return null;
  }
  function owned(item) {
    var inv = V2.store.state.inventory;
    return (inv[item.kind + 's'] || []).indexOf(item.id) >= 0;
  }
  function buy(item) {
    var s = V2.store.state;
    if (owned(item)) { return { ok: false, reason: 'owned' }; }
    if (s.balance < item.price) { return { ok: false, reason: 'funds' }; }
    s.balance -= item.price;
    s.inventory[item.kind + 's'].push(item.id);
    V2.store.save();
    V2.events.emit('cosmetics');
    return { ok: true };
  }
  function equip(item) {
    if (!owned(item)) { return false; }
    V2.store.state.equipped[item.kind] = item.id;
    V2.store.save();
    V2.events.emit('cosmetics');
    return true;
  }
  function current() {
    var eq = V2.store.state.equipped;
    var th = byId(eq.theme), av = byId(eq.avatar), tx = byId(eq.text);
    return {
      color: (th && th.color) || '#1d9bf0',
      avatar: av ? av.id : 'pixel',
      text: (tx && tx.text) || 'one prompt.'
    };
  }
  return { CATALOG: CATALOG, byId: byId, owned: owned, buy: buy, equip: equip, current: current };
})();
