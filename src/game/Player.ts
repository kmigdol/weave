export const NUM_LANES = 5;
export const LANE_WIDTH = 3.5; // meters between lane centers

/** Seconds to cross roughly one full lane at max tween speed. Controls snappiness. */
const LANE_TWEEN_RATE = 12; // lane-widths per second
const SNAP_EPSILON = 0.01;

/**
 * The player car's lane-state and interpolated world-x. WEA-1 uses this for
 * a movable cube; WEA-2 will add the collision boxes and scoring state on
 * top of the same lane model.
 */
export class Player {
  /** Integer lane index the player is currently trying to occupy. */
  targetLane: number;
  /** Interpolated world-x. Tweens toward the target lane's x each tick. */
  x: number;

  constructor() {
    this.targetLane = Math.floor(NUM_LANES / 2);
    this.x = laneToX(this.targetLane);
  }

  /** Shift the target lane by `delta` (clamped to valid range). */
  changeLane(delta: number): void {
    const next = this.targetLane + delta;
    this.targetLane = Math.max(0, Math.min(NUM_LANES - 1, next));
  }

  /** Advance the lane-change tween by `dtSeconds`. */
  update(dtSeconds: number): void {
    const targetX = laneToX(this.targetLane);
    const diff = targetX - this.x;
    if (Math.abs(diff) <= SNAP_EPSILON) {
      this.x = targetX;
      return;
    }
    const maxStep = LANE_TWEEN_RATE * LANE_WIDTH * dtSeconds;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
    this.x += step;
  }
}

/** Map an integer lane index to its world-x position (lane 0 = leftmost). */
export function laneToX(lane: number): number {
  const center = (NUM_LANES - 1) / 2;
  return (lane - center) * LANE_WIDTH;
}
