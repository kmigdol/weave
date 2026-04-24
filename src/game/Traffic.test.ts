import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock three.js before importing Traffic
vi.mock('three', () => {
  class MockMesh {
    _isFallback = true; // tag so tests can distinguish fallback from GLB
    position = {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    };
    visible = true;
    geometry = { dispose: vi.fn() };
    material = { dispose: vi.fn() };
  }
  class MockScene {
    children: any[] = [];
    add(child: any) {
      this.children.push(child);
    }
    remove(child: any) {
      this.children = this.children.filter((c: any) => c !== child);
    }
  }
  return {
    Mesh: MockMesh,
    BoxGeometry: vi.fn(),
    MeshStandardMaterial: vi.fn(),
    Scene: MockScene,
    Box3: class { min = { y: 0 }; setFromObject() { return this; } },
  };
});

// Mock Assets module so cloneCar returns distinguishable GLB groups
vi.mock('../render/Assets', () => {
  return {
    cloneCar: vi.fn(() => ({
      _isGLB: true,
      position: {
        x: 0, y: 0, z: 0,
        set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
      },
      visible: true,
      traverse: vi.fn(),
      children: [],
    })),
  };
});

import { TrafficManager } from './Traffic';
import { Scene } from 'three';
import {
  TRAFFIC_SPAWN_DISTANCE,
  TRAFFIC_DESPAWN_DISTANCE,
  TRAFFIC_BASE_SPAWN_INTERVAL,
  TRAFFIC_MIN_SPAWN_INTERVAL,
  SWERVE_AMPLITUDE,
  SWERVE_FREQUENCY,
  LANE_SPEED_MULTIPLIERS,
  LANE_SPEED_VARIATION,
  SEMI_SPEED_FACTOR,
  SPEED_MIN_MS,
  SPEED_MAX_MS,
} from './constants';
import { NUM_LANES, laneToX } from './Player';

describe('TrafficManager', () => {
  let scene: Scene;
  let rngSequence: number[];
  let rngIndex: number;

  /** Creates an RNG that always returns a fixed value. */
  function fixedRng(value: number): () => number {
    return () => value;
  }

  /** Creates an RNG that cycles through a sequence of values. */
  function sequenceRng(values: number[]): () => number {
    rngSequence = values;
    rngIndex = 0;
    return () => {
      const v = rngSequence[rngIndex % rngSequence.length];
      rngIndex++;
      return v;
    };
  }

  beforeEach(() => {
    scene = new Scene();
    rngSequence = [];
    rngIndex = 0;
  });

  describe('constructor', () => {
    it('creates with empty cars array', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      expect(tm.cars).toEqual([]);
    });
  });

  describe('spawning', () => {
    it('spawns a car when timer expires', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      // Tick with dt = TRAFFIC_BASE_SPAWN_INTERVAL to expire the timer
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars.length).toBe(1);
    });

    it('spawned car has z approximately equal to -TRAFFIC_SPAWN_DISTANCE', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars[0].z).toBeCloseTo(-TRAFFIC_SPAWN_DISTANCE, 0);
    });

    it('spawned car has lane in valid range [0, NUM_LANES-1]', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars[0].lane).toBeGreaterThanOrEqual(0);
      expect(tm.cars[0].lane).toBeLessThanOrEqual(NUM_LANES - 1);
    });

    it('spawns a normal car when rng is above hazard thresholds', () => {
      // RNG values: lane selection (0.5 -> lane 2), type roll (0.5 -> normal), speed variation
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars[0].type).toBe('normal');
    });

    it('spawns a semi when rng rolls below HAZARD_SEMI_CHANCE', () => {
      // RNG: first call = lane selection, second call = type roll (needs < 0.1 for semi)
      // We use 0.05 for everything; type roll will be 0.05 < 0.1 = semi
      const tm = new TrafficManager(scene, fixedRng(0.05));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars[0].type).toBe('semi');
    });

    it('spawns a swerving car when rng is in swerving range', () => {
      // Type roll needs: >= HAZARD_SEMI_CHANCE (0.1) AND < HAZARD_SEMI_CHANCE + HAZARD_SWERVING_CHANCE (0.15)
      // So a value of 0.12 would work. Use sequence to control lane separately.
      const rng = sequenceRng([0.5, 0.12, 0.5]); // lane=0.5, type=0.12, speed var=0.5
      const tm = new TrafficManager(scene, rng);
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars[0].type).toBe('swerving');
    });

    it('semi cars are slower by SEMI_SPEED_FACTOR', () => {
      // Use fixed rng of 0.05 so the type is semi
      const tm = new TrafficManager(scene, fixedRng(0.05));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      const car = tm.cars[0];
      // Expected base speed: playerSpeed * LANE_SPEED_MULTIPLIERS[lane] * (1 + (0.05-0.5)*2*LANE_SPEED_VARIATION)
      // With rng=0.05, lane = floor(0.05 * 5) = 0
      const lane = car.lane;
      const variation = 1 + (0.05 - 0.5) * 2 * LANE_SPEED_VARIATION;
      const baseSpeed = playerSpeed * LANE_SPEED_MULTIPLIERS[lane] * variation;
      const expectedSpeed = baseSpeed * SEMI_SPEED_FACTOR;
      expect(car.speed).toBeCloseTo(expectedSpeed, 3);
    });

    it('same-lane gap enforcement prevents spawning too close', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;

      // First spawn
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars.length).toBe(1);

      // The first car is at z = -TRAFFIC_SPAWN_DISTANCE.
      // Don't move it far, so it's still within the gap distance of the spawn point.
      // Second spawn attempt (after timer expires again) should fail because same lane, too close.
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      // With fixed rng=0.5, both attempts pick the same lane, and the first car hasn't moved enough.
      // So the second spawn should be skipped.
      expect(tm.cars.length).toBe(1);
    });

    it('spawn interval decreases as player speed increases', () => {
      // The initial timer is always TRAFFIC_BASE_SPAWN_INTERVAL (0.8).
      // After the first spawn, the reset interval depends on playerSpeed.
      // At min speed -> interval = BASE (0.8). At max speed -> interval = MIN (0.25).

      // Spawn first car at min speed (timer starts at BASE=0.8)
      const tmSlow = new TrafficManager(scene, fixedRng(0.3));
      tmSlow.update(SPEED_MIN_MS, TRAFFIC_BASE_SPAWN_INTERVAL); // first spawn
      expect(tmSlow.cars.length).toBe(1);
      // After reset, interval at min speed = BASE (0.8). A small dt won't trigger second spawn.
      const dtSmall = TRAFFIC_MIN_SPAWN_INTERVAL + 0.01; // 0.26s
      tmSlow.update(SPEED_MIN_MS, dtSmall);
      expect(tmSlow.cars.length).toBe(1); // no second spawn

      // Spawn first car at max speed
      const tmFast = new TrafficManager(scene, fixedRng(0.3));
      tmFast.update(SPEED_MAX_MS, TRAFFIC_BASE_SPAWN_INTERVAL); // first spawn
      expect(tmFast.cars.length).toBe(1);
      // After reset, interval at max speed = MIN (0.25). dtSmall (0.26) should trigger.
      // But same-lane gap may block. Use different rng lane values to pick different lanes.
      // rng=0.3 -> lane = floor(0.3*5)=1. Both spawns pick lane 1.
      // First car is at z ~ -300 + movement. Gap check: |car.z - (-300)| needs to be >= 40.
      // With max speed=80.5, car.speed ~ 80.5*0.78*(1+(0.3-0.5)*2*0.08) = lots, relative speed is small.
      // Actually relative speed = playerSpeed - carSpeed. carSpeed < playerSpeed, so car.z increases.
      // After BASE=0.8s, car.z = -300 + (80.5 - carSpeed)*0.8. carSpeed ~ 80.5*0.78*0.9488 ~ 59.6.
      // relative = 80.5-59.6 = 20.9. After 0.8s: z ~ -300+16.7 = -283.3. Gap from -300: 16.7 < 40. Blocked!
      // Use rng=0.1 so lane1 = floor(0.1*5)=0, then gap allows different lanes if second spawn picks different.
      // Simpler approach: use a sequence where the second spawn picks a different lane.
      const tmFast2 = new TrafficManager(
        scene,
        sequenceRng([0.3, 0.5, 0.5, 0.7, 0.5, 0.5]),
        // spawn1: lane=floor(0.3*5)=1, type=0.5(normal), speed=0.5
        // spawn2: lane=floor(0.7*5)=3, type=0.5(normal), speed=0.5
      );
      tmFast2.update(SPEED_MAX_MS, TRAFFIC_BASE_SPAWN_INTERVAL); // first spawn (lane 1)
      expect(tmFast2.cars.length).toBe(1);
      tmFast2.update(SPEED_MAX_MS, dtSmall); // second spawn attempt (lane 3, no gap conflict)
      expect(tmFast2.cars.length).toBe(2); // second spawn succeeded
    });
  });

  describe('movement', () => {
    it('car moves toward player each tick (z increases)', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      // Spawn a car
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      const z0 = tm.cars[0].z;

      // The car speed is slower than playerSpeed, so relative movement
      // means car.z increases (moves toward positive z relative to player).
      const dt = 1 / 60;
      tm.update(playerSpeed, dt);
      expect(tm.cars[0].z).toBeGreaterThan(z0);
    });

    it('car z changes by exactly (playerSpeed - carSpeed) * dt', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);

      const car = tm.cars[0];
      const z0 = car.z;
      const carSpeed = car.speed;
      const dt = 0.1;

      tm.update(playerSpeed, dt);
      const expectedZ = z0 + (playerSpeed - carSpeed) * dt;
      expect(car.z).toBeCloseTo(expectedZ, 5);
    });
  });

  describe('despawning', () => {
    it('car is despawned when z > TRAFFIC_DESPAWN_DISTANCE', () => {
      // Use a sequence RNG. First spawn picks lane 2.
      // On the large-dt tick, the timer will expire and try to spawn again on lane 2,
      // but same-lane gap check at z=-300 will fail since the original car will have
      // been despawned (removed from cars) by that point. Use rng that picks same lane
      // so the new spawn succeeds. Instead, use a known approach: track the original
      // car's mesh and verify it's no longer in the cars array.
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars.length).toBe(1);

      const car = tm.cars[0];
      const relativeSpeed = playerSpeed - car.speed;
      const timeToTravel = (TRAFFIC_DESPAWN_DISTANCE - car.z + 1) / relativeSpeed;

      tm.update(playerSpeed, timeToTravel);
      // The original car object should no longer be in the array (it was spliced out)
      expect(tm.cars.includes(car)).toBe(false);
    });

    it('despawned mesh is set to visible=false', () => {
      // Use reset() to despawn without pool reuse, so we can check visible=false.
      const tm = new TrafficManager(
        scene,
        sequenceRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
      );
      tm.update(50, TRAFFIC_BASE_SPAWN_INTERVAL);
      const mesh = tm.cars[0].mesh;

      tm.reset();
      expect(mesh.visible).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all cars', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars.length).toBeGreaterThan(0);

      tm.reset();
      expect(tm.cars.length).toBe(0);
    });

    it('sets all meshes to invisible after reset', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      const mesh = tm.cars[0].mesh;

      tm.reset();
      expect(mesh.visible).toBe(false);
    });
  });

  describe('swerving', () => {
    it('swerving car x oscillates with sin(swayPhase)', () => {
      // Use sequence RNG: lane=0.5, type=0.12 (swerving), speed variation=0.5
      const rng = sequenceRng([0.5, 0.12, 0.5, 0.99, 0.99, 0.99]);
      const tm = new TrafficManager(scene, rng);
      const playerSpeed = 50;

      // Spawn the swerving car. The car is spawned in step 6 of update(),
      // AFTER the sway update loop (step 2), so swayPhase stays 0 after this tick.
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars[0].type).toBe('swerving');

      const car = tm.cars[0];
      const baseLaneX = laneToX(car.lane);
      expect(car.swayPhase).toBe(0); // not yet updated

      const dt = 1.0; // 1 second
      tm.update(playerSpeed, dt);

      // In the second update, step 2 runs: swayPhase += SWERVE_FREQUENCY * 1.0 = 1.8
      const expectedPhase = SWERVE_FREQUENCY * dt;
      const expectedX = baseLaneX + Math.sin(expectedPhase) * SWERVE_AMPLITUDE;
      expect(car.x).toBeCloseTo(expectedX, 3);
    });
  });

  describe('collidables', () => {
    it('returns correct x, z, type for each active car', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);

      const collidables = tm.collidables;
      expect(collidables.length).toBe(1);
      expect(collidables[0].x).toBe(tm.cars[0].x);
      expect(collidables[0].z).toBe(tm.cars[0].z);
      expect(collidables[0].type).toBe(tm.cars[0].type);
    });

    it('returns empty array when no cars', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      expect(tm.collidables).toEqual([]);
    });
  });

  describe('mesh sync', () => {
    it('mesh position is synced with car x, y, z after update', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);

      const car = tm.cars[0];
      const mesh = car.mesh;
      expect(mesh.position.x).toBeCloseTo(car.x, 3);
      expect(mesh.position.z).toBeCloseTo(car.z, 3);
      // y should be half the box height (normal car: 1.2 / 2 = 0.6)
      expect(mesh.position.y).toBeGreaterThan(0);
    });
  });

  describe('car IDs', () => {
    it('spawned cars have unique incrementing IDs', () => {
      // Each normal car spawn consumes 4 rng values: lane, type, speed var, color.
      // Use sequence RNG so spawns land in different lanes to avoid gap conflicts.
      // MAX_LANES_AT_SPAWN_DEPTH=2, so only 2 cars can spawn near the same z.
      const rng = sequenceRng([
        0.3, 0.5, 0.5, 0.5, // spawn 1: lane=1, type=normal, speed var, color
        0.7, 0.5, 0.5, 0.5, // spawn 2: lane=3, type=normal, speed var, color
      ]);
      const tm = new TrafficManager(scene, rng);
      const playerSpeed = 50;

      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);

      expect(tm.cars.length).toBe(2);
      expect(tm.cars[0].id).toBe(1);
      expect(tm.cars[1].id).toBe(2);
      // IDs are unique and incrementing
      expect(tm.cars[0].id).not.toBe(tm.cars[1].id);
    });

    it('despawnedIds contains IDs of despawned cars', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;

      // Spawn a car
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars.length).toBe(1);
      const carId = tm.cars[0].id;

      // Force despawn by advancing time far enough
      const car = tm.cars[0];
      const relativeSpeed = playerSpeed - car.speed;
      const timeToTravel = (TRAFFIC_DESPAWN_DISTANCE - car.z + 1) / relativeSpeed;
      tm.update(playerSpeed, timeToTravel);

      expect(tm.despawnedIds).toContain(carId);
    });

    it('clearDespawnedIds empties the array', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;

      // Spawn and despawn a car
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      const car = tm.cars[0];
      const relativeSpeed = playerSpeed - car.speed;
      const timeToTravel = (TRAFFIC_DESPAWN_DISTANCE - car.z + 1) / relativeSpeed;
      tm.update(playerSpeed, timeToTravel);

      expect(tm.despawnedIds.length).toBeGreaterThan(0);
      tm.clearDespawnedIds();
      expect(tm.despawnedIds.length).toBe(0);
    });

    it('reset reports all car IDs as despawned', () => {
      // Use sequence RNG so spawns land in different lanes
      const rng = sequenceRng([
        0.3, 0.5, 0.5, // spawn 1: lane=1
        0.7, 0.5, 0.5, // spawn 2: lane=3
      ]);
      const tm = new TrafficManager(scene, rng);
      const playerSpeed = 50;

      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      expect(tm.cars.length).toBe(2);

      const ids = tm.cars.map((c) => c.id);
      tm.reset();

      for (const id of ids) {
        expect(tm.despawnedIds).toContain(id);
      }
      expect(tm.cars.length).toBe(0);
    });
  });

  describe('pool reuse', () => {
    it('reuses pooled mesh on subsequent spawn after despawn', () => {
      // With fixed rng=0.5, on the large despawn tick the timer expires and
      // the despawned mesh is immediately reused for a new car (same lane, no gap
      // conflict because the old car was already removed). Verify the mesh is reused.
      const tm = new TrafficManager(scene, fixedRng(0.5));
      const playerSpeed = 50;

      // Spawn a car
      tm.update(playerSpeed, TRAFFIC_BASE_SPAWN_INTERVAL);
      const firstMesh = tm.cars[0].mesh;

      // Force despawn by advancing far. The timer will also expire, spawning a new car
      // which reuses the pooled mesh.
      const car = tm.cars[0];
      const relativeSpeed = playerSpeed - car.speed;
      const timeToTravel = (TRAFFIC_DESPAWN_DISTANCE - car.z + 1) / relativeSpeed;
      tm.update(playerSpeed, timeToTravel);

      // The original car was despawned (mesh set invisible, pushed to pool).
      // A new car was immediately spawned, pulling the mesh from the pool.
      // So the mesh should now be visible again and assigned to the new car.
      expect(tm.cars.length).toBe(1);
      expect(tm.cars[0].mesh).toBe(firstMesh);
      expect(firstMesh.visible).toBe(true);
    });
  });

  describe('setAssets pool flushing', () => {
    it('after reset then setAssets, new cars use GLB models not pooled boxes', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));

      // Spawn some cars WITHOUT assets (they'll be fallback boxes)
      for (let i = 0; i < 5; i++) {
        tm.update(SPEED_MIN_MS, TRAFFIC_BASE_SPAWN_INTERVAL + 0.01);
      }
      const boxCount = tm.cars.length;
      expect(boxCount).toBeGreaterThan(0);

      // Verify they're fallback boxes
      for (const car of tm.cars) {
        expect((car.mesh as any)._isFallback).toBe(true);
      }

      // Now simulate what Game.start() should do: reset first, then setAssets
      tm.reset();
      tm.setAssets({
        sedan: {} as any,
        sedanSports: {} as any,
        suv: {} as any,
        hatchbackSports: {} as any,
        police: {} as any,
        taxi: {} as any,
        truck: {} as any,
        delivery: {} as any,
        van: {} as any,
      });

      // Spawn new cars — should use GLB models (cloneCar), NOT pooled boxes
      for (let i = 0; i < 5; i++) {
        tm.update(SPEED_MIN_MS, TRAFFIC_BASE_SPAWN_INTERVAL + 0.01);
      }
      expect(tm.cars.length).toBeGreaterThan(0);

      for (const car of tm.cars) {
        expect((car.mesh as any)._isGLB).toBe(true);
      }
    });

    it('setAssets then reset leaves pooled boxes (wrong order)', () => {
      const tm = new TrafficManager(scene, fixedRng(0.5));

      // Spawn fallback-box cars
      for (let i = 0; i < 5; i++) {
        tm.update(SPEED_MIN_MS, TRAFFIC_BASE_SPAWN_INTERVAL + 0.01);
      }
      expect(tm.cars.length).toBeGreaterThan(0);

      // WRONG order: setAssets first (flushes empty pools), then reset (puts boxes into pools)
      tm.setAssets({
        sedan: {} as any, sedanSports: {} as any, suv: {} as any,
        hatchbackSports: {} as any, police: {} as any, taxi: {} as any,
        truck: {} as any, delivery: {} as any, van: {} as any,
      });
      tm.reset(); // boxes go back into pools AFTER flush

      // Spawn new cars — pool has boxes, so they'll be reused instead of GLB
      for (let i = 0; i < 5; i++) {
        tm.update(SPEED_MIN_MS, TRAFFIC_BASE_SPAWN_INTERVAL + 0.01);
      }

      // At least one car should be a fallback box (from the pool)
      const hasBox = tm.cars.some((car) => (car.mesh as any)._isFallback === true);
      expect(hasBox).toBe(true);
    });
  });
});
