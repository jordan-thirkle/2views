window.V2 = window.V2 || {};
V2.config = {
  NAME: '2 Views',
  VERSION: '2.0.0',
  /* ---- game tuning (edit freely) ---- */
  GOAL: 1000,            // views needed to win
  TIME: 30,              // run length (seconds)
  START_VIEWS: 2,
  STAG_LIMIT: 8,         // seconds under STAG_FLOOR views -> shadowban loss
  STAG_FLOOR: 20,
  COMBO_WINDOW: 3,       // seconds to keep a combo chain alive
  COMBO_BONUS_CAP: 25,   // max bonus views per catch from combo
  SPEED0: 120, SPEED1: 230,     // feed fall speed ramp (px/s)
  SPAWN0: 0.55, SPAWN1: 0.28,   // spawn interval ramp (s)
  PROMO_FIRST: 5.5, PROMO_MIN: 5, PROMO_MAX: 8,
  PROMO_WARN: 0.8, PROMO_SPEED: 1.55,
  LINK_CUT: 0.60,        // external link: views *= this (=-40% reach)
  GM_HIT: 35, MAP_HIT: 55,
  GOOD_P: 0.68,          // share of spawns that are catchable
  GOOD: {
    reply:    { c: '#1d9bf0', t: 'REPLY',    base: 16 },
    quote:    { c: '#a863f9', t: 'QUOTE',    base: 24 },
    bookmark: { c: '#ffd400', t: 'BOOKMARK', base: 20 }
  },
  BAD: {
    link: { c: '#f4212e', t: 'LINK' },
    gm:   { c: '#8b98a5', t: 'gm'   },
    map:  { c: '#566372', t: 'MAP?' }
  },
  EXTRA: {
    star:   { c: '#ffd700', t: '★',  base: 50 },
    shield: { c: '#00ba7c', t: 'SHIELD' }
  },
  STAR_P: 0.025,
  SHIELD_P: 0.05,
  MILESTONES: [
    { v: 500, t: '500 — HALFWAY TO VIRAL' },
    { v: 900, t: '900 — ALMOST THERE' }
  ],
  /* ---- integrations (see README.md) ----
     X_OAUTH.clientId: create an app at developer.x.com (OAuth 2.0 public client),
     add your callback URL, paste the Client ID here. Empty => demo profile mode. */
  X_OAUTH: {
    clientId: 'TkR3Q25zNEoyVTR0SGhWcVBObEU6MTpjaQ',
    authorizeUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    usersMeUrl: 'https://api.x.com/2/users/me',
    scopes: 'tweet.read users.read offline.access'
  },
  /* Global leaderboard API base URL (Cloudflare Worker in /api). Empty => local only. */
  LEADERBOARD_API: '',
  /* Reserved ad placements. Placeholders only until you wire a network. */
  ADS: { rightRail: true, endBanner: true, interstitial: false }
};
