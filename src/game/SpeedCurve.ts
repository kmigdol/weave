import { SPEED_MIN_MS, SPEED_MAX_MS, SPEED_TAU } from './constants';

/**
 * Returns the player's speed in meters/second at the given elapsed time.
 *
 * Uses an exponential ease-out curve that starts at SPEED_MIN_MS (~80 mph)
 * and asymptotically approaches SPEED_MAX_MS (~180 mph).
 *
 * Negative time values are clamped to 0.
 */
export function getSpeed(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  return SPEED_MIN_MS + (SPEED_MAX_MS - SPEED_MIN_MS) * (1 - Math.exp(-t / SPEED_TAU));
}
