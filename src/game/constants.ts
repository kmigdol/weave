// ── Speed Curve ─────────────────────────────────────────────────────
/** Minimum speed at t=0 in meters/second (~55 mph). */
export const SPEED_MIN_MS = 24.6;
/** Maximum (plateau) speed in meters/second (~180 mph). */
export const SPEED_MAX_MS = 80.5;
/** Time-constant for the exponential ease-out (seconds). */
export const SPEED_TAU = 30;

// ── Traffic Spawning ────────────────────────────────────────────────
/** Distance ahead of the player where new traffic spawns (meters). */
export const TRAFFIC_SPAWN_DISTANCE = 55;
/** Distance behind the player where traffic is despawned (meters). */
export const TRAFFIC_DESPAWN_DISTANCE = 50;
/** Minimum gap in meters between two cars in the same lane. */
export const TRAFFIC_SAME_LANE_GAP = 30;

/**
 * Base spawn interval in seconds at minimum speed.
 * Decreases as player speed increases (more traffic at high speed).
 */
export const TRAFFIC_BASE_SPAWN_INTERVAL = 0.30;
/**
 * Minimum spawn interval in seconds (cap so density doesn't get absurd).
 */
export const TRAFFIC_MIN_SPAWN_INTERVAL = 0.12;

/** Probability that a spawned car is a semi (slow, large). */
export const HAZARD_SEMI_CHANCE = 0.1;
/** Probability that a spawned car is a swerving pickup. */
export const HAZARD_SWERVING_CHANCE = 0.05;

// ── Traffic Speed Assignment ────────────────────────────────────────
/**
 * Per-lane speed multipliers (index 0 = leftmost = fastest).
 * Traffic cars get `playerSpeed * multiplier ± variation`.
 */
export const LANE_SPEED_MULTIPLIERS = [0.92, 0.8, 0.68, 0.55, 0.42];
/** Random speed variation applied to each car (± this fraction of its base). */
export const LANE_SPEED_VARIATION = 0.18;
/** Maximum number of lanes that can have a car within WALL_CHECK_DEPTH meters of the spawn point. */
export const MAX_LANES_AT_SPAWN_DEPTH = 2;
/** How deep (meters) to look around the spawn z when checking for lane walls. */
export const WALL_CHECK_DEPTH = 20;
/** Max lanes occupied in any z-band ahead of the player (runtime wall-buster). */
export const MAX_LANES_IN_BAND = 3;
/** Width of z-bands to scan for wall-buster (meters). */
export const WALL_BAND_WIDTH = 12;
/** Semi trucks are this fraction of their normal lane speed. */
export const SEMI_SPEED_FACTOR = 0.6;
/** Maximum traffic car speed in m/s (~100 mph). Player outruns traffic late-game. */
export const TRAFFIC_MAX_SPEED = 45;

// ── Swerving Pickup ────────────────────────────────────────────────
/** Peak lateral offset of swerving pickup (meters from lane center). */
export const SWERVE_AMPLITUDE = 1.2;
/** Swerve oscillation frequency (radians per second). */
export const SWERVE_FREQUENCY = 1.8;

// ── Collision Boxes ─────────────────────────────────────────────────
/** Normal car hit-box half-widths [halfX, halfZ] in meters. */
export const HITBOX_NORMAL: [number, number] = [0.8, 1.9];
/** Semi hit-box half-widths [halfX, halfZ]. */
export const HITBOX_SEMI: [number, number] = [1.2, 4.0];

/** Lateral (X) padding added to each side for near-miss zone (meters). */
export const NEAR_MISS_PADDING_X = 1.2;
/** Longitudinal (Z) padding added to front/back for near-miss zone (meters). */
export const NEAR_MISS_PADDING_Z = 3.0;
/** Length of slipstream zone behind the car (meters). */
export const SLIPSTREAM_LENGTH = 12;

// ── Player ──────────────────────────────────────────────────────────
/** Player car hit-box half-widths [halfX, halfZ] — slightly forgiving to allow close clips. */
export const HITBOX_PLAYER: [number, number] = [0.55, 1.5];
/** Player z-position in world space (stationary). */
export const PLAYER_Z = 0;

// ── Active-Set ──────────────────────────────────────────────────────
/** Only check collisions with cars within this distance of the player. */
export const COLLISION_ACTIVE_RANGE = 50;

// ── Scoring / Combo / Boost ────────────────────────────────────────
/** Speed increase per combo level on near-miss (fraction of base speed). */
export const NEAR_MISS_BURST_PER_COMBO = 0.15;
/** Duration of a near-miss speed burst (seconds). */
export const NEAR_MISS_BURST_DURATION = 1.0;
/** Seconds before combo decays back to 0. */
export const COMBO_DECAY_TIME = 1.5;
/** Seconds spent in slipstream zone to trigger BOOST. */
export const SLIPSTREAM_CHARGE_TIME = 0.4;
/** Speed bonus while BOOST is active (fraction of base speed). */
export const BOOST_SPEED_BONUS = 0.30;
/** BOOST duration in seconds. */
export const BOOST_DURATION = 3.0;

// ── Camera Effects ─────────────────────────────────────────────────
/** FOV increase (degrees) during BOOST. */
export const BOOST_FOV_INCREASE = 8;
/** Camera shake amplitude on near-miss (meters). */
export const SHAKE_NEAR_MISS_AMPLITUDE = 0.05;
/** Camera shake duration on near-miss (seconds). */
export const SHAKE_NEAR_MISS_DURATION = 0.15;
/** Camera shake amplitude on crash (meters). */
export const SHAKE_CRASH_AMPLITUDE = 0.3;
/** Camera shake duration on crash (seconds). */
export const SHAKE_CRASH_DURATION = 0.4;
