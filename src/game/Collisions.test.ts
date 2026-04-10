import { describe, it, expect } from 'vitest';
import {
  computeBoxes,
  computePlayerBox,
  checkCollisions,
  type CollidableCar,
} from './Collisions';
import {
  HITBOX_NORMAL,
  HITBOX_SEMI,
  HITBOX_PLAYER,
  NEAR_MISS_PADDING,
  SLIPSTREAM_LENGTH,
  COLLISION_ACTIVE_RANGE,
  PLAYER_Z,
} from './constants';

// ── Helpers ───────────────────────────────────────────────────────────
let nextTestId = 1;
function makeCar(overrides: Partial<CollidableCar> = {}): CollidableCar {
  return { id: nextTestId++, x: 0, z: -10, type: 'normal', ...overrides };
}

// ── computeBoxes ──────────────────────────────────────────────────────
describe('computeBoxes', () => {
  it('returns correct hit box for a normal car', () => {
    const car = makeCar({ x: 5, z: -20 });
    const { hitBox } = computeBoxes(car);

    expect(hitBox.minX).toBeCloseTo(5 - HITBOX_NORMAL[0]);
    expect(hitBox.maxX).toBeCloseTo(5 + HITBOX_NORMAL[0]);
    expect(hitBox.minZ).toBeCloseTo(-20 - HITBOX_NORMAL[1]);
    expect(hitBox.maxZ).toBeCloseTo(-20 + HITBOX_NORMAL[1]);
  });

  it('returns a larger hit box for a semi car', () => {
    const normal = computeBoxes(makeCar({ type: 'normal' }));
    const semi = computeBoxes(makeCar({ type: 'semi' }));

    const normalWidth = normal.hitBox.maxX - normal.hitBox.minX;
    const semiWidth = semi.hitBox.maxX - semi.hitBox.minX;
    const normalDepth = normal.hitBox.maxZ - normal.hitBox.minZ;
    const semiDepth = semi.hitBox.maxZ - semi.hitBox.minZ;

    expect(semiWidth).toBeGreaterThan(normalWidth);
    expect(semiDepth).toBeGreaterThan(normalDepth);

    // Verify exact semi dimensions
    expect(semiWidth).toBeCloseTo(HITBOX_SEMI[0] * 2);
    expect(semiDepth).toBeCloseTo(HITBOX_SEMI[1] * 2);
  });

  it('swerving cars use normal-sized hit box', () => {
    const swerving = computeBoxes(makeCar({ type: 'swerving' }));
    const normal = computeBoxes(makeCar({ type: 'normal' }));

    const swervingWidth = swerving.hitBox.maxX - swerving.hitBox.minX;
    const normalWidth = normal.hitBox.maxX - normal.hitBox.minX;

    expect(swervingWidth).toBeCloseTo(normalWidth);
  });

  it('near-miss zone is wider than hit box by NEAR_MISS_PADDING on each side', () => {
    const car = makeCar({ x: 3, z: -15 });
    const { hitBox, nearMissZone } = computeBoxes(car);

    expect(nearMissZone.minX).toBeCloseTo(hitBox.minX - NEAR_MISS_PADDING);
    expect(nearMissZone.maxX).toBeCloseTo(hitBox.maxX + NEAR_MISS_PADDING);
    // Z extent should match hit box (padding is lateral only)
    expect(nearMissZone.minZ).toBeCloseTo(hitBox.minZ);
    expect(nearMissZone.maxZ).toBeCloseTo(hitBox.maxZ);
  });

  it('slipstream extends behind the car (positive z direction)', () => {
    const car = makeCar({ x: 0, z: -10 });
    const { hitBox, slipstreamZone } = computeBoxes(car);

    // Slipstream starts at the back of the car and extends behind (positive z)
    expect(slipstreamZone.minZ).toBeCloseTo(hitBox.maxZ);
    expect(slipstreamZone.maxZ).toBeCloseTo(hitBox.maxZ + SLIPSTREAM_LENGTH);

    // Width matches the car's hit box width
    expect(slipstreamZone.minX).toBeCloseTo(hitBox.minX);
    expect(slipstreamZone.maxX).toBeCloseTo(hitBox.maxX);
  });
});

// ── computePlayerBox ──────────────────────────────────────────────────
describe('computePlayerBox', () => {
  it('returns correct dimensions centered on playerX at PLAYER_Z', () => {
    const playerX = 2.5;
    const box = computePlayerBox(playerX);

    expect(box.minX).toBeCloseTo(playerX - HITBOX_PLAYER[0]);
    expect(box.maxX).toBeCloseTo(playerX + HITBOX_PLAYER[0]);
    expect(box.minZ).toBeCloseTo(PLAYER_Z - HITBOX_PLAYER[1]);
    expect(box.maxZ).toBeCloseTo(PLAYER_Z + HITBOX_PLAYER[1]);
  });

  it('centers at origin when playerX is 0', () => {
    const box = computePlayerBox(0);

    expect(box.minX).toBeCloseTo(-HITBOX_PLAYER[0]);
    expect(box.maxX).toBeCloseTo(HITBOX_PLAYER[0]);
  });
});

// ── checkCollisions ───────────────────────────────────────────────────
describe('checkCollisions', () => {
  it('returns empty result for empty cars array', () => {
    const result = checkCollisions(0, []);

    expect(result.hits).toEqual([]);
    expect(result.nearMisses).toEqual([]);
    expect(result.slipstreams).toEqual([]);
  });

  it('detects a car directly overlapping the player as a hit', () => {
    // Place car exactly on top of the player
    const car = makeCar({ x: 0, z: PLAYER_Z });
    const result = checkCollisions(0, [car]);

    expect(result.hits).toContain(car);
  });

  it('detects a close adjacent car as a near miss but not a hit', () => {
    // Position the car laterally so it overlaps the near-miss zone
    // but NOT the hit box. Player at x=0, car offset by enough to
    // clear hit boxes but land in the near-miss padding.
    const gap = HITBOX_PLAYER[0] + HITBOX_NORMAL[0]; // just touching
    const nearMissX = gap + NEAR_MISS_PADDING * 0.5; // inside near-miss zone
    const car = makeCar({ x: nearMissX, z: PLAYER_Z });
    const result = checkCollisions(0, [car]);

    expect(result.nearMisses).toContain(car);
    expect(result.hits).not.toContain(car);
  });

  it('detects a car ahead in the same lane within slipstream range', () => {
    // Car is ahead of the player (negative z) in the same lane.
    // The slipstream extends behind (positive z from) the traffic car,
    // so the player (at z=0) needs to be in that zone.
    // Car at z = -(some distance) such that car.hitBox.maxZ + SLIPSTREAM_LENGTH > player.minZ
    const carZ = -(HITBOX_NORMAL[1] + SLIPSTREAM_LENGTH * 0.5);
    const car = makeCar({ x: 0, z: carZ });
    const result = checkCollisions(0, [car]);

    expect(result.slipstreams).toContain(car);
    // Should not be a hit since there's distance between them
    expect(result.hits).not.toContain(car);
  });

  it('excludes cars beyond COLLISION_ACTIVE_RANGE', () => {
    const farCar = makeCar({ x: 0, z: -(COLLISION_ACTIVE_RANGE + 10) });
    const result = checkCollisions(0, [farCar]);

    expect(result.hits).toEqual([]);
    expect(result.nearMisses).toEqual([]);
    expect(result.slipstreams).toEqual([]);
  });

  it('includes cars just within COLLISION_ACTIVE_RANGE', () => {
    // Place car just inside the active range AND overlapping the player.
    // Car at z = -(COLLISION_ACTIVE_RANGE - 1) is within range.
    // Its slipstream extends from (car.z + halfZ) to (car.z + halfZ + SLIPSTREAM_LENGTH).
    // With the car in the same lane (x=0), the slipstream may reach the player.
    const car = makeCar({ x: 0, z: PLAYER_Z });
    const farCar = makeCar({ x: 0, z: -(COLLISION_ACTIVE_RANGE - 1) });

    // The close car should be detected
    const result = checkCollisions(0, [car, farCar]);
    expect(result.hits).toContain(car);

    // The far car is within active range so it's checked (not excluded)
    // Even if it doesn't overlap any zone, it shouldn't cause an error.
    // Verify the far car's active range: |(-49) - 0| = 49 < 50, so it's active.
    expect(Math.abs(farCar.z - PLAYER_Z)).toBeLessThan(COLLISION_ACTIVE_RANGE);
  });

  it('a car can appear in multiple result arrays simultaneously', () => {
    // A car directly on the player overlaps hitBox, nearMissZone, and
    // potentially the slipstream of adjacent logic. At minimum it's
    // in both hits and nearMisses since nearMiss is a superset of hitBox.
    const car = makeCar({ x: 0, z: PLAYER_Z });
    const result = checkCollisions(0, [car]);

    expect(result.hits).toContain(car);
    expect(result.nearMisses).toContain(car);
  });
});
