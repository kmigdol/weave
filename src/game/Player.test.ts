import { describe, it, expect, beforeEach } from 'vitest';
import { Player, LANE_WIDTH, NUM_LANES } from './Player';

describe('Player', () => {
  let player: Player;

  beforeEach(() => {
    player = new Player();
  });

  describe('initial state', () => {
    it('spawns in the center lane', () => {
      const center = Math.floor(NUM_LANES / 2);
      expect(player.targetLane).toBe(center);
    });

    it('has x position aligned with the center lane', () => {
      const center = Math.floor(NUM_LANES / 2);
      const expectedX = laneToX(center);
      expect(player.x).toBeCloseTo(expectedX, 5);
    });
  });

  describe('changeLane', () => {
    it('moves target lane right by 1', () => {
      const start = player.targetLane;
      player.changeLane(+1);
      expect(player.targetLane).toBe(start + 1);
    });

    it('moves target lane left by 1', () => {
      const start = player.targetLane;
      player.changeLane(-1);
      expect(player.targetLane).toBe(start - 1);
    });

    it('clamps target lane at the rightmost lane', () => {
      player.targetLane = NUM_LANES - 1;
      player.changeLane(+1);
      expect(player.targetLane).toBe(NUM_LANES - 1);
    });

    it('clamps target lane at the leftmost lane', () => {
      player.targetLane = 0;
      player.changeLane(-1);
      expect(player.targetLane).toBe(0);
    });
  });

  describe('update', () => {
    it('tweens x toward target lane position over time', () => {
      player.changeLane(+1);
      const targetX = laneToX(player.targetLane);
      const startX = player.x;
      player.update(1 / 60);
      // x should have moved toward target but not yet reached it
      expect(player.x).toBeGreaterThan(startX);
      expect(player.x).toBeLessThanOrEqual(targetX);
    });

    it('snaps to target x once within the snap epsilon', () => {
      player.changeLane(+1);
      // Sufficient time for the tween to complete
      for (let i = 0; i < 60; i++) {
        player.update(1 / 60);
      }
      const targetX = laneToX(player.targetLane);
      expect(player.x).toBeCloseTo(targetX, 3);
    });

    it('does not move when already at target', () => {
      const x0 = player.x;
      player.update(1 / 60);
      expect(player.x).toBeCloseTo(x0, 5);
    });
  });
});

/** Mirrors the convention in Player.ts: lane index → world x. */
function laneToX(lane: number): number {
  const center = (NUM_LANES - 1) / 2;
  return (lane - center) * LANE_WIDTH;
}
