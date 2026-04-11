import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock document.createElement to return a fake canvas with a stub 2D context
const originalCreateElement = document.createElement.bind(document);
vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
  if (tag === 'canvas') {
    const fakeCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 50 }),
      setLineDash: vi.fn(),
    };
    return {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(fakeCtx),
    } as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tag);
});

// Mock three.js before importing Environment
vi.mock('three', () => {
  class MockVector3 {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }
  class MockEuler {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }
  class MockGroup {
    position = new MockVector3();
    rotation = new MockEuler();
    children: any[] = [];
    add(child: any) {
      this.children.push(child);
    }
  }
  class MockMesh {
    position = new MockVector3();
    rotation = new MockEuler();
    geometry = { dispose: vi.fn() };
    material = { dispose: vi.fn() };
    constructor(public geo?: any, public mat?: any) {}
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
    Group: MockGroup,
    Mesh: MockMesh,
    Scene: MockScene,
    PlaneGeometry: vi.fn(),
    BoxGeometry: vi.fn(),
    CylinderGeometry: vi.fn(),
    ConeGeometry: vi.fn(),
    MeshStandardMaterial: vi.fn(),
    MeshBasicMaterial: vi.fn(),
    CanvasTexture: class MockCanvasTexture {
      needsUpdate = false;
      dispose = vi.fn();
      constructor(public canvas?: any) {}
    },
    DoubleSide: 2,
    FrontSide: 0,
  };
});

import { Scene } from 'three';
import { Environment } from './Environment';

describe('Environment', () => {
  let scene: Scene;

  beforeEach(() => {
    scene = new Scene();
  });

  describe('constructor', () => {
    it('adds props to the scene', () => {
      const env = new Environment(scene);
      // Scene should have children (billboards, signs, trees, gantries)
      expect((scene as any).children.length).toBeGreaterThan(0);
      // Suppress unused variable warning
      expect(env).toBeDefined();
    });
  });

  describe('billboard textures', () => {
    it('generates exactly 18 billboard textures', () => {
      const env = new Environment(scene);
      // Access the internal textures via the public getter for testing
      expect(env.billboardTextureCount).toBe(18);
    });
  });

  describe('scroll-and-wrap', () => {
    it('moves all props forward by distanceDelta', () => {
      const env = new Environment(scene);
      const initialPositions = env.allPropZPositions();
      const delta = 10;
      env.update(delta);
      const updatedPositions = env.allPropZPositions();

      // Every prop should have moved forward by delta
      for (let i = 0; i < initialPositions.length; i++) {
        // Either moved forward by delta, or wrapped (z jumped far negative)
        const moved = updatedPositions[i] - initialPositions[i];
        // If it didn't wrap, it should have moved by exactly delta
        if (moved > 0) {
          expect(moved).toBeCloseTo(delta, 5);
        }
      }
    });

    it('wraps props that pass z > 50 back to far ahead', () => {
      const env = new Environment(scene);
      // Move a huge distance to force wrapping
      env.update(1000);
      const positions = env.allPropZPositions();

      // All props should be within visible range (behind camera threshold is 50)
      for (const z of positions) {
        expect(z).toBeLessThanOrEqual(50);
      }
    });

    it('all props remain within visible range after many updates', () => {
      const env = new Environment(scene);
      // Simulate many frames of scrolling
      for (let i = 0; i < 200; i++) {
        env.update(5);
      }
      const positions = env.allPropZPositions();
      for (const z of positions) {
        expect(z).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('prop counts', () => {
    it('creates the expected number of billboard groups', () => {
      const env = new Environment(scene);
      // ROAD_LENGTH=600, every ~200m => ~3 billboards, but coverage should give us at least 3
      expect(env.billboardCount).toBeGreaterThanOrEqual(3);
    });

    it('creates the expected number of freeway sign groups', () => {
      const env = new Environment(scene);
      // ROAD_LENGTH=600, every ~500m => at least 1
      expect(env.freewaySignCount).toBeGreaterThanOrEqual(1);
    });

    it('creates the expected number of palm tree groups', () => {
      const env = new Environment(scene);
      // ROAD_LENGTH=600, every ~100m => ~6 clusters, each cluster has 2-3 trees
      expect(env.palmTreeClusterCount).toBeGreaterThanOrEqual(5);
    });

    it('creates the expected number of overhead gantries', () => {
      const env = new Environment(scene);
      // ROAD_LENGTH=600, every ~400m => at least 1
      expect(env.gantryCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('billboard placement', () => {
    it('billboards alternate left and right sides', () => {
      const env = new Environment(scene);
      const sides = env.billboardSides();
      // Check alternating pattern
      for (let i = 1; i < sides.length; i++) {
        expect(sides[i]).not.toBe(sides[i - 1]);
      }
    });
  });
});
