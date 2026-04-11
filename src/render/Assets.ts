import { Group, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ── Car model dimensions (must match hitbox constants) ─────────────
/** Target z-extent (length in meters) for normal-sized cars. */
const NORMAL_CAR_LENGTH = 3.8;
/** Target z-extent (length in meters) for large vehicles (truck, delivery, van). */
const LARGE_CAR_LENGTH = 8.0;

const LARGE_CARS = new Set(['truck', 'delivery', 'van']);

/** Maps logical car names to the GLB filename on disk. */
const FILE_MAP: Record<keyof AssetManifest, string> = {
  sedan: 'sedan.glb',
  sedanSports: 'sedan-sports.glb',
  truck: 'truck.glb',
  van: 'van.glb',
  taxi: 'taxi.glb',
  suv: 'suv.glb',
  delivery: 'delivery.glb',
  hatchbackSports: 'hatchback-sports.glb',
  police: 'police.glb',
};

// ── Types ──────────────────────────────────────────────────────────

/** Manifest of all pre-loaded car models, keyed by logical name. */
export interface AssetManifest {
  sedan: Group;
  sedanSports: Group;
  truck: Group;
  van: Group;
  taxi: Group;
  suv: Group;
  delivery: Group;
  hatchbackSports: Group;
  police: Group;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Scale `scene` uniformly so its z-extent (bounding-box depth) equals
 * `targetLength`.  This preserves the model's aspect ratio.
 */
function scaleToLength(scene: Group, targetLength: number): void {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);

  // size.z is the depth of the model's bounding box
  if (size.z === 0) return; // degenerate model — skip
  const scaleFactor = targetLength / size.z;
  scene.scale.multiplyScalar(scaleFactor);
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Load all 9 car GLB models in parallel, scale them to match game
 * hitbox dimensions, and return a manifest of ready-to-clone templates.
 *
 * Individual load failures are logged and the entry is set to `null`.
 * Callers should fall back to procedural box geometry for any null slot.
 */
export async function loadAssets(): Promise<AssetManifest> {
  const loader = new GLTFLoader();
  const keys = Object.keys(FILE_MAP) as (keyof AssetManifest)[];

  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const gltf = await loader.loadAsync(`/models/${FILE_MAP[key]}`);
        const scene = gltf.scene;
        scene.name = key;

        const targetLength = LARGE_CARS.has(key) ? LARGE_CAR_LENGTH : NORMAL_CAR_LENGTH;
        scaleToLength(scene, targetLength);

        return { key, scene };
      } catch (err) {
        console.warn(`[Assets] Failed to load ${FILE_MAP[key]}:`, err);
        return { key, scene: null };
      }
    }),
  );

  const manifest = {} as Record<keyof AssetManifest, Group>;
  for (const { key, scene } of results) {
    manifest[key] = scene as Group;
  }
  return manifest as AssetManifest;
}

/**
 * Clone a car template for placement in the scene.  The clone is a
 * deep copy of all meshes / materials so each instance can be
 * independently transformed.
 */
export function cloneCar(template: Group): Group {
  return template.clone();
}
