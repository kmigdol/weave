import { describe, it, expect } from 'vitest';
import { startRun, tickRun, crashRun } from './GameState';

describe('GameState', () => {
  describe('startRun', () => {
    it('returns a running state with elapsedSeconds=0 and distanceMeters=0', () => {
      const state = startRun();
      expect(state).toEqual({
        phase: 'running',
        elapsedSeconds: 0,
        distanceMeters: 0,
      });
    });
  });

  describe('tickRun', () => {
    it('advances elapsedSeconds by dt', () => {
      const state = startRun();
      const next = tickRun(state, 0.016, 20);
      expect(next.elapsedSeconds).toBeCloseTo(0.016, 10);
    });

    it('advances distanceMeters by speed * dt', () => {
      const state = startRun();
      const next = tickRun(state, 0.016, 20);
      expect(next.distanceMeters).toBeCloseTo(0.016 * 20, 10);
    });

    it('accumulates over multiple calls', () => {
      let state = startRun();
      state = tickRun(state, 0.016, 20);
      state = tickRun(state, 0.016, 20);
      state = tickRun(state, 0.016, 20);
      expect(state.elapsedSeconds).toBeCloseTo(0.048, 10);
      expect(state.distanceMeters).toBeCloseTo(0.048 * 20, 10);
    });

    it('returns a new object (immutable)', () => {
      const state = startRun();
      const next = tickRun(state, 0.016, 20);
      expect(next).not.toBe(state);
    });

    it('preserves phase as running', () => {
      const state = startRun();
      const next = tickRun(state, 1, 10);
      expect(next.phase).toBe('running');
    });
  });

  describe('crashRun', () => {
    it('transitions to gameOver phase', () => {
      const running = tickRun(startRun(), 5, 30);
      const over = crashRun(running, 3);
      expect(over.phase).toBe('gameOver');
    });

    it('preserves distanceMeters from the running state', () => {
      const running = tickRun(startRun(), 5, 30);
      const over = crashRun(running, 3);
      expect(over.distanceMeters).toBe(running.distanceMeters);
    });

    it('sets durationSeconds from elapsedSeconds', () => {
      const running = tickRun(startRun(), 5, 30);
      const over = crashRun(running, 3);
      expect(over.durationSeconds).toBe(running.elapsedSeconds);
    });

    it('preserves bestCombo', () => {
      const running = tickRun(startRun(), 5, 30);
      const over = crashRun(running, 7);
      expect(over.bestCombo).toBe(7);
    });

    it('returns a new object (not the running state)', () => {
      const running = tickRun(startRun(), 5, 30);
      const over = crashRun(running, 0);
      expect(over).not.toBe(running);
    });
  });
});
