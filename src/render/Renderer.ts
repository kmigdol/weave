import {
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
  Vector2,
  HemisphereLight,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { makeCRTPass } from './CRTPass';

const CAMERA_HEIGHT = 3.2;
const CAMERA_BEHIND = 7;
const CAMERA_LOOK_AHEAD = 8;
/** How fast the camera's lateral position follows the player's lane changes. */
const CAMERA_FOLLOW_RATE = 6;

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

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new Color('#2a0f30'); // dusk placeholder — real skybox in WEA-3
    this.scene.fog = null;

    // Lighting: placeholder flat look; full dusk sun/ambient comes in WEA-3.
    this.scene.add(new AmbientLight('#7a5b80', 0.65));
    const hemi = new HemisphereLight('#ff8a5b', '#1a0a28', 0.6);
    this.scene.add(hemi);
    const key = new DirectionalLight('#ffb07a', 0.9);
    key.position.set(-20, 30, -40);
    this.scene.add(key);

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

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }

  /** Called every simulation tick — smooths the camera toward the player. */
  tick(playerX: number, dtSeconds: number): void {
    const t = 1 - Math.exp(-CAMERA_FOLLOW_RATE * dtSeconds);
    this.cameraX += (playerX - this.cameraX) * t;
  }

  /**
   * Render a frame. `timeSeconds` feeds the CRT shader so scanlines can
   * optionally animate later. `alpha` is the tick interpolation factor
   * (unused in WEA-1 but wired through for WEA-2).
   */
  render(playerX: number, timeSeconds: number, _alpha: number): void {
    // Snap x to smoothed value; render-time interpolation between last
    // two ticks will happen in WEA-2 once we track prev/current transform.
    this.camera.position.x = this.cameraX + (playerX - this.cameraX) * 0; // keep cameraX authoritative
    this.camera.lookAt(this.cameraX, 1, -CAMERA_LOOK_AHEAD);

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
