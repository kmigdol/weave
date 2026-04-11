import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import { NUM_LANES, LANE_WIDTH } from './Player';

// ── Layout constants ────────────────────────────────────────────────
const ROAD_LENGTH = 600;
const ROAD_WIDTH = NUM_LANES * LANE_WIDTH + 4;
const WRAP_BEHIND = 50;  // z threshold behind camera to trigger wrap

const BILLBOARD_SPACING = 200;
const SIGN_SPACING = 500;
const TREE_CLUSTER_SPACING = 100;
const GANTRY_SPACING = 400;

const BILLBOARD_X_OFFSET = 15;
const TREE_X_MIN = 14;
const TREE_X_MAX = 18;

// ── Billboard texture pool ──────────────────────────────────────────

interface BillboardSpec {
  text: string;
  bgColor: string;
  textColor: string;
  fontSize: number;
  fontStyle: string;
  accentColor?: string;
  subtitle?: string;
}

const BILLBOARD_SPECS: BillboardSpec[] = [
  { text: 'Anthropical', bgColor: '#ffffff', textColor: '#1a1a1a', fontSize: 48, fontStyle: 'bold 48px sans-serif', subtitle: 'Sorry About That', accentColor: '#7c3aed' },
  { text: 'OpenEye', bgColor: '#0a0a0a', textColor: '#22c55e', fontSize: 52, fontStyle: 'bold 52px sans-serif', subtitle: 'Now With Feelings' },
  { text: 'zAI', bgColor: '#000000', textColor: '#ffffff', fontSize: 60, fontStyle: 'bold 60px sans-serif', subtitle: 'Move Fast And Replace Everyone', accentColor: '#ef4444' },
  { text: 'Cursyr', bgColor: '#0f172a', textColor: '#4ade80', fontSize: 36, fontStyle: '36px monospace', subtitle: 'Just Tab Accept Everything Tab Tab Tab Tab' },
  { text: 'Wayless', bgColor: '#ffffff', textColor: '#374151', fontSize: 44, fontStyle: '44px sans-serif', subtitle: 'Our Cars Are Lost Too' },
  { text: 'degrees.fyi', bgColor: '#facc15', textColor: '#000000', fontSize: 42, fontStyle: 'bold 42px sans-serif', subtitle: 'I Mass-Produced Your Job' },
  { text: '[stealth]', bgColor: '#ffffff', textColor: '#9ca3af', fontSize: 28, fontStyle: '28px sans-serif' },
  { text: 'Series F', bgColor: '#ffffff', textColor: '#000000', fontSize: 32, fontStyle: '32px sans-serif' },
  { text: 'AI for AI', bgColor: '#1a73e8', textColor: '#ffffff', fontSize: 48, fontStyle: 'bold 48px sans-serif' },
  { text: 'STOP HIRING HUMANS', bgColor: '#dc2626', textColor: '#ffffff', fontSize: 44, fontStyle: 'bold 44px sans-serif' },
  { text: 'WE RAISED $400M', bgColor: '#6366f1', textColor: '#ffffff', fontSize: 46, fontStyle: 'bold 46px sans-serif' },
  { text: 'Nexus.', bgColor: '#6b7280', textColor: '#ffffff', fontSize: 50, fontStyle: '50px sans-serif' },
  { text: 'Pre-Revenue, Post-Vibes', bgColor: '#fda4af', textColor: '#1e1b4b', fontSize: 36, fontStyle: 'italic 36px sans-serif' },
  { text: 'HONK IF YOU\'VE BEEN DISRUPTED', bgColor: '#facc15', textColor: '#000000', fontSize: 32, fontStyle: 'bold 32px sans-serif' },
  { text: 'YOUR AD HERE', bgColor: '#ffffff', textColor: '#6b7280', fontSize: 36, fontStyle: '36px sans-serif', subtitle: 'WE ACCEPT EQUITY' },
  { text: 'AN PHONG', bgColor: '#facc15', textColor: '#1e40af', fontSize: 52, fontStyle: 'bold 52px sans-serif', subtitle: 'INJURED IN AN AI ACCIDENT?  1-800-SHADING', accentColor: '#dc2626' },
  { text: 'MY OTHER CAR IS A FOUNDATION MODEL', bgColor: '#1e3a5f', textColor: '#ffffff', fontSize: 28, fontStyle: 'bold 28px sans-serif' },
  { text: 'DISRUPTING THE DISRUPTION', bgColor: '#000000', textColor: '#ffffff', fontSize: 44, fontStyle: 'bold 44px sans-serif' },
];

/**
 * Scrolling environment props: billboards, freeway signs, palm trees,
 * and overhead gantries. Uses the same scroll-and-wrap pattern as
 * World.ts lane dashes.
 */
export class Environment {
  private readonly billboards: Group[] = [];
  private readonly frewaySigns: Group[] = [];
  private readonly palmTreeClusters: Group[] = [];
  private readonly gantries: Group[] = [];
  private readonly textures: CanvasTexture[] = [];

  constructor(scene: Scene) {
    // Generate billboard texture pool
    this.textures = this.generateBillboardTextures();

    // Create all prop types
    this.createBillboards(scene);
    this.createFrewaySigns(scene);
    this.createPalmTreeClusters(scene);
    this.createGantries(scene);
  }

  // ── Public API ──────────────────────────────────────────────────────

  update(distanceDelta: number): void {
    this.scrollAndWrap(this.billboards, distanceDelta, BILLBOARD_SPACING);
    this.scrollAndWrap(this.frewaySigns, distanceDelta, SIGN_SPACING);
    this.scrollAndWrap(this.palmTreeClusters, distanceDelta, TREE_CLUSTER_SPACING);
    this.scrollAndWrap(this.gantries, distanceDelta, GANTRY_SPACING);
  }

  // ── Test-facing accessors (pure logic) ─────────────────────────────

  get billboardTextureCount(): number {
    return this.textures.length;
  }

  get billboardCount(): number {
    return this.billboards.length;
  }

  get freewaySignCount(): number {
    return this.frewaySigns.length;
  }

  get palmTreeClusterCount(): number {
    return this.palmTreeClusters.length;
  }

  get gantryCount(): number {
    return this.gantries.length;
  }

  /** Returns z positions of every scrolling prop for testing. */
  allPropZPositions(): number[] {
    const all: Group[] = [
      ...this.billboards,
      ...this.frewaySigns,
      ...this.palmTreeClusters,
      ...this.gantries,
    ];
    return all.map((g) => g.position.z);
  }

  /** Returns 'left' or 'right' for each billboard, for alternation tests. */
  billboardSides(): Array<'left' | 'right'> {
    return this.billboards.map((b) => (b.position.x < 0 ? 'left' : 'right'));
  }

  // ── Scroll-and-wrap core ───────────────────────────────────────────

  private scrollAndWrap(groups: Group[], delta: number, spacing: number): void {
    const totalSpan = Math.ceil(ROAD_LENGTH / spacing) * spacing;
    for (const g of groups) {
      g.position.z += delta;
      if (g.position.z > WRAP_BEHIND) {
        // Wrap back by enough multiples of totalSpan to be behind WRAP_BEHIND
        const overshoot = g.position.z - WRAP_BEHIND;
        const wraps = Math.ceil(overshoot / totalSpan);
        g.position.z -= wraps * totalSpan;
      }
    }
  }

  // ── Billboard creation ─────────────────────────────────────────────

  private createBillboards(scene: Scene): void {
    const count = Math.ceil(ROAD_LENGTH / BILLBOARD_SPACING);
    for (let i = 0; i < count; i++) {
      const group = new Group();
      const side = i % 2 === 0 ? 1 : -1; // alternating right/left
      const x = side * BILLBOARD_X_OFFSET;

      // Post
      const postGeo = new BoxGeometry(0.3, 5, 0.3);
      const postMat = new MeshStandardMaterial({ color: '#666666', roughness: 0.7 });
      const post = new Mesh(postGeo, postMat);
      post.position.set(0, 2.5, 0);
      group.add(post);

      // Billboard plane on top of post
      const planeGeo = new PlaneGeometry(8, 4);
      const texture = this.textures[i % this.textures.length];
      const planeMat = new MeshBasicMaterial({
        map: texture,
        side: DoubleSide,
      });
      const plane = new Mesh(planeGeo, planeMat);
      plane.position.set(0, 7, 0);
      // Angle slightly toward road
      plane.rotation.y = side > 0 ? -0.15 : 0.15;
      group.add(plane);

      group.position.set(x, 0, WRAP_BEHIND - i * BILLBOARD_SPACING);
      scene.add(group);
      this.billboards.push(group);
    }
  }

  // ── Freeway sign creation ──────────────────────────────────────────

  private createFrewaySigns(scene: Scene): void {
    const count = Math.ceil(ROAD_LENGTH / SIGN_SPACING);
    const signTexts = ['SAN FRANCISCO  12', 'EXIT 429  VIBE CODING JAM'];

    for (let i = 0; i < count; i++) {
      const group = new Group();

      // Gantry frame for the sign
      const postMat = new MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.6, metalness: 0.3 });
      const postGeo = new BoxGeometry(0.4, 8, 0.4);

      const leftPost = new Mesh(postGeo, postMat);
      leftPost.position.set(-ROAD_WIDTH / 2 - 1, 4, 0);
      group.add(leftPost);

      const rightPost = new Mesh(postGeo, postMat);
      rightPost.position.set(ROAD_WIDTH / 2 + 1, 4, 0);
      group.add(rightPost);

      const beamGeo = new BoxGeometry(ROAD_WIDTH + 4, 0.4, 0.4);
      const beam = new Mesh(beamGeo, postMat);
      beam.position.set(0, 8, 0);
      group.add(beam);

      // Sign panel
      const signTexture = this.createFreewaySignTexture(signTexts[i % signTexts.length]);
      const signGeo = new PlaneGeometry(10, 3);
      const signMat = new MeshBasicMaterial({ map: signTexture, side: DoubleSide });
      const signMesh = new Mesh(signGeo, signMat);
      signMesh.position.set(0, 7, 0.3);
      group.add(signMesh);

      group.position.set(0, 0, WRAP_BEHIND - i * SIGN_SPACING);
      scene.add(group);
      this.frewaySigns.push(group);
    }
  }

  // ── Palm tree creation ─────────────────────────────────────────────

  private createPalmTreeClusters(scene: Scene): void {
    const count = Math.ceil(ROAD_LENGTH / TREE_CLUSTER_SPACING);
    for (let i = 0; i < count; i++) {
      const cluster = new Group();
      const treesInCluster = 2 + (i % 2); // alternating 2 and 3

      for (let t = 0; t < treesInCluster; t++) {
        const tree = this.createPalmTree();
        // Spread within cluster — offset each tree slightly
        const side = (i + t) % 2 === 0 ? 1 : -1;
        const xBase = side * (TREE_X_MIN + (t / treesInCluster) * (TREE_X_MAX - TREE_X_MIN));
        tree.position.set(xBase + (t - 1) * 1.5, 0, t * 2 - 1);
        cluster.add(tree);
      }

      cluster.position.set(0, 0, WRAP_BEHIND - i * TREE_CLUSTER_SPACING);
      scene.add(cluster);
      this.palmTreeClusters.push(cluster);
    }
  }

  private createPalmTree(): Group {
    const tree = new Group();

    // Trunk — slightly tapered cylinder
    const trunkGeo = new CylinderGeometry(0.15, 0.25, 6, 6);
    const trunkMat = new MeshStandardMaterial({ color: '#8B6914', roughness: 0.9 });
    const trunk = new Mesh(trunkGeo, trunkMat);
    trunk.position.set(0, 3, 0);
    tree.add(trunk);

    // Canopy — 3 cones at the top, slightly offset/rotated
    const canopyMat = new MeshStandardMaterial({ color: '#228B22', roughness: 0.8 });
    const coneOffsets = [
      { x: 0, y: 7, z: 0, rotZ: 0 },
      { x: 0.5, y: 6.6, z: 0.4, rotZ: 0.2 },
      { x: -0.4, y: 6.4, z: -0.3, rotZ: -0.15 },
    ];

    for (const off of coneOffsets) {
      const coneGeo = new ConeGeometry(1.5, 2, 6);
      const cone = new Mesh(coneGeo, canopyMat);
      cone.position.set(off.x, off.y, off.z);
      cone.rotation.set(0, 0, off.rotZ);
      tree.add(cone);
    }

    return tree;
  }

  // ── Overhead gantry creation ───────────────────────────────────────

  private createGantries(scene: Scene): void {
    const count = Math.ceil(ROAD_LENGTH / GANTRY_SPACING);
    for (let i = 0; i < count; i++) {
      const group = new Group();
      const postMat = new MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.5, metalness: 0.4 });

      // Two vertical posts
      const postGeo = new BoxGeometry(0.4, 6, 0.4);

      const leftPost = new Mesh(postGeo, postMat);
      leftPost.position.set(-ROAD_WIDTH / 2 - 1, 3, 0);
      group.add(leftPost);

      const rightPost = new Mesh(postGeo, postMat);
      rightPost.position.set(ROAD_WIDTH / 2 + 1, 3, 0);
      group.add(rightPost);

      // Horizontal beam
      const beamGeo = new BoxGeometry(ROAD_WIDTH + 4, 0.4, 0.4);
      const beam = new Mesh(beamGeo, postMat);
      beam.position.set(0, 6, 0);
      group.add(beam);

      group.position.set(0, 0, WRAP_BEHIND - i * GANTRY_SPACING);
      scene.add(group);
      this.gantries.push(group);
    }
  }

  // ── Texture generation ─────────────────────────────────────────────

  private generateBillboardTextures(): CanvasTexture[] {
    return BILLBOARD_SPECS.map((spec) => this.createBillboardTexture(spec));
  }

  private createBillboardTexture(spec: BillboardSpec): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = spec.bgColor;
    ctx.fillRect(0, 0, 512, 256);

    // Optional accent line at top
    if (spec.accentColor) {
      ctx.fillStyle = spec.accentColor;
      ctx.fillRect(0, 0, 512, 6);
    }

    // Main text
    ctx.fillStyle = spec.textColor;
    ctx.font = spec.fontStyle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (spec.subtitle) {
      // Two-line layout: main text higher, subtitle lower
      this.wrapText(ctx, spec.text, 256, 90, 440, spec.fontSize + 4);
      // Subtitle in smaller font
      ctx.font = `${Math.round(spec.fontSize * 0.55)}px sans-serif`;
      if (spec.accentColor) {
        ctx.fillStyle = spec.accentColor;
      }
      this.wrapText(ctx, spec.subtitle, 256, 170, 440, Math.round(spec.fontSize * 0.55) + 4);
    } else {
      // Single centered text
      this.wrapText(ctx, spec.text, 256, 128, 440, spec.fontSize + 4);
    }

    // Dotted border for the "YOUR AD HERE" billboard
    if (spec.text === 'YOUR AD HERE') {
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(15, 15, 482, 226);
    }

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private createFreewaySignTexture(text: string): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;

    // Green highway sign background
    ctx.fillStyle = '#006633';
    ctx.fillRect(0, 0, 512, 160);

    // White border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 496, 144);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.wrapText(ctx, text, 256, 80, 460, 40);

    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /** Simple word-wrap for canvas 2D text. */
  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): void {
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    // Center the block vertically
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
  }
}
