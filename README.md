# 2 Views — PWA

You are my last post. **2 views. 0 likes. 30 seconds to 1,000.**
Catch Replies / Quotes / Bookmarks, dodge External Links, "gm" bots, "MAP?" comments
and the giant Promo Screenshot. Every run banks impressions you can spend on cosmetics.

Made in AutoClaw with GLM-5.3-Flash in one prompt.

---

## Run it

Any static file server works — no build step, no dependencies:

```bash
cd 2views
python3 -m http.server 8080
# open http://localhost:8080
```

or `npx serve .`, or drop the folder on any static host (GitHub Pages, Netlify,
Cloudflare Pages). Double-clicking `index.html` also plays fine — only the
service worker / install prompt need http(s) (the app detects and degrades gracefully).

Entry point: `index.html` · no package.json, nothing to install.

## Folder map

```
2views/
├── index.html              app shell (sidebar, tabs, screens, overlays)
├── manifest.webmanifest    PWA manifest (installable, standalone, portrait)
├── sw.js                   service worker: offline app shell, stale-while-revalidate
├── css/style.css           x.com-style chrome + responsive + safe-area + reduced-motion
├── js/
│   ├── config.js           ALL tuning + integration points (X OAuth, leaderboard API, ads)
│   ├── core/               rng (seeded), events, storage, audio (WebAudio bleeps)
│   ├── game/engine.js      DOM-free game loop: spawns, collisions, rendering, seeds
│   ├── cosmetics/          catalog + buy/equip (themes, avatars, post texts)
│   ├── net/x-oauth.js      Sign in with X (OAuth 2.0 PKCE) + demo-profile fallback
│   ├── net/leaderboard.js  local boards (top 50/mode) + optional remote adapter
│   ├── share/share.js      X Web Intents, native share, clipboard, challenge links
│   ├── ads/adslots.js      reserved, clearly-labeled ad placements (placeholders)
│   └── app.js              navigation, auth UI, HUD, screens, self-test
├── icons/                  generated pixel-art PNGs + SVG favicon (regen: node tools/make-icons.js)
├── tools/make-icons.js     dependency-free PNG icon generator
└── api/                    OPTIONAL global leaderboard: Cloudflare Worker + D1 (see api/README.md)
```

## Modes & replayability

- **CLASSIC** — fresh random feed each run.
- **DAILY** — everyone on the same calendar-day feed (seed = UTC date). Same obstacles for all players; skill decides.
- **CHALLENGE LINKS** — every run ends with "Challenge a friend": a link like
  `index.html#c=03XBK2A&s=1248` replays the *exact same feed* (seeded RNG) with the
  score to beat shown on the start screen.

Determinism: all spawn decisions (type, lane, promo timing) use a seeded mulberry32
stream (`js/core/rng.js`). Visual-only randomness (screen shake) is unseeded.

## Sign in with X

**Setup (2 minutes, free tier is enough):**

1. Go to <https://developer.x.com> and sign in with your X account.
2. Create a **Project + App** (any name, e.g. "2 Views").
3. In the app: **User authentication settings → Set up**:
   - App permissions: **Read**
   - Type of App: **Web App, Automated App or Bot**
   - Callback URI: paste the exact URL shown in the game's Profile tab → *X sign-in setup*
     (for local dev: `http://127.0.0.1:8080/index.html` — X allows localhost/127.0.0.1;
     production must be `https://`)
   - Website URL: any URL you control
   - Enable OAuth 2.0; scopes used by the game: `tweet.read users.read offline.access`
4. Open **Keys and tokens** and copy the **OAuth 2.0 Client ID** (the Client Secret is
   NOT needed - the game uses PKCE as a public client).
5. In the game: **Profile → X sign-in setup** → paste the Client ID → **SAVE & CONNECT**.
   You are redirected to x.com, approve, and come back signed in. The ID is stored on
   your device (localStorage) - no code editing needed. Alternatively hardcode it in
   `js/config.js → X_OAUTH.clientId`.

Flow details (`js/net/x-oauth.js`): OAuth 2.0 Authorization Code + PKCE entirely in the
browser: authorize → token exchange → `GET /2/users/me` (incl. `profile_image_url_https`)
→ profile + avatar stored locally. The signed-in X avatar shows in the header, the profile
screen and pixelated on the player card in-game.
`offline.access` yields a refresh token; the app silently refreshes sessions on boot.
If the profile lookup is blocked by API tier limits, the app still keeps the session
(handles shown as `@x-user`). Without any Client ID the app stays fully playable with
a local **demo profile**; sign-in buttons explain this instead of breaking.
"Post your score" sharing never needs auth - it uses X Web Intents (`x.com/intent/post`).

## Leaderboards & privacy

- Local boards per mode, top 50, stored in `localStorage` only.
- Optional global board: deploy `api/` (4 commands in `api/README.md`), then set
  `LEADERBOARD_API` in `js/config.js`. The leaderboard screen merges global + local.
- Stored stats are exactly: display name, handle string, views, likes, best combo,
  time left, mode, feed seed, date. No emails, no follower graphs, no tokens, no IP logs.
  Server-side input is clamped/whitelisted (`api/worker.js`).

## Cosmetics

Shop tab: 5 card themes, 5 avatars, 5 post texts. Currency = **impressions** — every
run banks its views automatically. Buy/equip persists locally; equipped theme recolors
the player card and HUD accents live.

## Ad monetization (reserved slots)

Three clearly-labeled placeholder placements ship disabled-by-default-safe
(`js/config.js → ADS`): right-rail 300×250 (desktop), post-run banner, and an optional
interstitial between runs. House cards render until you wire a real network:

```js
V2.ads.inject('adSlotRail', function (slot) { slot.innerHTML = '<!-- your ad SDK tag -->'; });
```

When integrating a real network (AdSense, etc.) you are responsible for their program
policies; keep labels visible for house ads. No ad code ships in this repo.

## Platforms

- Desktop: Chrome/Edge/Firefox/Safari — keyboard (← → / A D, P pause, M mute).
- Mobile: touch taps + on-screen buttons, safe-area insets, standalone install
  (Android: in-app INSTALL APP button; iOS: Share → Add to Home Screen, hinted once).
- Offline: service worker caches the whole shell; scores/cosmetics persist locally.
- `prefers-reduced-motion` respected (shake/scanlines disabled).

## Self-test

Serve the folder, then open `http://localhost:3000/?autotest=1` with the console open:
the app auto-starts a run, simulates input for ~10s and logs
`SELFTEST_RESULT {...}` with live HUD values plus any runtime errors.

## Tests

Node's built-in runner, no dependencies:

```bash
node --test "test/*.test.js"
```

The suites stub a browser (`test/helpers/harness.js`) and cover the seeded-RNG
contract, the game engine's deterministic feed and end conditions, leaderboard
banking/caps, stored-state migration, shop buy/equip, challenge-link
parse/generate round-trips, the X OAuth PKCE flow, and the leaderboard Worker's
input clamping.

## Tuning

All difficulty numbers live in `js/config.js` (spawn rates, speeds, combo cap, promo
timing, goal, timer). Colors and copy are in `config.js` / `index.html`.
