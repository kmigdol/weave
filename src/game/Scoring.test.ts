import { describe, it, expect } from 'vitest';
import {
  initScoring,
  tickScoring,
  getSpeedMultiplier,
  resetScoring,
  type ScoringState,
} from './Scoring';
import {
  NEAR_MISS_BURST_PER_COMBO,
  NEAR_MISS_BURST_DURATION,
  COMBO_DECAY_TIME,
  SLIPSTREAM_CHARGE_TIME,
  BOOST_SPEED_BONUS,
  BOOST_DURATION,
} from './constants';

// ── Helpers ───────────────────────────────────────────────────────────

function tick(
  state: ScoringState,
  dt: number,
  opts: {
    nearMisses?: readonly { id: number }[];
    hits?: readonly { id: number }[];
    slipstreams?: readonly { id: number }[];
    despawnedIds?: readonly number[];
  } = {},
) {
  return tickScoring(
    state,
    dt,
    opts.nearMisses ?? [],
    opts.hits ?? [],
    opts.slipstreams ?? [],
    opts.despawnedIds ?? [],
  );
}

// ── initScoring ──────────────────────────────────────────────────────

describe('initScoring', () => {
  it('returns clean state with all zeros, empty set, null slipstreamCarId', () => {
    const s = initScoring();

    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(0);
    expect(s.comboTimer).toBe(0);
    expect(s.slipstreamTimer).toBe(0);
    expect(s.boostTimer).toBe(0);
    expect(s.burstTimer).toBe(0);
    expect(s.burstMultiplier).toBe(0);
    expect(s.scoredCarIds.size).toBe(0);
    expect(s.slipstreamCarId).toBeNull();
  });
});

// ── Near-miss combo ─────────────────────────────────────────────────

describe('near-miss combo', () => {
  it('first near-miss sets combo to 1', () => {
    const s0 = initScoring();
    const { state } = tick(s0, 1 / 60, { nearMisses: [{ id: 1 }] });

    expect(state.combo).toBe(1);
    expect(state.bestCombo).toBe(1);
  });

  it('consecutive near-misses increment combo (1 → 2 → 3)', () => {
    let s = initScoring();

    // First near-miss: combo 1
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));
    expect(s.combo).toBe(1);

    // Second near-miss shortly after: combo 2
    ({ state: s } = tick(s, 0.5, { nearMisses: [{ id: 2 }] }));
    expect(s.combo).toBe(2);

    // Third near-miss: combo 3
    ({ state: s } = tick(s, 0.5, { nearMisses: [{ id: 3 }] }));
    expect(s.combo).toBe(3);
    expect(s.bestCombo).toBe(3);
  });

  it('combo decays to 0 after COMBO_DECAY_TIME seconds', () => {
    let s = initScoring();

    // Build combo
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));
    expect(s.combo).toBe(1);

    // Advance time past decay threshold (no near-misses)
    ({ state: s } = tick(s, COMBO_DECAY_TIME + 0.01));
    expect(s.combo).toBe(0);
  });

  it('same car is not scored twice', () => {
    let s = initScoring();

    // First tick: car 1 is near-miss → combo 1
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));
    expect(s.combo).toBe(1);

    // Second tick: same car 1 still in near-miss zone → no change
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));
    expect(s.combo).toBe(1);
  });

  it('car in hits is not scored as near-miss', () => {
    let s = initScoring();

    // Car 1 is in both hits and nearMisses — should NOT score near-miss
    ({ state: s } = tick(s, 1 / 60, {
      nearMisses: [{ id: 1 }],
      hits: [{ id: 1 }],
    }));
    expect(s.combo).toBe(0);
  });

  it('despawned car is removed from scoredCarIds', () => {
    let s = initScoring();

    // Score car 1
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));
    expect(s.scoredCarIds.has(1)).toBe(true);

    // Despawn car 1
    ({ state: s } = tick(s, 1 / 60, { despawnedIds: [1] }));
    expect(s.scoredCarIds.has(1)).toBe(false);
  });

  it('multiple near-misses in one tick (two new cars simultaneously)', () => {
    let s = initScoring();

    ({ state: s } = tick(s, 1 / 60, {
      nearMisses: [{ id: 1 }, { id: 2 }],
    }));
    // Both should score — combo increments by 2
    expect(s.combo).toBe(2);
    expect(s.bestCombo).toBe(2);
    expect(s.scoredCarIds.has(1)).toBe(true);
    expect(s.scoredCarIds.has(2)).toBe(true);
  });
});

// ── Near-miss burst ─────────────────────────────────────────────────

describe('near-miss burst', () => {
  it('activates burst with correct multiplier', () => {
    let s = initScoring();
    const dt = 1 / 60;
    ({ state: s } = tick(s, dt, { nearMisses: [{ id: 1 }] }));

    // burstTimer is set then decremented by dt in the same tick
    expect(s.burstTimer).toBeCloseTo(NEAR_MISS_BURST_DURATION - dt);
    // combo is 1 after this near-miss, so multiplier = 1 × 0.10
    expect(s.burstMultiplier).toBeCloseTo(1 * NEAR_MISS_BURST_PER_COMBO);
  });

  it('new near-miss during active burst resets timer with new multiplier', () => {
    let s = initScoring();
    const dt = 1 / 60;

    // First near-miss: combo 1, burst starts
    ({ state: s } = tick(s, dt, { nearMisses: [{ id: 1 }] }));
    expect(s.burstTimer).toBeCloseTo(NEAR_MISS_BURST_DURATION - dt);
    expect(s.burstMultiplier).toBeCloseTo(1 * NEAR_MISS_BURST_PER_COMBO);

    // Advance a bit (burst partially decayed)
    ({ state: s } = tick(s, 0.2));
    expect(s.burstTimer).toBeCloseTo(NEAR_MISS_BURST_DURATION - dt - 0.2);

    // Second near-miss: combo 2, burst resets with higher multiplier
    ({ state: s } = tick(s, dt, { nearMisses: [{ id: 2 }] }));
    // Timer resets to BURST_DURATION then decrements by dt
    expect(s.burstTimer).toBeCloseTo(NEAR_MISS_BURST_DURATION - dt);
    expect(s.burstMultiplier).toBeCloseTo(2 * NEAR_MISS_BURST_PER_COMBO);
  });

  it('burst decays to 0 after NEAR_MISS_BURST_DURATION', () => {
    let s = initScoring();
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));

    // Advance past burst duration
    ({ state: s } = tick(s, NEAR_MISS_BURST_DURATION + 0.01));
    expect(s.burstTimer).toBe(0);
  });
});

// ── Near-miss events ────────────────────────────────────────────────

describe('near-miss events', () => {
  it('nearMiss event fires when a new car is scored', () => {
    const s = initScoring();
    const { events } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] });

    expect(events.nearMiss).toBe(true);
  });

  it('nearMiss event does not fire for already-scored car', () => {
    let s = initScoring();
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));

    const { events } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] });
    expect(events.nearMiss).toBe(false);
  });
});

// ── Slipstream / BOOST ──────────────────────────────────────────────

describe('slipstream / BOOST', () => {
  it('slipstream accumulates over ticks', () => {
    let s = initScoring();

    ({ state: s } = tick(s, 0.3, { slipstreams: [{ id: 1 }] }));
    expect(s.slipstreamTimer).toBeCloseTo(0.3);
    expect(s.slipstreamCarId).toBe(1);

    ({ state: s } = tick(s, 0.3, { slipstreams: [{ id: 1 }] }));
    expect(s.slipstreamTimer).toBeCloseTo(0.6);
  });

  it('triggers BOOST at SLIPSTREAM_CHARGE_TIME', () => {
    let s = initScoring();
    const dt = SLIPSTREAM_CHARGE_TIME + 0.01;

    // Accumulate slipstream just past the charge threshold
    ({ state: s } = tick(s, dt, {
      slipstreams: [{ id: 1 }],
    }));

    // boostTimer set to BOOST_DURATION then decremented by dt in same tick
    expect(s.boostTimer).toBeCloseTo(BOOST_DURATION - dt);
    expect(s.slipstreamTimer).toBe(0); // resets after triggering
  });

  it('boostActivated event fires on BOOST trigger', () => {
    let s = initScoring();

    const { events } = tick(s, SLIPSTREAM_CHARGE_TIME + 0.01, {
      slipstreams: [{ id: 1 }],
    });

    expect(events.boostActivated).toBe(true);
  });

  it('slipstream resets when leaving zone (no slipstreams)', () => {
    let s = initScoring();

    ({ state: s } = tick(s, 0.5, { slipstreams: [{ id: 1 }] }));
    expect(s.slipstreamTimer).toBeCloseTo(0.5);

    // Leave slipstream zone
    ({ state: s } = tick(s, 0.1));
    expect(s.slipstreamTimer).toBe(0);
    expect(s.slipstreamCarId).toBeNull();
  });

  it('slipstream resets on car change', () => {
    let s = initScoring();

    ({ state: s } = tick(s, 0.5, { slipstreams: [{ id: 1 }] }));
    expect(s.slipstreamTimer).toBeCloseTo(0.5);

    // Switch to a different car
    ({ state: s } = tick(s, 0.3, { slipstreams: [{ id: 2 }] }));
    expect(s.slipstreamTimer).toBeCloseTo(0.3); // reset to dt
    expect(s.slipstreamCarId).toBe(2);
  });

  it('BOOST re-trigger resets to full duration', () => {
    let s = initScoring();
    const chargeDt = SLIPSTREAM_CHARGE_TIME + 0.01;

    // Trigger first BOOST
    ({ state: s } = tick(s, chargeDt, {
      slipstreams: [{ id: 1 }],
    }));
    expect(s.boostTimer).toBeCloseTo(BOOST_DURATION - chargeDt);

    // Partially decay BOOST
    ({ state: s } = tick(s, 1.0));
    expect(s.boostTimer).toBeCloseTo(BOOST_DURATION - chargeDt - 1.0);

    // Trigger second BOOST (different car, so slipstream resets to dt)
    ({ state: s } = tick(s, chargeDt, {
      slipstreams: [{ id: 2 }],
    }));
    // Different car: slipstreamTimer resets to dt = 1.01, which is >= SLIPSTREAM_CHARGE_TIME
    // So BOOST fires again, boostTimer = BOOST_DURATION - dt
    expect(s.boostTimer).toBeCloseTo(BOOST_DURATION - chargeDt);
  });

  it('BOOST timer decays to 0', () => {
    let s = initScoring();

    ({ state: s } = tick(s, SLIPSTREAM_CHARGE_TIME + 0.01, {
      slipstreams: [{ id: 1 }],
    }));

    // Advance past BOOST duration
    ({ state: s } = tick(s, BOOST_DURATION + 0.01));
    expect(s.boostTimer).toBe(0);
  });

  it('drafted car despawns — slipstreamCarId clears, timer resets', () => {
    let s = initScoring();

    ({ state: s } = tick(s, 0.5, { slipstreams: [{ id: 1 }] }));
    expect(s.slipstreamCarId).toBe(1);

    // Car 1 leaves slipstream zone (despawned or simply not in zone anymore)
    ({ state: s } = tick(s, 0.1));
    expect(s.slipstreamCarId).toBeNull();
    expect(s.slipstreamTimer).toBe(0);
  });
});

// ── getSpeedMultiplier ──────────────────────────────────────────────

describe('getSpeedMultiplier', () => {
  it('returns 1.0 with no active effects', () => {
    const s = initScoring();
    expect(getSpeedMultiplier(s)).toBe(1.0);
  });

  it('includes BOOST bonus when boostTimer > 0', () => {
    let s = initScoring();
    const dt = SLIPSTREAM_CHARGE_TIME + 0.01;
    ({ state: s } = tick(s, dt, {
      slipstreams: [{ id: 1 }],
    }));

    // boostTimer = BOOST_DURATION - dt, which is > 0
    expect(s.boostTimer).toBeGreaterThan(0);
    expect(getSpeedMultiplier(s)).toBeCloseTo(1.0 + BOOST_SPEED_BONUS);
  });

  it('includes burst multiplier when burstTimer > 0', () => {
    let s = initScoring();
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));

    // combo=1, burstMultiplier = 1 × 0.10
    expect(getSpeedMultiplier(s)).toBeCloseTo(
      1.0 + 1 * NEAR_MISS_BURST_PER_COMBO,
    );
  });

  it('BOOST + burst stack in getSpeedMultiplier', () => {
    let s = initScoring();
    const chargeDt = SLIPSTREAM_CHARGE_TIME + 0.01;
    const frameDt = 1 / 60;

    // Trigger BOOST first
    ({ state: s } = tick(s, chargeDt, {
      slipstreams: [{ id: 10 }],
    }));
    expect(s.boostTimer).toBeCloseTo(BOOST_DURATION - chargeDt);

    // Trigger near-miss (combo 1, burst active) — in the very next frame
    ({ state: s } = tick(s, frameDt, { nearMisses: [{ id: 1 }] }));

    // Both boostTimer and burstTimer should be > 0
    expect(s.boostTimer).toBeGreaterThan(0);
    expect(s.burstTimer).toBeGreaterThan(0);

    expect(getSpeedMultiplier(s)).toBeCloseTo(
      1.0 + BOOST_SPEED_BONUS + 1 * NEAR_MISS_BURST_PER_COMBO,
    );
  });
});

// ── Combined scenarios ──────────────────────────────────────────────

describe('combined scenarios', () => {
  it('near-miss + slipstream on same car trigger independently', () => {
    let s = initScoring();

    // Car 1 is in both near-miss and slipstream zones
    ({ state: s } = tick(s, 0.5, {
      nearMisses: [{ id: 1 }],
      slipstreams: [{ id: 1 }],
    }));

    // Near-miss should have scored
    expect(s.combo).toBe(1);
    // Slipstream should be accumulating
    expect(s.slipstreamTimer).toBeCloseTo(0.5);
    expect(s.slipstreamCarId).toBe(1);
  });

  it('bestCombo persists even after combo decays', () => {
    let s = initScoring();

    // Build combo to 3
    ({ state: s } = tick(s, 1 / 60, { nearMisses: [{ id: 1 }] }));
    ({ state: s } = tick(s, 0.5, { nearMisses: [{ id: 2 }] }));
    ({ state: s } = tick(s, 0.5, { nearMisses: [{ id: 3 }] }));
    expect(s.bestCombo).toBe(3);

    // Decay combo
    ({ state: s } = tick(s, COMBO_DECAY_TIME + 0.01));
    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(3); // best preserved
  });
});

// ── resetScoring ────────────────────────────────────────────────────

describe('resetScoring', () => {
  it('returns clean state same as initScoring', () => {
    const init = initScoring();
    const reset = resetScoring();

    expect(reset.combo).toBe(init.combo);
    expect(reset.bestCombo).toBe(init.bestCombo);
    expect(reset.comboTimer).toBe(init.comboTimer);
    expect(reset.slipstreamTimer).toBe(init.slipstreamTimer);
    expect(reset.boostTimer).toBe(init.boostTimer);
    expect(reset.burstTimer).toBe(init.burstTimer);
    expect(reset.burstMultiplier).toBe(init.burstMultiplier);
    expect(reset.scoredCarIds.size).toBe(init.scoredCarIds.size);
    expect(reset.slipstreamCarId).toBe(init.slipstreamCarId);
  });
});
