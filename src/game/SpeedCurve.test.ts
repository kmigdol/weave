import { describe, it, expect } from 'vitest';
import { getSpeed } from './SpeedCurve';
import { SPEED_MIN_MS, SPEED_MAX_MS } from './constants';

describe('getSpeed', () => {
  it('returns SPEED_MIN_MS at t=0', () => {
    expect(getSpeed(0)).toBe(SPEED_MIN_MS);
  });

  it('returns close to SPEED_MAX_MS at t=90', () => {
    const speed = getSpeed(90);
    // After 90 seconds (3 time constants), should be ~95% of the way to max
    const expected95pct = SPEED_MIN_MS + (SPEED_MAX_MS - SPEED_MIN_MS) * 0.9;
    expect(speed).toBeGreaterThanOrEqual(expected95pct);
    expect(speed).toBeLessThan(SPEED_MAX_MS);
  });

  it('returns essentially SPEED_MAX_MS at t=300', () => {
    expect(getSpeed(300)).toBeCloseTo(SPEED_MAX_MS, 1);
  });

  it('is monotonically increasing', () => {
    const s10 = getSpeed(10);
    const s30 = getSpeed(30);
    const s60 = getSpeed(60);
    const s90 = getSpeed(90);

    expect(s10).toBeLessThan(s30);
    expect(s30).toBeLessThan(s60);
    expect(s60).toBeLessThan(s90);
  });

  it('clamps negative time to SPEED_MIN_MS', () => {
    expect(getSpeed(-1)).toBe(SPEED_MIN_MS);
    expect(getSpeed(-100)).toBe(SPEED_MIN_MS);
  });
});
