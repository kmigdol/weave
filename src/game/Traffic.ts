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
  SWERVE_AMPLITUDE,
  SWERVE_FREQUENCY,
  SPEED_MIN_MS,
  SPEED_MAX_MS,
} from './constants';

// ── Color Palettes ──────────────────────────────────────────────────
const NORMAL_COLORS = [0x00ffff, 0xff00ff, 0x00ff66, 0xffff00, 0xff3399, 0x66ffcc, 0xaa88ff];
const SWERVING_COLOR = 0xff6600; // neon orange
const SEMI_COLOR = 0x44ffbb; // neon mint

// ── Mesh Dimensions ─────────────────────────────────────────────────
const NORMAL_SIZE = { w: 1.6, h: 1.2, l: 3.8 };
const SEMI_SIZE = { w: 2.4, h: 2.0, l: 8.0 };

export interface TrafficCar {
  lane: number;
  speed: number; // m/s
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

  constructor(scene: Scene, rng?: () => number) {
    this.scene = scene;
    this.rng = rng ?? Math.random;
    this.spawnTimer = TRAFFIC_BASE_SPAWN_INTERVAL;
  }

  /** Call every simulation tick. */
  update(playerSpeed: number, dtSeconds: number): void {
    // 1. Move all cars
    for (const car of this.cars) {
      car.z += (playerSpeed - car.speed) * dtSeconds;
    }

    // 2. Update swerving cars
    for (const car of this.cars) {
      if (car.type === 'swerving') {
        car.swayPhase += SWERVE_FREQUENCY * dtSeconds;
        car.x = laneToX(car.lane) + Math.sin(car.swayPhase) * SWERVE_AMPLITUDE;
      } else {
        // 3. Non-swerving car x from lane
        car.x = laneToX(car.lane);
      }
    }

    // 4. Sync mesh positions
    for (const car of this.cars) {
      car.mesh.position.set(car.x, car.meshY, car.z);
    }

    // 5. Despawn cars behind player
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (this.cars[i].z > TRAFFIC_DESPAWN_DISTANCE) {
        this.despawn(i);
      }
    }

    // 6. Maybe spawn new car (timer-based)
    this.spawnTimer -= dtSeconds;
    if (this.spawnTimer <= 0) {
      const spawned = this.trySpawn(playerSpeed);
      if (spawned) {
        this.spawnTimer = this.getSpawnInterval(playerSpeed);
      }
      // If not spawned (gap violation), don't reset timer — try again next tick
    }
  }

  /** Remove all cars, return meshes to pool, reset spawn timer. Used on restart. */
  reset(): void {
    for (let i = this.cars.length - 1; i >= 0; i--) {
      this.despawn(i);
    }
    this.spawnTimer = TRAFFIC_BASE_SPAWN_INTERVAL;
  }

  /** Get cars suitable for collision checking (zero-alloc — TrafficCar satisfies CollidableCar). */
  get collidables(): readonly TrafficCar[] {
    return this.cars;
  }

  // ── Private helpers ───────────────────────────────────────────────

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
    let speed = playerSpeed * LANE_SPEED_MULTIPLIERS[lane] * variation;
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
      lane,
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
      material = new MeshStandardMaterial({ color: SEMI_COLOR });
    } else if (type === 'swerving') {
      geometry = new BoxGeometry(NORMAL_SIZE.w, NORMAL_SIZE.h, NORMAL_SIZE.l);
      material = new MeshStandardMaterial({ color: SWERVING_COLOR });
    } else {
      geometry = new BoxGeometry(NORMAL_SIZE.w, NORMAL_SIZE.h, NORMAL_SIZE.l);
      const color = NORMAL_COLORS[Math.floor(this.rng() * NORMAL_COLORS.length)];
      material = new MeshStandardMaterial({ color });
    }

    const mesh = new Mesh(geometry, material);
    this.scene.add(mesh);
    return mesh;
  }

  private despawn(index: number): void {
    const car = this.cars[index];
    car.mesh.visible = false;
    this.poolFor(car.type).push(car.mesh);
    this.cars.splice(index, 1);
  }
}
