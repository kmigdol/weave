import { describe, it, expect } from 'vitest';
import { FixedTimestepLoop } from './Loop';

const TICK = 1 / 60;

describe('FixedTimestepLoop', () => {
  it('runs one tick per frame when frame time equals timestep', () => {
    const loop = new FixedTimestepLoop(TICK);
    expect(loop.step(TICK)).toBe(1);
    expect(loop.step(TICK)).toBe(1);
  });

  it('runs zero ticks for a sub-timestep frame and accumulates residual', () => {
    const loop = new FixedTimestepLoop(TICK);
    expect(loop.step(TICK / 2)).toBe(0);
    // Second half-frame adds up to one full tick
    expect(loop.step(TICK / 2)).toBe(1);
  });

  it('runs multiple ticks when frame time exceeds timestep', () => {
    const loop = new FixedTimestepLoop(TICK);
    expect(loop.step(TICK * 3)).toBe(3);
  });

  it('caps ticks per frame to prevent spiral of death', () => {
    const loop = new FixedTimestepLoop(TICK, 5);
    // One second of dt at 1/60 timestep would be 60 ticks — should cap at 5
    expect(loop.step(1)).toBe(5);
  });

  it('discards accumulated time when capped to avoid catch-up stalls', () => {
    const loop = new FixedTimestepLoop(TICK, 5);
    loop.step(1); // 60 "owed" ticks, cap to 5 — remaining 55 discarded
    // A normal next frame should only produce 1 tick, not 56
    expect(loop.step(TICK)).toBe(1);
  });

  it('reports alpha as the fractional progress within the current tick', () => {
    const loop = new FixedTimestepLoop(TICK);
    loop.step(TICK * 0.25);
    expect(loop.alpha()).toBeCloseTo(0.25, 5);
    loop.step(TICK * 0.5); // accumulator now at 0.75 tick
    expect(loop.alpha()).toBeCloseTo(0.75, 5);
  });

  it('alpha is zero immediately after a full tick', () => {
    const loop = new FixedTimestepLoop(TICK);
    loop.step(TICK);
    expect(loop.alpha()).toBeCloseTo(0, 5);
  });
});
