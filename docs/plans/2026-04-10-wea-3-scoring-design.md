# WEA-3: Scoring + Combo + Slipstream + Boost + HUD — Design

**Ticket:** WEA-3
**Date:** 2026-04-10
**Status:** Approved

---

## Scoring Model

Score is purely **distance (meters)**. All reward mechanics feed through speed.

- **Base speed:** Existing exponential curve (24.6 → 80.5 m/s over ~30s)
- **Near-miss burst:** +10% of current speed × combo level, lasting 0.5s. A combo-5 near-miss gives +50% speed for half a second. Bursts don't stack — a new near-miss resets the burst timer with the new combo's multiplier.
- **Combo:** Starts at 0. Each clean near-miss increments by 1. Decays to 0 if no near-miss within 3 seconds. Best combo tracked for game-over stats.
- **BOOST (slipstream):** +30% speed for 3 seconds. Triggered by sitting in a car's slipstream zone for 1 second.
- **Effective speed each tick:** `baseSpeed × (1 + boostBonus + burstBonus)`
  - During BOOST with combo-3 burst: `base × (1 + 0.30 + 0.30) = 1.6×`

## Near-Miss Detection

Uses **tracked car IDs** (option 1). Each traffic car has a unique numeric ID. When a car appears in the `nearMisses` collision set but NOT in `hits`, and its ID hasn't been scored yet this run, award the near-miss. The ID is added to `scoredCarIds`. IDs are removed when the car despawns (Traffic reports recycled IDs).

## Architecture

### New files

- `src/game/Scoring.ts` — Pure-function state machine for combo, boost, burst, slipstream
- `src/game/Scoring.test.ts` — Unit tests for all scoring logic
- `src/ui/HUD.ts` — DOM overlay: score, combo, boost meter, speed

### Modified files

- `src/game/constants.ts` — Add scoring/boost/burst tuning knobs
- `src/game/GameState.ts` — Add bestCombo to RunningState and GameOverState
- `src/game/Game.ts` — Wire scoring into tick loop, update HUD, trigger camera effects
- `src/game/Traffic.ts` — Add unique IDs to traffic cars
- `src/render/Renderer.ts` — Camera shake + FOV widen during BOOST
- `src/ui/GameOverOverlay.ts` — Show final score, best combo, duration

### Not touched

Input.ts, Player.ts, World.ts, SpeedCurve.ts, CRTPass.ts, Loop.ts, PortalHook.ts

## Scoring.ts State Machine

```typescript
interface ScoringState {
  combo: number;              // current combo count (0 = no active combo)
  bestCombo: number;          // highest combo this run
  comboTimer: number;         // seconds since last near-miss (decays at 3s)

  slipstreamTimer: number;    // seconds in slipstream zone (resets on leave)
  boostTimer: number;         // seconds remaining of BOOST (0 = inactive)

  burstTimer: number;         // seconds remaining of speed burst (0 = inactive)
  burstMultiplier: number;    // combo-scaled multiplier for current burst

  scoredCarIds: Set<number>;  // cars already awarded a near-miss
  slipstreamCarId: number | null; // car currently being drafted
}
```

**API:**
- `initScoring() → ScoringState`
- `tickScoring(state, dt, collisionResult) → ScoringState`
- `getSpeedMultiplier(state) → number` — returns `1 + boostBonus + burstBonus`
- `resetScoring() → ScoringState`

**Tick logic:**
1. Check nearMisses minus hits → award new near-misses (skip scored IDs)
2. Check slipstreams → accumulate timer or reset; trigger BOOST at 1s
3. Decrement boost/burst/combo timers

## Visual Feedback

### HUD (`src/ui/HUD.ts`, DOM overlay)

- Top-left: distance as score + current speed in mph
- Top-center: combo counter (hidden when 0, CSS scale punch on increment)
- Bottom-center: boost meter fill bar (charges during slipstream, glows when BOOST active)
- Monospace font, semi-transparent backgrounds

### Near-miss juice (all DOM, zero GPU cost)

- **Floating text** — "+COMBO ×3" pops up center, drifts up, fades over 0.6s
- **Screen edge flash** — white/orange CSS box-shadow pulse, fades over 0.3s
- **Combo punch** — CSS scale(1.4) → 1.0 over 0.2s on combo element

### Camera effects (Renderer.ts)

- **Shake:** Additive random offset. Near-miss = ±0.05m / 0.15s. Crash = ±0.3m / 0.4s. Exponential decay.
- **FOV widen:** 75° → 83° during BOOST. Lerps at ~4°/s in and out.

### Game over screen

Add: final score (distance), best combo, duration (distance already shown).

## Constants (all in constants.ts)

```
NEAR_MISS_BURST_PER_COMBO = 0.10    // +10% speed per combo level
NEAR_MISS_BURST_DURATION = 0.5      // seconds
COMBO_DECAY_TIME = 3.0              // seconds before combo resets to 0
SLIPSTREAM_CHARGE_TIME = 1.0        // seconds in draft to trigger BOOST
BOOST_SPEED_BONUS = 0.30            // +30% speed
BOOST_DURATION = 3.0                // seconds
BOOST_FOV_INCREASE = 8              // degrees added during BOOST
SHAKE_NEAR_MISS_AMPLITUDE = 0.05    // meters
SHAKE_NEAR_MISS_DURATION = 0.15     // seconds
SHAKE_CRASH_AMPLITUDE = 0.3         // meters
SHAKE_CRASH_DURATION = 0.4          // seconds
```
