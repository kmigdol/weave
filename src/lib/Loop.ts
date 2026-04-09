/**
 * Fixed-timestep accumulator loop. Based on the classic "fix your timestep"
 * pattern: callers hand in the frame delta each rAF callback, and the loop
 * tells them how many fixed simulation ticks to run. Residual time carries
 * forward so the sim never drifts away from wall-clock time, and a tick cap
 * prevents a "spiral of death" when the tab was backgrounded.
 */
export class FixedTimestepLoop {
  private accumulator = 0;

  constructor(
    /** Fixed tick duration in seconds (e.g. 1/60). */
    readonly tickSeconds: number,
    /** Hard cap on ticks per frame. Excess accumulated time is discarded. */
    readonly maxTicksPerFrame = 10,
  ) {}

  /**
   * Advance the accumulator by `dtSeconds` and return the number of fixed
   * ticks the caller should run this frame. Leftover fractional time is
   * kept in the accumulator for the next frame.
   */
  step(dtSeconds: number): number {
    this.accumulator += dtSeconds;
    let ticks = 0;
    while (this.accumulator >= this.tickSeconds && ticks < this.maxTicksPerFrame) {
      this.accumulator -= this.tickSeconds;
      ticks++;
    }
    // When capped, throw away remaining owed time instead of catching up
    // on a backlog that would cause a visible stutter.
    if (ticks === this.maxTicksPerFrame && this.accumulator >= this.tickSeconds) {
      this.accumulator = 0;
    }
    return ticks;
  }

  /** Fractional progress into the next tick, in [0, 1). */
  alpha(): number {
    return this.accumulator / this.tickSeconds;
  }
}
