# WEA-2: Traffic + Collisions + Crash + Restart — Design

**Ticket:** WEA-2
**Date:** 2026-04-09
**Scope:** First half of the core gameplay loop — turns the WEA-1 scaffold into a playable arcade dodger.

---

## New Files

- **`src/game/Traffic.ts`** — traffic car spawning, movement, despawn, hazard types, object pool
- **`src/game/Collisions.ts`** — three-box AABB data structure (hit/near-miss/slipstream), active-set filtering, overlap checks
- **`src/game/SpeedCurve.ts`** — auto-accelerating speed: 80→~180 mph over 90s via exponential ease-out
- **`src/game/GameState.ts`** — state machine (`Running | GameOver`) + transition functions
- **`src/game/constants.ts`** — all tuning knobs in one file
- **`src/ui/GameOverOverlay.ts`** — temporary DOM overlay for game-over screen

## Modified Files

- **`src/game/Game.ts`** — replaces placeholder speed, adds Traffic + Collisions, game state, restart
- **`src/game/Player.ts`** — add z=0 constant for collision math

## Traffic System

Cars spawn ~300m ahead (z = -300) in a random lane with per-lane speed assignment (right lanes slower, left lanes faster, with variation). Spawn rate scales with player speed.

### Car types

- **Normal** — colored box at assigned lane speed
- **Semi (hazard, ~10%)** — slower, larger box, blocks a lane
- **Swerving pickup (hazard, ~5%)** — sinusoidal lateral oscillation within lane

### Data structure

```ts
interface TrafficCar {
  lane: number;
  speed: number;          // m/s
  z: number;              // world-space z (negative = ahead)
  type: 'normal' | 'semi' | 'swerving';
  mesh: Mesh;
  swayPhase: number;      // only used by swerving type
}
```

### Movement

Each tick, car moves toward player at `(playerSpeed - carSpeed)` relative rate. Swerving pickup adds sinusoidal x-offset. Despawn at z > +50m.

### Object pool

Meshes set `.visible = false` when returned to pool. Pool grows as needed, no disposal during gameplay.

## Collision System

### Three-box AABB per car

```ts
interface AABB { minX: number; maxX: number; minZ: number; maxZ: number }

interface CollisionBoxes {
  hitBox: AABB;
  nearMissZone: AABB;
  slipstreamZone: AABB;
}
```

### Box dimensions (tunable)

- **Hit box:** car geometry — ~1.6×3.8m normal, ~2.4×8m semi
- **Near-miss zone:** hit box + ~1.5m lateral padding each side
- **Slipstream zone:** car width × ~12m extending behind

### Active-set optimization

Filter to cars with `|car.z| < 50m` before collision checks. Keeps active set under ~10 cars.

### Collision result

Returns `{ hits, nearMisses, slipstreams }` arrays. WEA-2 only acts on `hits` (game over). Near-miss and slipstream signals computed but unused until WEA-3.

## Speed Curve

Pure function: `getSpeed(elapsedSeconds) → m/s`

Formula: `minSpeed + (maxSpeed - minSpeed) * (1 - e^(-t/tau))`

- Min: 80 mph (~35.8 m/s), Max: ~180 mph (~80.5 m/s), tau ≈ 30
- Plateaus after ~90s

## Game State

```ts
type GameState =
  | { phase: 'running'; elapsedSeconds: number; distanceMeters: number }
  | { phase: 'gameOver'; distanceMeters: number; durationSeconds: number };
```

Transitions: `startRun()` → running, `crashRun(state)` → gameOver. No Menu/OnRamp states yet.

## Game.ts Integration

1. Each tick: get speed from curve → update traffic positions → check collisions → if hit → gameOver
2. On gameOver: show overlay, stop sim ticks, listen for restart
3. On restart: clear traffic, reseed, reset player to center, fresh running state, hide overlay

## Game-Over Overlay

DOM `<div>` over canvas: "GAME OVER — distance 1,234m — press space to retry". Methods: `.show(distanceM, durationS)` / `.hide()`. Minimal inline styles.

## Constants File

All tuning knobs in `src/game/constants.ts`:
- Speed curve: min/max mph, tau
- Traffic: spawn distance, despawn distance, density curve, hazard rates
- Collision: hit box sizes per car type, near-miss padding, slipstream length
- Active-set range (50m)
