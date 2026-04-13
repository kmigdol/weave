import { Group, Box3, Vector3, Mesh, Material } from 'three';
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

/** Manifest of all pre-loaded car models, keyed by logical name. Entries are null if loading failed. */
export interface AssetManifest {
  sedan: Group | null;
  sedanSports: Group | null;
  truck: Group | null;
  van: Group | null;
  taxi: Group | null;
  suv: Group | null;
  delivery: Group | null;
  hatchbackSports: Group | null;
  police: Group | null;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Scale `scene` uniformly so its z-extent (bounding-box depth) equals
 * `targetLength`, and rotate 180° around Y so the car faces -z
 * (the direction of travel in our game). Kenney models face +z by default.
 */
function scaleAndOrient(scene: Group, targetLength: number): void {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);

  // size.z is the depth of the model's bounding box
  if (size.z === 0) return; // degenerate model — skip
  const scaleFactor = targetLength / size.z;
  scene.scale.multiplyScalar(scaleFactor);

  // Rotate 180° so the car faces -z (toward the camera / direction of travel)
  scene.rotation.y = Math.PI;
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
        scaleAndOrient(scene, targetLength);

        return { key, scene };
      } catch (err) {
        console.warn(`[Assets] Failed to load ${FILE_MAP[key]}:`, err);
        return { key, scene: null };
      }
    }),
  );

  const manifest = {} as AssetManifest;
  for (const { key, scene } of results) {
    manifest[key] = scene;
  }
  return manifest;
}

/**
 * Clone a car template for placement in the scene. Clones geometry
 * structure and deep-clones materials so mutations (e.g. emissive
 * changes) don't bleed across instances.
 */
export function cloneCar(template: Group): Group {
  const clone = template.clone();
  clone.traverse((child) => {
    if ((child as Mesh).isMesh) {
      const mesh = child as Mesh;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => (m as Material).clone());
      } else {
        mesh.material = (mesh.material as Material).clone();
      }
    }
  });
  return clone;
}
