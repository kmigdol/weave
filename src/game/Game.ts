import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { Renderer } from '../render/Renderer';
import { Player } from './Player';
import { Input } from './Input';
import { World } from './World';
import { FixedTimestepLoop } from '../lib/Loop';

const TICK_SECONDS = 1 / 60;
/** Placeholder forward speed for WEA-1 (meters/sec). WEA-2 adds the real speed curve. */
const PLACEHOLDER_SPEED = 40;

/**
 * Top-level game orchestrator. Owns the renderer, world, player, input,
 * and fixed-timestep loop. WEA-1 runs the simplest possible state:
 * "driving" forever, no crashes, no scoring, no on-ramp intro.
 */
export class Game {
  private readonly loop = new FixedTimestepLoop(TICK_SECONDS);
  private readonly renderer: Renderer;
  private readonly world: World;
  private readonly player = new Player();
  private readonly input: Input;
  private readonly playerMesh: Mesh;
  private rafHandle = 0;
  private lastFrameTimeMs = 0;
  private totalSeconds = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.world = new World(this.renderer.scene);

    // Placeholder player car — just a red box at z=0. Real Kenney model in WEA-3.
    this.playerMesh = new Mesh(
      new BoxGeometry(1.6, 1.2, 3.8),
      new MeshStandardMaterial({
        color: '#ff3a2a',
        emissive: '#ff1a08',
        emissiveIntensity: 0.25,
        roughness: 0.4,
      }),
    );
    this.playerMesh.position.set(this.player.x, 0.6, 0);
    this.renderer.scene.add(this.playerMesh);

    this.input = new Input(window);
    this.input.onLeft(() => this.player.changeLane(-1));
    this.input.onRight(() => this.player.changeLane(+1));
    this.input.onRestart(() => {
      // WEA-2 will handle restart properly; WEA-1 just re-centers the car.
      this.player.targetLane = 2;
    });
  }

  start(): void {
    this.input.attach();
    this.lastFrameTimeMs = performance.now();
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafHandle);
    this.input.detach();
    this.renderer.dispose();
  }

  private readonly frame = (nowMs: number): void => {
    this.rafHandle = requestAnimationFrame(this.frame);
    const dtSeconds = Math.min((nowMs - this.lastFrameTimeMs) / 1000, 0.1);
    this.lastFrameTimeMs = nowMs;

    const ticks = this.loop.step(dtSeconds);
    for (let i = 0; i < ticks; i++) {
      this.tick(TICK_SECONDS);
    }

    this.totalSeconds += dtSeconds;
    this.playerMesh.position.x = this.player.x;
    this.renderer.render(this.player.x, this.totalSeconds, this.loop.alpha());
  };

  private tick(dtSeconds: number): void {
    this.player.update(dtSeconds);
    this.world.update(PLACEHOLDER_SPEED * dtSeconds);
    this.renderer.tick(this.player.x, dtSeconds);
  }
}
