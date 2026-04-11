import { Mesh, BoxGeometry, MeshStandardMaterial, Scene } from 'three';
import { NUM_LANES, laneToX } from './Player';
import {
  TRAFFIC_SPAWN_DISTANCE,
  TRAFFIC_DESPAWN_DISTANCE,
  TRAFFIC_SAME_LANE_GAP,
  TRAFFIC_BASE_SPAWN_INTERVAL,
  TRAFFIC_MIN_SPAWN_INTERVAL,
  HAZARD_SEMI_CHANCE,
  HAZARD_SWERVING_CHANCE,
  LANE_SPEED_MULTIPLIERS,
  LANE_SPEED_VARIATION,
  SEMI_SPEED_FACTOR,
  TRAFFIC_MAX_SPEED,
  SWERVE_AMPLITUDE,
  SWERVE_FREQUENCY,
  SPEED_MIN_MS,
  SPEED_MAX_MS,
  MAX_LANES_AT_SPAWN_DEPTH,
  WALL_CHECK_DEPTH,
  MAX_LANES_IN_BAND,
  WALL_BAND_WIDTH,
} from './constants';

// ── Color Palettes ──────────────────────────────────────────────────
const NORMAL_COLORS = [0x00ffff, 0xff00ff, 0x00ff66, 0xffff00, 0xff3399, 0x66ffcc, 0xaa88ff];
const SWERVING_COLOR = 0xff6600; // neon orange
const SEMI_COLOR = 0x44ffbb; // neon mint

// ── Mesh Dimensions ─────────────────────────────────────────────────
const NORMAL_SIZE = { w: 1.6, h: 1.2, l: 3.8 };
const SEMI_SIZE = { w: 2.4, h: 2.0, l: 8.0 };

export interface TrafficCar {
  id: number; // unique numeric ID for scoring dedup
  lane: number;
  baseSpeed: number; // original assigned speed (m/s), never mutated
  speed: number; // effective speed this tick (may be clamped by following)
  z: number; // world-space z (negative = ahead)
  type: 'normal' | 'semi' | 'swerving';
  mesh: Mesh;
  swayPhase: number; // only meaningful for swerving type
  x: number; // current world-x including sway offset
  meshY: number; // cached y position (half height)
}

export class TrafficManager {
  readonly cars: TrafficCar[] = [];
  private normalPool: Mesh[] = [];
  private semiPool: Mesh[] = [];
  private swervingPool: Mesh[] = [];
  private spawnTimer: number;
  private scene: Scene;
  private rng: () => number;
  private nextId = 1;
  private _despawnedIds: number[] = [];

  constructor(scene: Scene, rng?: () => number) {
    this.scene = scene;
    this.rng = rng ?? Math.random;
    this.spawnTimer = TRAFFIC_BASE_SPAWN_INTERVAL;
  }

  /** Call every simulation tick. */
  update(playerSpeed: number, dtSeconds: number): void {
    // 1. Restore base speeds (following may have clamped them last tick)
    for (const car of this.cars) {
      car.speed = car.baseSpeed;
    }

    // 2. Move all cars
    for (const car of this.cars) {
      car.z += (playerSpeed - car.speed) * dtSeconds;
    }

    // 3. Same-lane following: clamp position and speed for this tick only
    this.enforceLaneFollowing();

    // 3. Wall-buster: scan z-bands ahead of player and speed up a car
    //    if too many lanes are blocked in the same band.
    this.bustWalls(playerSpeed);

    // 4. Update swerving cars
    for (const car of this.cars) {
      if (car.type === 'swerving') {
        car.swayPhase += SWERVE_FREQUENCY * dtSeconds;
        car.x = laneToX(car.lane) + Math.sin(car.swayPhase) * SWERVE_AMPLITUDE;
      } else {
        car.x = laneToX(car.lane);
      }
    }

    // 5. Sync mesh positions
    for (const car of this.cars) {
      car.mesh.position.set(car.x, car.meshY, car.z);
    }

    // 6. Despawn cars behind player
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (this.cars[i].z > TRAFFIC_DESPAWN_DISTANCE) {
        this.despawn(i);
      }
    }

    // 7. Maybe spawn new car (timer-based)
    this.spawnTimer -= dtSeconds;
    if (this.spawnTimer <= 0) {
      const spawned = this.trySpawn(playerSpeed);
      if (spawned) {
        this.spawnTimer = this.getSpawnInterval(playerSpeed);
      }
      // If not spawned (gap violation), don't reset timer — try again next tick
    }
  }

  /**
   * Remove all cars, return meshes to pool, reset spawn timer. Used on restart.
   * NOTE: Scoring state MUST be reset simultaneously — nextId resets to 1,
   * so stale IDs in scoredCarIds could collide with new car IDs.
   */
  reset(): void {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      this.despawn(i);
    }
    this.spawnTimer = TRAFFIC_BASE_SPAWN_INTERVAL;
    this.nextId = 1;
  }

  /** Get cars suitable for collision checking (zero-alloc — TrafficCar satisfies CollidableCar). */
  get collidables(): readonly TrafficCar[] {
    return this.cars;
  }

  /** IDs of cars despawned since last clearDespawnedIds() call. */
  get despawnedIds(): readonly number[] {
    return this._despawnedIds;
  }

  /** Clear the despawned-IDs buffer (Game.ts calls this after processing). */
  clearDespawnedIds(): void {
    this._despawnedIds.length = 0;
  }

  // ── Private helpers ───────────────────────────────────────────────

  /** Minimum z-gap between two cars based on their lengths. */
  private static minFollowGap(ahead: TrafficCar, behind: TrafficCar): number {
    const aHalfZ = ahead.type === 'semi' ? 4.0 : 1.9;
    const bHalfZ = behind.type === 'semi' ? 4.0 : 1.9;
    return aHalfZ + bHalfZ + 5.0; // +5m buffer — visible gap between queued cars
  }

  /**
   * For each lane, sort cars by z and clamp any car that overlaps the one
   * ahead. The trailing car matches speed with the leader so it doesn't
   * keep pushing into it.
   */
  private enforceLaneFollowing(): void {
    // Group cars by lane (reuse arrays to avoid alloc)
    const lanes: TrafficCar[][] = [];
    for (let i = 0; i < NUM_LANES; i++) lanes.push([]);
    for (const car of this.cars) {
      lanes[car.lane].push(car);
    }

    for (const laneCars of lanes) {
      if (laneCars.length < 2) continue;
      // Sort by z ascending (most negative = furthest ahead)
      laneCars.sort((a, b) => a.z - b.z);
      // Walk from second car onward; clamp to behind the car ahead
      for (let i = 1; i < laneCars.length; i++) {
        const ahead = laneCars[i - 1];
        const behind = laneCars[i];
        const minGap = TrafficManager.minFollowGap(ahead, behind);
        const minZ = ahead.z + minGap;
        if (behind.z < minZ) {
          behind.z = minZ;
          // Match speed so it doesn't keep pushing
          behind.speed = Math.min(behind.speed, ahead.speed);
        }
      }
    }
  }

  /**
   * Scan z-bands ahead of the player. If any band has more than
   * MAX_LANES_IN_BAND lanes occupied, despawn a car to open a gap.
   */
  private bustWalls(_playerSpeed: number): void {
    const scanStart = -5;
    const scanEnd = -TRAFFIC_SPAWN_DISTANCE;

    for (let bandZ = scanStart; bandZ > scanEnd; bandZ -= WALL_BAND_WIDTH) {
      const bandMin = bandZ - WALL_BAND_WIDTH;
      const bandMax = bandZ;

      const lanesInBand = new Set<number>();
      const carsInBand: number[] = []; // indices into this.cars

      for (let i = 0; i < this.cars.length; i++) {
        const car = this.cars[i];
        if (car.z >= bandMin && car.z <= bandMax) {
          lanesInBand.add(car.lane);
          carsInBand.push(i);
        }
      }

      if (lanesInBand.size > MAX_LANES_IN_BAND && carsInBand.length > 0) {
        // Despawn the last car added to break the wall
        this.despawn(carsInBand[carsInBand.length - 1]);
        return; // one despawn per tick is enough
      }
    }
  }

  private getSpawnInterval(playerSpeed: number): number {
    // Lerp from BASE to MIN based on speed ratio
    const t = Math.min(
      1,
      Math.max(0, (playerSpeed - SPEED_MIN_MS) / (SPEED_MAX_MS - SPEED_MIN_MS)),
    );
    return TRAFFIC_BASE_SPAWN_INTERVAL +
      (TRAFFIC_MIN_SPAWN_INTERVAL - TRAFFIC_BASE_SPAWN_INTERVAL) * t;
  }

  private trySpawn(playerSpeed: number): boolean {
    // Pick random lane
    const lane = Math.floor(this.rng() * NUM_LANES);

    // Check same-lane gap
    const spawnZ = -TRAFFIC_SPAWN_DISTANCE;
    for (const car of this.cars) {
      if (car.lane === lane && Math.abs(car.z - spawnZ) < TRAFFIC_SAME_LANE_GAP) {
        return false; // too close, skip
      }
    }

    // Wall prevention: don't spawn if too many lanes already occupied near spawn z
    const lanesOccupied = new Set<number>();
    for (const car of this.cars) {
      if (Math.abs(car.z - spawnZ) < WALL_CHECK_DEPTH) {
        lanesOccupied.add(car.lane);
      }
    }
    if (lanesOccupied.size >= MAX_LANES_AT_SPAWN_DEPTH && !lanesOccupied.has(lane)) {
      return false; // would create a wall — skip
    }

    // Roll car type
    const typeRoll = this.rng();
    let type: 'normal' | 'semi' | 'swerving';
    if (typeRoll < HAZARD_SEMI_CHANCE) {
      type = 'semi';
    } else if (typeRoll < HAZARD_SEMI_CHANCE + HAZARD_SWERVING_CHANCE) {
      type = 'swerving';
    } else {
      type = 'normal';
    }

    // Assign speed
    const variationRoll = this.rng();
    const variation = 1 + (variationRoll - 0.5) * 2 * LANE_SPEED_VARIATION;
    let speed = Math.min(playerSpeed * LANE_SPEED_MULTIPLIERS[lane] * variation, TRAFFIC_MAX_SPEED);
    if (type === 'semi') {
      speed *= SEMI_SPEED_FACTOR;
    }

    // Create or reuse mesh
    const mesh = this.acquireMesh(type);

    // Determine mesh y (half the box height)
    let meshY: number;
    if (type === 'semi') {
      meshY = SEMI_SIZE.h / 2;
    } else {
      meshY = NORMAL_SIZE.h / 2;
    }

    const x = laneToX(lane);
    const car: TrafficCar = {
      id: this.nextId++,
      lane,
      baseSpeed: speed,
      speed,
      z: spawnZ,
      type,
      mesh,
      swayPhase: 0,
      x,
      meshY,
    };

    mesh.position.set(x, meshY, spawnZ);
    mesh.visible = true;
    this.cars.push(car);
    return true;
  }

  private poolFor(type: 'normal' | 'semi' | 'swerving'): Mesh[] {
    if (type === 'semi') return this.semiPool;
    if (type === 'swerving') return this.swervingPool;
    return this.normalPool;
  }

  private acquireMesh(type: 'normal' | 'semi' | 'swerving'): Mesh {
    // Try to reuse from the correct type-specific pool
    const pool = this.poolFor(type);
    if (pool.length > 0) {
      return pool.pop()!;
    }

    // Create new mesh
    let geometry: BoxGeometry;
    let material: MeshStandardMaterial;

    if (type === 'semi') {
      geometry = new BoxGeometry(SEMI_SIZE.w, SEMI_SIZE.h, SEMI_SIZE.l);
      material = new MeshStandardMaterial({ color: SEMI_COLOR, emissive: SEMI_COLOR, emissiveIntensity: 0.3 });
    } else if (type === 'swerving') {
      geometry = new BoxGeometry(NORMAL_SIZE.w, NORMAL_SIZE.h, NORMAL_SIZE.l);
      material = new MeshStandardMaterial({ color: SWERVING_COLOR, emissive: SWERVING_COLOR, emissiveIntensity: 0.3 });
    } else {
      geometry = new BoxGeometry(NORMAL_SIZE.w, NORMAL_SIZE.h, NORMAL_SIZE.l);
      const color = NORMAL_COLORS[Math.floor(this.rng() * NORMAL_COLORS.length)];
      material = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 });
    }

    const mesh = new Mesh(geometry, material);
    this.scene.add(mesh);
    return mesh;
  }

  private despawn(index: number): void {
    const car = this.cars[index];
    this._despawnedIds.push(car.id);
    car.mesh.visible = false;
    this.poolFor(car.type).push(car.mesh);
    this.cars.splice(index, 1);
  }
}
