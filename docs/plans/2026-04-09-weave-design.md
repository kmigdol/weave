# Weave — Design Doc

**Project:** Weave — 32-bit traffic weaving arcade game
**Jam:** 2026 Vibe Coding Game Jam (https://jam.pieter.com/2026)
**Deadline:** 2026-05-01 13:37 UTC
**Author:** Kayleigh Migdol
**Date:** 2026-04-09

---

## 1. Overview

Weave is an endless arcade score-chaser where the player taps between lanes on a dusk Bay Area freeway, threading through traffic at ever-rising speed. Near-misses build a combo multiplier. Drafting behind cars charges a BOOST that trades safety for score. The run ends on any collision. A global leaderboard creates the "one more run" social loop.

The identity hook is the **dusk 101 with AI lab parody billboards** — SF skyline silhouette, Sutro Tower, Bay Bridge in the distance, and roadside billboards referencing Anthropic, OpenAI, xAI, Cursor, Waymo, levels.io, and the jam itself, mixed with nonsense stealth-startup billboards ("Nexus. AI for the Cloud."). It's instantly recognizable to every judge in the jam.

## 2. Jam constraints (hard)

- 90%+ of all code must be written by AI
- Project must be created fresh after 2026-03-24
- Web-accessible, free-to-play, no authentication required
- Fast load, no heavy downloads or long loading screens
- Multiplayer preferred — satisfied by global leaderboard
- One entry per participant
- Three.js recommended by the jam organizers

## 3. Core loop

### Run structure (60–180 seconds of flow)
1. **On-ramp intro (~4s).** Car spawns on a short curved on-ramp, auto-accelerates 0 → ~60 mph. No scoring, no inputs accepted. "101 N" sign scrolls past. Pure cinematic build-up.
2. **Merge moment.** On-ramp curves into the rightmost lane of a 5-lane highway. "GO!" flash, scoring begins, inputs unlock.
3. **Highway.** Auto-accelerate from 80 → ~180 mph over 90 seconds, then plateau. Traffic spawns ahead. Player taps A/D or left/right screen halves to snap between lanes.
4. **Crash ends the run.** No health bar, no lives. Any collision = game over.
5. **Game over.** Run summary: score, best combo, distance, global rank. Name prompt if top 100. Retry returns to on-ramp with fresh traffic seed.

### Scoring inputs
- **Distance:** +1 point per meter traveled
- **Near-miss:** passing an adjacent-lane car within a narrow lateral threshold at speed = +100 × current combo. Combo increments by 1 per clean near-miss, resets to 1 if no near-miss in 3 seconds.
- **Slipstream → BOOST:** sitting in the draft zone (2–4 car lengths directly behind a car in your lane) for 1 second triggers BOOST — 3 seconds of +30% speed and a 2× score multiplier on all scoring inputs while active.

### Design tension
The core decision every second is "hug the draft for boost" vs "weave aggressively for combo." Drafting is safe but lane-locked; weaving is spiky and breaks drafts. The two mechanics fight each other — that tension is the whole game.

## 4. Controls

- **Desktop:** A/D or ←/→ to change lanes; Space to restart; Esc to pause
- **Mobile:** tap left/right half of screen to change lanes; tap to restart
- Discrete 5-lane snap (no continuous steering)
- Straight road, no curves on the main highway

## 5. Visuals & aesthetic

### Camera
Behind-the-car third-person chase cam. Slight FOV widening when BOOST is active. Subtle shake on near-miss and on crash.

### Environment (one scene, infinitely scrolling)
- **Sky:** warm gradient skybox (deep orange → magenta → navy). Sun billboard low on horizon. Dusk forever — no time of day cycle.
- **Road:** 5-lane concrete highway, painted lane markers, Jersey barriers on both sides. Tiles spawn ~200m ahead, despawn ~50m behind.
- **Horizon layers:**
  - **Far:** SF skyline silhouette card (Transamerica, Salesforce Tower, Sutro Tower), Bay Bridge silhouette, distant hills
  - **Mid:** palm trees, freeway signs ("SAN FRANCISCO 12", "EXIT 429 — VIBE CODING JAM"), overhead gantry signs
  - **Near:** roadside billboards on posts — **AI parody references** (see below)
- **Traffic cars:** Kenney car kit — sedans, trucks, vans, taxis. Each assigned a per-lane speed (slower right, faster left) with random variation. Occasional hazards: slow semi blocking a lane, swerving pickup.
- **Player car:** Kenney sedan with emissive tail-light material for readability at dusk.

### Billboard texture list (~15 unique)
- **Named parodies:** Anthropic, OpenAI, xAI, Cursor, Waymo, levels.io, Vibe Jam 2026
- **Culture jabs:** "STOP HIRING HUMANS", "WE RAISED $400M", "SHIP FAST BREAK STUFF"
- **Stealth-startup nothingburgers:** "Nexus. AI for the Cloud.", "Verdant — Autonomous Intelligence for Enterprise", "Loop.ai — Workflows, Reimagined", "Rho — The Platform for AI-Native Teams", "Synthetica — We're Hiring", "Kyros — Series B", a blank "[stealth]" in Helvetica
- **Fallback:** "YOUR AD HERE"

Generated as 512×256 PNG textures during the asset pass, packed into a shared billboard atlas. Swapping one takes seconds — we can keep adding jokes through the jam.

### Post-process
Single fullscreen CRT pass: scanlines, slight chromatic aberration, barrel distortion, vignette. This is the unifying aesthetic lever — everything that renders under it automatically looks 32-bit. Built early and applied from day one.

## 6. Audio

- **Music:** one looping synthwave/outrun track (CC0). Low-pass filter lifted + pitch up via Tone.js when BOOST is active.
- **SFX:** lane-change whoosh, near-miss *zip* (pitch rises with combo), slipstream whoosh, BOOST activation bass drop, crash crunch, UI blips.
- **Engine:** continuous tone with pitch tied to current speed.

## 7. Tech stack

- **Vite + TypeScript + Three.js** — fast dev reload, type safety, recommended by jam, massive training data
- **No UI framework** — single canvas, no React/Svelte
- **No physics engine** — custom AABB collisions (~20 lines of code)
- **Tone.js** — music + SFX + procedural boost effects
- **Supabase JS client** — leaderboard reads/writes
- **Vercel** — free hosting, auto-deploy from `main`, default vercel.app subdomain
- **GitHub** — repo at `kmigdol/weave`

## 8. Architecture

### Repo layout
```
weave/
├── src/
│   ├── main.ts              # entry, canvas mount, game loop tick
│   ├── game/
│   │   ├── Game.ts          # top-level state machine
│   │   ├── World.ts         # scene graph, road/prop/traffic spawning
│   │   ├── Player.ts        # player car, lane state, lane-change tween
│   │   ├── Traffic.ts       # AI traffic spawning, movement, despawn
│   │   ├── Scoring.ts       # distance, near-miss, combo, slipstream
│   │   ├── Collisions.ts    # AABB checks, near-miss zones, draft zones
│   │   ├── Input.ts         # keyboard + touch abstraction
│   │   └── PortalHook.ts    # stub for Vibe Jam inter-game portal (stretch)
│   ├── render/
│   │   ├── Renderer.ts      # three.js setup, camera rig, render loop
│   │   ├── CRTPass.ts       # post-process shader
│   │   └── Assets.ts        # asset loader (models, textures, billboards)
│   ├── audio/
│   │   └── Sound.ts         # Tone.js setup, SFX + music + boost filter
│   ├── ui/
│   │   ├── HUD.ts           # score, combo, boost meter (DOM overlay)
│   │   ├── GameOver.ts      # run summary, name entry, leaderboard
│   │   └── Menu.ts          # title screen
│   └── net/
│       └── Leaderboard.ts   # Supabase client, submit + fetch top 100
├── public/
│   ├── models/              # Kenney GLB files
│   ├── textures/            # billboards, road, sky
│   └── audio/               # music + SFX
├── supabase/
│   ├── migrations/          # scores table migration
│   └── functions/
│       └── submit-score/    # server-side plausibility validation
├── docs/plans/              # this doc lives here
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### Game loop
Fixed 60Hz simulation tick. Render interpolates between ticks. Fixed timestep matters because it keeps the game deterministic for a given RNG seed — cheap insurance for possible ghost replays and daily seed challenges on the stretch list.

### Collision model
Every car (player + traffic) has three axis-aligned boxes:
- **Hit box** — tight to the car geometry; touching ends the run
- **Near-miss zone** — wider laterally; brushing this while passing triggers the combo
- **Slipstream zone** — extends 2–4 car lengths behind; sitting in it charges boost

Every tick, only the player's boxes are checked against traffic cars within ~50m ahead/behind. Tiny active set, zero perf concerns.

### Traffic AI
Each car has a lane index and a target speed. No swerving (except scripted "aggressive driver" hazard type). Cars spawn ~300m ahead in a random lane with a speed below the player's current speed, drift backward in player-relative space, despawn behind.

### State machine
`Menu → OnRamp → Running → GameOver → (Menu | Running)`

Menu is skippable — first load goes straight to OnRamp.

## 9. Supabase leaderboard

### Schema
```sql
create table public.scores (
  id          uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 16),
  score       integer not null check (score >= 0),
  distance_m  integer not null check (distance_m >= 0),
  best_combo  integer not null check (best_combo >= 0),
  duration_s  integer not null check (duration_s >= 0),
  client_id   text not null,
  created_at  timestamptz not null default now()
);

create index scores_score_desc_idx on public.scores (score desc);

create or replace view public.leaderboard_top100 as
  select player_name, score, distance_m, best_combo, created_at
  from public.scores
  order by score desc
  limit 100;

alter table public.scores enable row level security;

grant select on public.leaderboard_top100 to anon;

create policy "anon can insert scores"
  on public.scores for insert
  to anon
  with check (true);
```

### Anti-cheat (lightweight, jam-appropriate)
- Edge function validates plausibility: `score ≤ distance * 50 + duration * 500`
- Rate limit: 1 submission per `client_id` per 10 seconds
- Not airtight by design. Stops casual tampering, doesn't chase real cheaters.

### Client flow
1. First load → generate UUID into localStorage as `client_id`
2. On crash, if score > personal best → prompt for name → POST to edge function
3. Game over screen fetches `leaderboard_top100` and highlights player's row if present
4. Title screen shows top 3 as attractor

## 10. Deploy pipeline

- GitHub `kmigdol/weave` → Vercel project → auto-deploy from `main` to default vercel.app subdomain
- PR preview URLs automatic — used for sharing playtest builds
- Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in Vercel and `.env.local`; `.env.local` in `.gitignore`
- Edge function deployed via `supabase functions deploy submit-score`
- All feature work in worktree branches → PR → main. Never commit directly to main.

## 11. MVP scope (must ship by 2026-05-01 13:37 UTC)

- Dusk Bay Area highway, one scene, infinite scroll
- On-ramp intro → 5-lane highway merge
- One sedan, discrete lane snap, keyboard + touch controls
- Auto-accelerating speed curve
- Near-miss combo scoring
- Slipstream draft → BOOST
- Traffic spawning with lane/speed variation + hazard cars
- Kenney car models, CRT shader, synthwave music, full SFX
- ~15 AI parody billboards
- HUD: score, combo, boost meter, speed
- Game over screen with rank + name entry
- Supabase global leaderboard (top 100)
- Vercel auto-deploy from main
- Playable on desktop and mobile
- Title screen with top 3 attractor

**Explicitly NOT in MVP:** multiple vehicles, campaign mode, rival drivers, off-road shortcuts, weather, multiple environments, ghost replays, real multiplayer.

## 12. Stretch list (prioritized)

Nothing from this list is touched until the MVP is end-to-end playable and deployed, where "end-to-end playable" means a stranger could load the URL, crash, submit a score, and see themselves on the leaderboard without help.

1. **Vibe Jam portal** — in-world portal teleporting to random jam entry. Native jam viral mechanic. Highest priority.
2. **Twitter/X share card** — one-click PNG of run stats + rank for social sharing.
3. **Daily seed challenge** — one deterministic seed per day, separate daily leaderboard.
4. **Motorcycle unlock** — second vehicle with narrower hitbox. Unlocks at a score threshold.
5. **Shortcut off-ramps** — occasional glowing exit signs leading to brief off-road shortcuts with risk/reward bonus multiplier.
6. **Achievements / run titles** — "Close Shave", "101 Regular", "Series A" etc. for social sharing.

## 13. Milestones

Each milestone is a single Linear ticket tracked as WEAVE-1 through WEAVE-5.

### Milestone 1 — Skeleton ships to Vercel (WEAVE-1)
Vite + Three.js scaffolded, pushed to GitHub, auto-deploying. Infinite road scrolls past a static camera. Cube moves between 5 lanes on keyboard + touch. Fixed-timestep loop in place. No assets, no traffic, no scoring.
**Gate:** friend can load deployed URL on phone and move the cube.

### Milestone 2 — Full gameplay loop (WEAVE-2)
Traffic spawns and scrolls. Collisions, near-miss detection, slipstream, boost, auto-accel. Crash → game over → restart. HUD shows score, combo, boost. Still programmer art.
**Gate:** the game is *fun* with no art or audio. If it isn't fun now, adding art won't save it.

### Milestone 3 — Look and feel (WEAVE-3)
Kenney car models swapped in. Dusk skybox, CRT shader, bloom. Billboards with AI parody textures. Music + SFX + engine sound. On-ramp intro scripted.
**Gate:** the game looks jam-trailer-worthy.

### Milestone 4 — Leaderboard + polish (WEAVE-4)
Supabase schema + edge function live. Name entry, submit, top-100 display. Title screen with top-3 attractor. Full mobile layout pass.
**Gate:** a stranger on mobile goes from URL to leaderboard in under a minute with zero instructions.

### Milestone 5 — Stretch + submission (WEAVE-5)
Portal, share card, any stretch items as time allows. Submission form filled. Buffer for playtest bugs.

## 14. Risks & mitigations

1. **Game feel tuning eats more time than expected.** Lane snap speed, near-miss radius, slipstream trigger range, camera shake, boost FOV — tiny numbers that are 80% of whether the game is fun.
   **Mitigation:** Milestone 2 is entirely about game feel before any art exists. If M2 isn't fun, fix the core loop before spending *any* time on M3.

2. **Mobile performance.** Three.js + bloom + CRT shader on mid-range Android can be rough.
   **Mitigation:** test on real phone at end of M1 before investing in visuals. Ship a `lowQuality` toggle that disables bloom and reduces draw distance if needed.

3. **Supabase edge function complexity.** If it becomes a drag, fall back to direct RLS-protected insert with a CHECK/trigger validator.
   **Mitigation:** simplest possible version first.

4. **Asset consistency.** Kenney cars + AI-generated billboards + CC0 audio could feel mismatched.
   **Mitigation:** CRT shader is the great equalizer. Build it in M1 so everything renders through the same post-process from day one.

5. **Scope creep from stretch list.** The hardest thing in a jam is resisting the cool idea that hits you on Thursday of week 2.
   **Mitigation:** MVP-first rule is non-negotiable. Stretch list lives in this doc; it does not get opened until M4 is green.

## 15. Pre-implementation verification

Before writing code for each milestone, run `verify-library-api` on:
- Three.js current stable + any breaking changes since training data
- Kenney car kit licenses + download URLs
- Supabase edge function runtime details (Deno version, crypto APIs)
- Tone.js current API
- Vite 6 / whatever's current

This catches stale API assumptions before they become bugs.
