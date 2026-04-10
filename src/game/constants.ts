// ── Speed Curve ─────────────────────────────────────────────────────
/** Minimum speed at t=0 in meters/second (~80 mph). */
export const SPEED_MIN_MS = 35.8;
/** Maximum (plateau) speed in meters/second (~180 mph). */
export const SPEED_MAX_MS = 80.5;
/** Time-constant for the exponential ease-out (seconds). */
export const SPEED_TAU = 30;

// ── Traffic Spawning ────────────────────────────────────────────────
/** Distance ahead of the player where new traffic spawns (meters). */
export const TRAFFIC_SPAWN_DISTANCE = 150;
/** Distance behind the player where traffic is despawned (meters). */
export const TRAFFIC_DESPAWN_DISTANCE = 50;
/** Minimum gap in meters between two cars in the same lane. */
export const TRAFFIC_SAME_LANE_GAP = 30;

/**
 * Base spawn interval in seconds at minimum speed.
 * Decreases as player speed increases (more traffic at high speed).
 */
export const TRAFFIC_BASE_SPAWN_INTERVAL = 0.45;
/**
 * Minimum spawn interval in seconds (cap so density doesn't get absurd).
 */
export const TRAFFIC_MIN_SPAWN_INTERVAL = 0.18;

/** Probability that a spawned car is a semi (slow, large). */
export const HAZARD_SEMI_CHANCE = 0.1;
/** Probability that a spawned car is a swerving pickup. */
export const HAZARD_SWERVING_CHANCE = 0.05;

// ── Traffic Speed Assignment ────────────────────────────────────────
/**
 * Per-lane speed multipliers (index 0 = leftmost = fastest).
 * Traffic cars get `playerSpeed * multiplier ± variation`.
 */
export const LANE_SPEED_MULTIPLIERS = [0.85, 0.78, 0.7, 0.62, 0.55];
/** Random speed variation applied to each car (± this fraction of its base). */
export const LANE_SPEED_VARIATION = 0.08;
/** Semi trucks are this fraction of their normal lane speed. */
export const SEMI_SPEED_FACTOR = 0.6;

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

/** Lateral padding added to each side for near-miss zone (meters). */
export const NEAR_MISS_PADDING = 1.5;
/** Length of slipstream zone behind the car (meters). */
export const SLIPSTREAM_LENGTH = 12;

// ── Player ──────────────────────────────────────────────────────────
/** Player car hit-box half-widths [halfX, halfZ]. */
export const HITBOX_PLAYER: [number, number] = [0.8, 1.9];
/** Player z-position in world space (stationary). */
export const PLAYER_Z = 0;

// ── Active-Set ──────────────────────────────────────────────────────
/** Only check collisions with cars within this distance of the player. */
export const COLLISION_ACTIVE_RANGE = 50;
