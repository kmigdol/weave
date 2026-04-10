import {
  NEAR_MISS_BURST_PER_COMBO,
  NEAR_MISS_BURST_DURATION,
  COMBO_DECAY_TIME,
  SLIPSTREAM_CHARGE_TIME,
  BOOST_SPEED_BONUS,
  BOOST_DURATION,
} from './constants';

// ── Types ─────────────────────────────────────────────────────────────

export interface ScoringState {
  combo: number;
  bestCombo: number;
  comboTimer: number;

  slipstreamTimer: number;
  boostTimer: number;

  burstTimer: number;
  burstMultiplier: number;

  scoredCarIds: Set<number>;
  slipstreamCarId: number | null;
}

export interface ScoringEvents {
  nearMiss: boolean;
  boostActivated: boolean;
}

// ── Init / Reset ──────────────────────────────────────────────────────

export function initScoring(): ScoringState {
  return {
    combo: 0,
    bestCombo: 0,
    comboTimer: 0,
    slipstreamTimer: 0,
    boostTimer: 0,
    burstTimer: 0,
    burstMultiplier: 0,
    scoredCarIds: new Set(),
    slipstreamCarId: null,
  };
}

export const resetScoring = initScoring;

// ── Tick ──────────────────────────────────────────────────────────────

export function tickScoring(
  prev: ScoringState,
  dt: number,
  nearMisses: readonly { id: number }[],
  hits: readonly { id: number }[],
  slipstreams: readonly { id: number }[],
  despawnedIds: readonly number[],
): { state: ScoringState; events: ScoringEvents } {
  // Shallow-clone scalar fields; deep-clone the Set
  const state: ScoringState = {
    ...prev,
    scoredCarIds: new Set(prev.scoredCarIds),
  };

  const events: ScoringEvents = {
    nearMiss: false,
    boostActivated: false,
  };

  // ── 1. Clean up despawned IDs ───────────────────────────────────
  for (const id of despawnedIds) {
    state.scoredCarIds.delete(id);
  }

  // ── 2. Near-misses ──────────────────────────────────────────────
  const hitIds = new Set(hits.map((c) => c.id));
  let newNearMissCount = 0;

  for (const car of nearMisses) {
    // Skip if this car is also a hit, or already scored
    if (hitIds.has(car.id) || state.scoredCarIds.has(car.id)) continue;

    state.scoredCarIds.add(car.id);
    state.combo++;
    newNearMissCount++;
  }

  if (newNearMissCount > 0) {
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.comboTimer = 0;
    state.burstTimer = NEAR_MISS_BURST_DURATION;
    state.burstMultiplier = state.combo * NEAR_MISS_BURST_PER_COMBO;
    events.nearMiss = true;
  }

  // Advance combo timer (after resetting if needed)
  state.comboTimer += dt;

  if (state.comboTimer >= COMBO_DECAY_TIME) {
    state.combo = 0;
  }

  // ── 3. Slipstreams ─────────────────────────────────────────────
  if (slipstreams.length > 0) {
    const car = slipstreams[0]; // pick first in array
    if (car.id === state.slipstreamCarId) {
      // Same car — accumulate
      state.slipstreamTimer += dt;
    } else {
      // Different car — reset to this car
      state.slipstreamCarId = car.id;
      state.slipstreamTimer = dt;
    }

    if (state.slipstreamTimer >= SLIPSTREAM_CHARGE_TIME) {
      state.boostTimer = BOOST_DURATION;
      state.slipstreamTimer = 0;
      events.boostActivated = true;
    }
  } else {
    state.slipstreamCarId = null;
    state.slipstreamTimer = 0;
  }

  // ── 4. Decrement timers ────────────────────────────────────────
  state.boostTimer = Math.max(0, state.boostTimer - dt);
  state.burstTimer = Math.max(0, state.burstTimer - dt);

  return { state, events };
}

// ── Speed Multiplier ─────────────────────────────────────────────────

export function getSpeedMultiplier(state: ScoringState): number {
  let multiplier = 1.0;

  if (state.boostTimer > 0) {
    multiplier += BOOST_SPEED_BONUS;
  }

  if (state.burstTimer > 0) {
    multiplier += state.burstMultiplier;
  }

  return multiplier;
}
