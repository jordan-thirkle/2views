# 2 Views — global leaderboard Worker (optional)

A tiny Cloudflare Worker + D1 database that gives the PWA one shared leaderboard.
The game works fully without it (local on-device boards); this only adds a global board.

## Deploy in 4 commands

```bash
cd api
npm i -g wrangler           # once
wrangler login              # once
wrangler d1 create 2views-scores            # copy the database_id into wrangler.toml
wrangler d1 execute 2views-scores --remote --file=./schema.sql
wrangler deploy
```

Then set the printed Worker URL in `js/config.js`:

```js
LEADERBOARD_API: 'https://2views-leaderboard.<your-subdomain>.workers.dev',
```

## API

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET | `/scores` | `?mode=classic|daily|challenge&limit=25` | top rows, best first |
| POST | `/scores` | one score JSON (same shape the game logs locally) | `{ok:true}` |

Input is clamped server-side (name ≤ 20 chars, views ≤ 1,000,000, mode whitelist).
CORS is open (`*`) because the game is a static PWA; tighten `Access-Control-Allow-Origin`
to your hosting domain before going public.

## What is stored

Only: display name, handle string, and game stats (views, likes, combo, time left,
mode, feed seed, date). No accounts, no emails, no tokens, no IP logging.
