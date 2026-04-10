import {
  HITBOX_NORMAL,
  HITBOX_SEMI,
  HITBOX_PLAYER,
  NEAR_MISS_PADDING,
  SLIPSTREAM_LENGTH,
  COLLISION_ACTIVE_RANGE,
  PLAYER_Z,
} from './constants';

// ── Types ─────────────────────────────────────────────────────────────

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CollisionBoxes {
  hitBox: AABB;
  nearMissZone: AABB;
  slipstreamZone: AABB;
}

/** Minimal car shape needed by collisions (doesn't depend on Traffic.ts). */
export interface CollidableCar {
  x: number;
  z: number;
  type: 'normal' | 'semi' | 'swerving';
}

export interface CollisionResult {
  hits: CollidableCar[];
  nearMisses: CollidableCar[];
  slipstreams: CollidableCar[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function halfWidths(type: CollidableCar['type']): [number, number] {
  return type === 'semi' ? HITBOX_SEMI : HITBOX_NORMAL;
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Compute the three collision zones for a traffic car.
 *
 * - **hitBox** — centered on (car.x, car.z), sized by car type.
 * - **nearMissZone** — hitBox expanded laterally by NEAR_MISS_PADDING.
 * - **slipstreamZone** — car width x SLIPSTREAM_LENGTH, extending behind
 *   the car (positive-z direction, since negative z = ahead of the player).
 */
export function computeBoxes(car: CollidableCar): CollisionBoxes {
  const [halfX, halfZ] = halfWidths(car.type);

  const hitBox: AABB = {
    minX: car.x - halfX,
    maxX: car.x + halfX,
    minZ: car.z - halfZ,
    maxZ: car.z + halfZ,
  };

  const nearMissZone: AABB = {
    minX: hitBox.minX - NEAR_MISS_PADDING,
    maxX: hitBox.maxX + NEAR_MISS_PADDING,
    minZ: hitBox.minZ,
    maxZ: hitBox.maxZ,
  };

  const slipstreamZone: AABB = {
    minX: hitBox.minX,
    maxX: hitBox.maxX,
    minZ: hitBox.maxZ,
    maxZ: hitBox.maxZ + SLIPSTREAM_LENGTH,
  };

  return { hitBox, nearMissZone, slipstreamZone };
}

/**
 * Compute the player's hit box centered on (playerX, PLAYER_Z).
 */
export function computePlayerBox(playerX: number): AABB {
  return {
    minX: playerX - HITBOX_PLAYER[0],
    maxX: playerX + HITBOX_PLAYER[0],
    minZ: PLAYER_Z - HITBOX_PLAYER[1],
    maxZ: PLAYER_Z + HITBOX_PLAYER[1],
  };
}

/**
 * Check all traffic cars against the player and classify each overlap.
 *
 * 1. Filter to the active set (cars within COLLISION_ACTIVE_RANGE of the player).
 * 2. Compute the player box once.
 * 3. For each active car, compute its zones and test AABB overlap.
 * 4. A car can appear in multiple result arrays.
 */
export function checkCollisions(
  playerX: number,
  cars: readonly CollidableCar[],
): CollisionResult {
  const hits: CollidableCar[] = [];
  const nearMisses: CollidableCar[] = [];
  const slipstreams: CollidableCar[] = [];

  const playerBox = computePlayerBox(playerX);

  for (const car of cars) {
    // Active-set filter
    if (Math.abs(car.z - PLAYER_Z) >= COLLISION_ACTIVE_RANGE) continue;

    const boxes = computeBoxes(car);

    if (aabbOverlap(playerBox, boxes.hitBox)) {
      hits.push(car);
    }
    if (aabbOverlap(playerBox, boxes.nearMissZone)) {
      nearMisses.push(car);
    }
    if (aabbOverlap(playerBox, boxes.slipstreamZone)) {
      slipstreams.push(car);
    }
  }

  return { hits, nearMisses, slipstreams };
}
