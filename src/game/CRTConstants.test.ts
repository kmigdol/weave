import { describe, it, expect } from 'vitest';
import { CRT_DEFAULTS, CRT_LOW_QUALITY } from './constants';

describe('CRT_DEFAULTS', () => {
  it('has all required keys with valid number values', () => {
    const requiredKeys = [
      'bloomStrength',
      'bloomRadius',
      'bloomThreshold',
      'scanlineIntensity',
      'chromaOffset',
      'vignetteStrength',
    ] as const;

    for (const key of requiredKeys) {
      expect(CRT_DEFAULTS).toHaveProperty(key);
      expect(typeof CRT_DEFAULTS[key]).toBe('number');
      expect(Number.isFinite(CRT_DEFAULTS[key])).toBe(true);
    }
  });
});

describe('CRT_LOW_QUALITY', () => {
  it('has all required keys with valid number values', () => {
    const requiredKeys = [
      'bloomStrength',
      'scanlineIntensity',
      'chromaOffset',
      'vignetteStrength',
    ] as const;

    for (const key of requiredKeys) {
      expect(CRT_LOW_QUALITY).toHaveProperty(key);
      expect(typeof CRT_LOW_QUALITY[key]).toBe('number');
      expect(Number.isFinite(CRT_LOW_QUALITY[key])).toBe(true);
    }
  });

  it('has bloomStrength of 0 (bloom disabled)', () => {
    expect(CRT_LOW_QUALITY.bloomStrength).toBe(0);
  });

  it('has chromaOffset of 0 (no chromatic aberration)', () => {
    expect(CRT_LOW_QUALITY.chromaOffset).toBe(0);
  });
});
