import { describe, it, expect } from 'vitest';
import { titleState, startRun, tickRun, crashRun, startOnRamp, tickOnRamp } from './GameState';
import { ON_RAMP_DURATION } from './constants';

describe('GameState', () => {
  describe('titleState', () => {
    it('returns phase title', () => {
      const state = titleState();
      expect(state).toEqual({ phase: 'title' });
    });

    it('has no extra properties beyond phase', () => {
      const state = titleState();
      expect(Object.keys(state)).toEqual(['phase']);
    });
  });

  describe('startOnRamp', () => {
    it('returns phase onRamp with elapsedSeconds 0', () => {
      const state = startOnRamp();
      expect(state).toEqual({
        phase: 'onRamp',
        elapsedSeconds: 0,
      });
    });
  });

  describe('tickOnRamp', () => {
    it('advances elapsedSeconds', () => {
      const state = startOnRamp();
      const next = tickOnRamp(state, 0.5);
      expect(next.phase).toBe('onRamp');
      expect((next as { elapsedSeconds: number }).elapsedSeconds).toBeCloseTo(0.5, 10);
    });

    it('stays as OnRampState when elapsed < ON_RAMP_DURATION', () => {
      const state = startOnRamp();
      const next = tickOnRamp(state, ON_RAMP_DURATION - 0.1);
      expect(next.phase).toBe('onRamp');
    });

    it('transitions to RunningState when elapsed >= ON_RAMP_DURATION', () => {
      const state = startOnRamp();
      const next = tickOnRamp(state, ON_RAMP_DURATION);
      expect(next.phase).toBe('running');
      expect(next).toEqual({
        phase: 'running',
        elapsedSeconds: 0,
        distanceMeters: 0,
      });
    });

    it('transitions to RunningState when elapsed exceeds ON_RAMP_DURATION', () => {
      let state = startOnRamp();
      // Tick partially
      const partial = tickOnRamp(state, ON_RAMP_DURATION - 0.5);
      expect(partial.phase).toBe('onRamp');
      // Tick past the threshold
      const final = tickOnRamp(partial as { phase: 'onRamp'; elapsedSeconds: number }, 1.0);
      expect(final.phase).toBe('running');
    });
  });

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
