# 2 Views — v2.1 upgrade changelog (Sep 2, 2026)

Shipped to production: https://jordan-thirkle.github.io/2views/
Every change verified live: zero runtime errors, gameplay self-test passing on production.

## New gameplay

- **★ Golden STAR** — rare flashing pickup worth +50 views (scales with combo). Spawns in
  ~2.5% of drops. Adds burst-chasing decisions: do you risk a lane change for it?
- **SHIELD power-up** — blocks one spam hit completely (LINK, gm or "MAP?"). Green ring
  glows around your card while active. ~5% of drops. Adds a real risk/reward layer:
  hold it for a bad moment, or burn it early.
- Both are deterministic per seed, so challenge links and daily feeds stay perfectly fair.

## Game feel ("juice")

- **Particle bursts** on every catch, hit, star and shield — colored per item type.
- **Twinkling background stars** — 26 pixel stars with individual phase, for depth.
- **Speed lines** racing down the feed, accelerating with the run.
- **Milestone banners** — "500 — HALFWAY TO VIRAL" and "900 — ALMOST THERE" with a
  rising chime, so every run has a dramatic arc.
- **Promo near-miss feedback** — dodge the giant screenshot and you get a "CLOSE!" snap
  plus a whoosh. Getting flattened by it feels as big as it looks.
- **Final-5-seconds urgency** — the feed frame pulses red while the clock dies.
- **Star flash** — the golden star strobes so you never miss it in a busy lane.

## Under the hood

- All randomness for stars/shields/milestones flows through the same seeded PRNG —
  challenge links and daily feeds remain perfectly reproducible.
- Particle/speed-line systems are allocation-light (in-place filtering), 60fps on canvas.
- Reduced-motion users: shake and scanline effects stay disabled; particles are subtle.

## Verification

- `node --check` on all touched files.
- Local + production self-tests: zero runtime errors, live telemetry confirms
  catches, combos, star pickups, shield blocks and timer behavior.
