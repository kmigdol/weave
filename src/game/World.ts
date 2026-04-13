import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
  PlaneGeometry,
  DoubleSide,
} from 'three';
import { NUM_LANES, LANE_WIDTH } from './Player';

const ROAD_LENGTH = 600; // meters of visible road
const ROAD_WIDTH = NUM_LANES * LANE_WIDTH + 4; // lanes + shoulder
const DASH_LENGTH = 4;
const DASH_GAP = 6;
const DASH_STRIDE = DASH_LENGTH + DASH_GAP;
const DASH_WIDTH = 0.18;
const BARRIER_HEIGHT = 0.9;
const BARRIER_THICKNESS = 0.4;

/**
 * The infinite highway environment. For WEA-1 this is a single road plane,
 * lane divider dashes that cycle as the player moves forward, and two
 * Jersey barriers along the shoulders. Skybox/billboards/buildings land in
 * WEA-3.
 *
 * The world never actually moves — we scroll the dashes' z positions and
 * mod them back into the visible range. The player/car is stationary at
 * z=0 in world space; forward motion is a purely visual effect.
 */
export class World {
  private readonly dashes: Mesh[] = [];
  /** How many meters of road have "passed" — used only for dash offset. */
  private distanceM = 0;

  constructor(scene: Scene) {
    // Road surface
    const road = new Mesh(
      new PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH),
      new MeshStandardMaterial({
        color: '#555560',
        roughness: 0.9,
        metalness: 0.0,
        side: DoubleSide,
      }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -ROAD_LENGTH / 2 + 40; // extend far ahead, a bit behind camera
    scene.add(road);

    // Ground planes on either side of the road (extends to horizon)
    const groundMat = new MeshStandardMaterial({
      color: '#3a5a30', // dry grass / scrubland
      roughness: 1.0,
      metalness: 0.0,
      side: DoubleSide,
    });
    const groundWidth = 400; // wide enough to fill peripheral vision
    const groundGeo = new PlaneGeometry(groundWidth, ROAD_LENGTH);
    const leftGround = new Mesh(groundGeo, groundMat);
    leftGround.rotation.x = -Math.PI / 2;
    leftGround.position.set(-ROAD_WIDTH / 2 - groundWidth / 2, -0.05, -ROAD_LENGTH / 2 + 40);
    scene.add(leftGround);
    const rightGround = new Mesh(groundGeo, groundMat);
    rightGround.rotation.x = -Math.PI / 2;
    rightGround.position.set(ROAD_WIDTH / 2 + groundWidth / 2, -0.05, -ROAD_LENGTH / 2 + 40);
    scene.add(rightGround);

    // Jersey barriers on both shoulders
    const barrierMat = new MeshStandardMaterial({ color: '#9a968c', roughness: 0.8 });
    const barrierGeo = new BoxGeometry(BARRIER_THICKNESS, BARRIER_HEIGHT, ROAD_LENGTH);
    const leftBarrier = new Mesh(barrierGeo, barrierMat);
    leftBarrier.position.set(-ROAD_WIDTH / 2 + BARRIER_THICKNESS / 2, BARRIER_HEIGHT / 2, -ROAD_LENGTH / 2 + 40);
    scene.add(leftBarrier);
    const rightBarrier = new Mesh(barrierGeo, barrierMat);
    rightBarrier.position.set(ROAD_WIDTH / 2 - BARRIER_THICKNESS / 2, BARRIER_HEIGHT / 2, -ROAD_LENGTH / 2 + 40);
    scene.add(rightBarrier);

    // Lane dividers — one dashed line between each pair of lanes.
    const dividerMat = new MeshStandardMaterial({
      color: '#f4f1d4',
      emissive: '#f4f1d4',
      emissiveIntensity: 0.35,
      roughness: 0.6,
    });
    const dashGeo = new BoxGeometry(DASH_WIDTH, 0.02, DASH_LENGTH);
    const dashCountPerDivider = Math.ceil(ROAD_LENGTH / DASH_STRIDE) + 1;

    for (let lane = 1; lane < NUM_LANES; lane++) {
      const centerX = (lane - NUM_LANES / 2) * LANE_WIDTH;
      for (let i = 0; i < dashCountPerDivider; i++) {
        const dash = new Mesh(dashGeo, dividerMat);
        dash.position.set(centerX, 0.03, 40 - i * DASH_STRIDE);
        scene.add(dash);
        this.dashes.push(dash);
      }
    }
  }

  /**
   * Advance the "forward motion" of the world by `distanceDeltaM`. The road
   * and barriers are static; only the dashes cycle so the player feels
   * speed. Each dash moves toward the camera and wraps around once it
   * passes behind.
   */
  update(distanceDeltaM: number): void {
    this.distanceM += distanceDeltaM;
    for (const dash of this.dashes) {
      dash.position.z += distanceDeltaM;
      if (dash.position.z > 50) {
        dash.position.z -= DASH_STRIDE * Math.ceil(ROAD_LENGTH / DASH_STRIDE);
      }
    }
  }

  get distanceMeters(): number {
    return this.distanceM;
  }
}
