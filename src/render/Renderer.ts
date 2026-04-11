import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  DirectionalLight,
  Vector2,
  HemisphereLight,
  FogExp2,
  SphereGeometry,
  ShaderMaterial,
  Mesh,
  BackSide,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  AdditiveBlending,
  PlaneGeometry,
  MeshBasicMaterial,
  DoubleSide,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { makeCRTPass } from './CRTPass';
import {
  BOOST_FOV_INCREASE,
  SHAKE_NEAR_MISS_AMPLITUDE,
  SHAKE_NEAR_MISS_DURATION,
  SHAKE_CRASH_AMPLITUDE,
  SHAKE_CRASH_DURATION,
} from '../game/constants';

const CAMERA_HEIGHT = 3.2;
const CAMERA_BEHIND = 7;
const CAMERA_LOOK_AHEAD = 8;
/** How fast the camera's lateral position follows the player's lane changes. */
const CAMERA_FOLLOW_RATE = 6;
/** Base FOV in degrees. */
const BASE_FOV = 75;
/** Exponential smoothing rate for FOV transitions (per second). */
const FOV_LERP_RATE = 4;

/**
 * Owns the three.js scene, camera, renderer, and post-process stack. The
 * chase camera tracks the player's interpolated x and stays at a fixed
 * height/offset for WEA-1. WEA-2 will add shake + FOV punch for BOOST.
 */
export class Renderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly crtUniforms: { uTime: { value: number }; uResolution: { value: Vector2 } };
  private cameraX = 0;
  private readonly skylineMesh: Mesh;

  // ── Shake state ──────────────────────────────────────────────────
  private shakeTimer = 0;
  private shakeDuration = 0;
  private shakeAmplitude = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  // ── FOV widen state ──────────────────────────────────────────────
  private boostActive = false;
  private currentFov = BASE_FOV;

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = null; // sky sphere provides the background
    this.scene.fog = null;

    // ── Sky sphere (dusk gradient) ─────────────────────────────────
    this.scene.add(this.createSkySphere());

    // ── Sun billboard ──────────────────────────────────────────────
    this.scene.add(this.createSunSprite());

    // ── SF skyline silhouette ──────────────────────────────────────
    this.skylineMesh = this.createSkylineMesh();
    this.scene.add(this.skylineMesh);

    // ── Dusk lighting ──────────────────────────────────────────────
    // Warm key light (sun) — low angle for dusk
    const sunLight = new DirectionalLight('#ffb07a', 1.2);
    sunLight.position.set(-20, 15, -40);
    this.scene.add(sunLight);

    // Cool ambient fill — blue sky / dark ground
    const hemi = new HemisphereLight('#4466aa', '#1a0a28', 0.5);
    this.scene.add(hemi);

    // Rim light for car readability — behind-right
    const rimLight = new DirectionalLight('#88aaff', 0.4);
    rimLight.position.set(15, 10, 30);
    this.scene.add(rimLight);

    // Exponential fog for atmospheric depth
    this.scene.fog = new FogExp2('#1a0a28', 0.004);

    this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_BEHIND);
    this.camera.lookAt(0, 1, -CAMERA_LOOK_AHEAD);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    const resolution = new Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const crtPass = makeCRTPass(resolution);
    this.composer.addPass(crtPass);
    this.crtUniforms = crtPass.uniforms as typeof this.crtUniforms;

    // Now that the composer + uniforms exist, run the full resize
    // handler once to sync everything and register it for future events.
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  // ── Sky / environment helpers ────────────────────────────────────

  private createSkySphere(): Mesh {
    const geo = new SphereGeometry(900, 32, 32);
    const mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          // Normalize y to -1..1 based on the unit sphere position.
          vY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vY;
        void main() {
          // Three-stop dusk gradient: orange → magenta → navy
          vec3 orange  = vec3(1.0, 0.418, 0.208);   // #ff6b35
          vec3 magenta = vec3(0.761, 0.094, 0.357);  // #c2185b
          vec3 navy    = vec3(0.039, 0.086, 0.157);  // #0a1628

          float t1 = smoothstep(-1.0, 0.0, vY);   // orange → magenta
          float t2 = smoothstep(0.0, 0.4, vY);     // magenta → navy

          vec3 color = mix(orange, magenta, t1);
          color = mix(color, navy, t2);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    return new Mesh(geo, mat);
  }

  private createSunSprite(): Sprite {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    grad.addColorStop(0, 'rgba(255, 228, 160, 1)');   // #ffe4a0
    grad.addColorStop(0.4, 'rgba(255, 180, 80, 0.6)');
    grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new CanvasTexture(canvas);
    const mat = new SpriteMaterial({
      map: tex,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const sprite = new Sprite(mat);
    sprite.position.set(-100, 20, -800);
    sprite.scale.set(70, 70, 1);
    return sprite;
  }

  private createSkylineMesh(): Mesh {
    const cw = 2048;
    const ch = 256;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    // Fill transparent
    ctx.clearRect(0, 0, cw, ch);

    const FILL = '#0a0f1e';

    // ── Rolling hills baseline ─────────────────────────────────────
    ctx.fillStyle = FILL;
    ctx.beginPath();
    ctx.moveTo(0, ch);
    for (let x = 0; x <= cw; x++) {
      const y = ch - 30 + Math.sin(x * 0.003) * 12 + Math.sin(x * 0.008) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(cw, ch);
    ctx.closePath();
    ctx.fill();

    // Helper: filled rect (building)
    const building = (x: number, w: number, h: number) => {
      ctx.fillRect(x, ch - 30 - h, w, h + 30);
    };

    ctx.fillStyle = FILL;

    // ── Generic downtown cluster (left) ────────────────────────────
    building(200, 30, 50);
    building(235, 25, 65);
    building(265, 35, 45);
    building(305, 20, 70);
    building(330, 28, 55);

    // ── Transamerica Pyramid (x ≈ 400) ─────────────────────────────
    ctx.beginPath();
    ctx.moveTo(385, ch - 30);
    ctx.lineTo(400, ch - 30 - 130);  // pointed top
    ctx.lineTo(415, ch - 30);
    ctx.closePath();
    ctx.fill();

    // ── Generic buildings around Transamerica ──────────────────────
    building(420, 30, 60);
    building(455, 25, 50);
    building(485, 30, 75);
    building(520, 22, 55);
    building(545, 30, 40);

    // ── Salesforce Tower (x ≈ 600, tallest) ────────────────────────
    // Rounded rectangle approximation
    ctx.beginPath();
    const stX = 590;
    const stW = 35;
    const stH = 150;
    const stTop = ch - 30 - stH;
    const stR = 10; // corner radius
    ctx.moveTo(stX, ch - 30);
    ctx.lineTo(stX, stTop + stR);
    ctx.quadraticCurveTo(stX, stTop, stX + stR, stTop);
    ctx.lineTo(stX + stW - stR, stTop);
    ctx.quadraticCurveTo(stX + stW, stTop, stX + stW, stTop + stR);
    ctx.lineTo(stX + stW, ch - 30);
    ctx.closePath();
    ctx.fill();

    // ── More downtown buildings ────────────────────────────────────
    building(635, 28, 60);
    building(668, 35, 80);
    building(710, 25, 55);
    building(740, 30, 70);
    building(775, 22, 45);
    building(800, 30, 65);
    building(835, 25, 50);
    building(865, 30, 35);

    // ── Bay Bridge (x ≈ 900–1200) ──────────────────────────────────
    // Deck
    ctx.fillRect(900, ch - 30 - 20, 300, 6);
    // Left tower
    ctx.fillRect(940, ch - 30 - 50, 8, 50);
    // Right tower
    ctx.fillRect(1150, ch - 30 - 50, 8, 50);
    // Cables (triangle shapes from towers to deck)
    ctx.beginPath();
    ctx.moveTo(944, ch - 30 - 50);
    ctx.lineTo(1050, ch - 30 - 22);
    ctx.lineTo(944, ch - 30 - 22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(1154, ch - 30 - 50);
    ctx.lineTo(1050, ch - 30 - 22);
    ctx.lineTo(1154, ch - 30 - 22);
    ctx.closePath();
    ctx.fill();

    // ── Buildings between bridge and Sutro ──────────────────────────
    building(1250, 30, 40);
    building(1285, 25, 55);
    building(1320, 30, 35);
    building(1355, 22, 45);

    // ── Sutro Tower (x ≈ 1400) ─────────────────────────────────────
    // Three prongs
    const sutroBase = ch - 30 - 80;
    const sutroX = 1400;
    ctx.fillRect(sutroX + 12, sutroBase - 50, 4, 50); // center prong (tallest)
    ctx.fillRect(sutroX, sutroBase - 30, 4, 30);       // left prong
    ctx.fillRect(sutroX + 24, sutroBase - 30, 4, 30);  // right prong
    // Cross-bars
    ctx.fillRect(sutroX - 2, sutroBase - 20, 32, 3);
    ctx.fillRect(sutroX + 2, sutroBase - 40, 24, 3);
    // Base/tower body
    ctx.beginPath();
    ctx.moveTo(sutroX + 4, sutroBase);
    ctx.lineTo(sutroX + 10, ch - 30);
    ctx.lineTo(sutroX + 18, ch - 30);
    ctx.lineTo(sutroX + 24, sutroBase);
    ctx.closePath();
    ctx.fill();

    // ── Trailing hills (right side) ────────────────────────────────
    building(1460, 30, 30);
    building(1500, 40, 20);
    building(1560, 35, 25);

    // ── Haze gradient at base ──────────────────────────────────────
    const haze = ctx.createLinearGradient(0, ch, 0, ch - 40);
    haze.addColorStop(0, 'rgba(10, 15, 30, 0)');
    haze.addColorStop(1, 'rgba(10, 15, 30, 0)');
    // Clear the bottom strip to create fade-to-transparent at base
    ctx.globalCompositeOperation = 'destination-out';
    const fadeGrad = ctx.createLinearGradient(0, ch, 0, ch - 25);
    fadeGrad.addColorStop(0, 'rgba(0,0,0,1)');
    fadeGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, ch - 25, cw, 25);
    ctx.globalCompositeOperation = 'source-over';

    const tex = new CanvasTexture(canvas);
    const geo = new PlaneGeometry(1600, 100);
    const mat = new MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(0, 30, -700);
    return mesh;
  }

  /** Shift the skyline slightly for parallax. Call from Game.ts each frame. */
  updateSkyline(distanceDelta: number): void {
    this.skylineMesh.position.x -= distanceDelta * 0.001;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }

  // ── Camera effect triggers ───────────────────────────────────────

  /** Trigger a small camera shake on near-miss. */
  shakeNearMiss(): void {
    this.shakeAmplitude = SHAKE_NEAR_MISS_AMPLITUDE;
    this.shakeDuration = SHAKE_NEAR_MISS_DURATION;
    this.shakeTimer = SHAKE_NEAR_MISS_DURATION;
  }

  /** Trigger a heavy camera shake on crash. */
  shakeCrash(): void {
    this.shakeAmplitude = SHAKE_CRASH_AMPLITUDE;
    this.shakeDuration = SHAKE_CRASH_DURATION;
    this.shakeTimer = SHAKE_CRASH_DURATION;
  }

  /** Set whether BOOST is currently active (widens FOV). */
  setBoostActive(active: boolean): void {
    this.boostActive = active;
  }

  /** Called every simulation tick — smooths the camera toward the player. */
  tick(playerX: number, dtSeconds: number): void {
    const t = 1 - Math.exp(-CAMERA_FOLLOW_RATE * dtSeconds);
    this.cameraX += (playerX - this.cameraX) * t;

    // ── Shake decay ──────────────────────────────────────────────
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dtSeconds;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      } else {
        const decay = this.shakeTimer / this.shakeDuration;
        this.shakeOffsetX = this.shakeAmplitude * decay * (Math.random() * 2 - 1);
        this.shakeOffsetY = this.shakeAmplitude * decay * (Math.random() * 2 - 1);
      }
    }

    // ── FOV lerp ─────────────────────────────────────────────────
    const targetFov = this.boostActive ? BASE_FOV + BOOST_FOV_INCREASE : BASE_FOV;
    const fovT = 1 - Math.exp(-FOV_LERP_RATE * dtSeconds);
    this.currentFov += (targetFov - this.currentFov) * fovT;
  }

  /**
   * Render a frame. `timeSeconds` feeds the CRT shader so scanlines can
   * optionally animate later. `alpha` is the tick interpolation factor
   * (unused in WEA-1 but wired through for WEA-2).
   */
  render(_playerX: number, timeSeconds: number, _alpha: number): void {
    // Snap x to smoothed value; render-time interpolation between last
    // two ticks will happen in WEA-2 once we track prev/current transform.
    this.camera.position.x = this.cameraX + this.shakeOffsetX;
    this.camera.position.y = CAMERA_HEIGHT + this.shakeOffsetY;
    this.camera.lookAt(this.cameraX, 1, -CAMERA_LOOK_AHEAD);

    // Update FOV only when it has meaningfully changed to avoid
    // unnecessary projection matrix recalculations.
    if (Math.abs(this.camera.fov - this.currentFov) > 0.01) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    this.crtUniforms.uTime.value = timeSeconds;
    this.composer.render();
  }

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.crtUniforms.uResolution.value.set(w, h);
  };
}
