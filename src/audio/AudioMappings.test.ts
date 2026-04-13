import { describe, it, expect } from 'vitest';
import { speedToFrequency, comboToFrequency } from './AudioManager';

describe('speedToFrequency', () => {
  it('returns 110 Hz (A2) at min speed 24.6 m/s', () => {
    expect(speedToFrequency(24.6)).toBeCloseTo(110, 1);
  });

  it('returns 440 Hz (A4) at max speed 80.5 m/s', () => {
    expect(speedToFrequency(80.5)).toBeCloseTo(440, 1);
  });

  it('clamps to 110 Hz below min speed', () => {
    expect(speedToFrequency(0)).toBe(110);
  });

  it('clamps to 440 Hz above max speed', () => {
    expect(speedToFrequency(100)).toBe(440);
  });
});

describe('comboToFrequency', () => {
  it('returns 990 Hz for combo 1', () => {
    expect(comboToFrequency(1)).toBe(990);
  });

  it('returns 1430 Hz for combo 5', () => {
    expect(comboToFrequency(5)).toBe(1430);
  });
});
