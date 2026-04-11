import {
  BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Box3,
} from 'three';
import { Renderer } from '../render/Renderer';
import { Player, laneToX, NUM_LANES } from './Player';
import { Input } from './Input';
import { World } from './World';
import { FixedTimestepLoop } from '../lib/Loop';
import { TrafficManager } from './Traffic';
import { checkCollisions } from './Collisions';
import { getSpeed } from './SpeedCurve';
import {
  tickRun, crashRun, startOnRamp, tickOnRamp,
  type GameState, type RunningState, type OnRampState,
} from './GameState';
import { initScoring, tickScoring, getSpeedMultiplier, resetScoring, type ScoringState } from './Scoring';
import { GameOverOverlay } from '../ui/GameOverOverlay';
import { HUD } from '../ui/HUD';
import { BOOST_DURATION, SLIPSTREAM_CHARGE_TIME, NEAR_MISS_BURST_DURATION, ON_RAMP_DURATION } from './constants';
import { loadAssets, cloneCar, type AssetManifest } from '../render/Assets';
import { Environment } from './Environment';

const TICK_SECONDS = 1 / 60;

/**
 * Top-level game orchestrator. Owns the renderer, world, player, input,
 * traffic, collisions, scoring, HUD, and fixed-timestep loop.
 */
export class Game {
  private readonly loop = new FixedTimestepLoop(TICK_SECONDS);
  private readonly renderer: Renderer;
  private readonly world: World;
  private readonly player = new Player();
  private readonly input: Input;
  private readonly traffic: TrafficManager;
  private readonly environment: Environment;
  private readonly overlay = new GameOverOverlay();
  private readonly hud = new HUD();
  private playerMesh!: Object3D;
  private assets: AssetManifest | null = null;
  private playerMeshY = 0.6; // y offset so car bottom sits on road
  private rafHandle = 0;
  private lastFrameTimeMs = 0;
  private totalSeconds = 0;
  private state: GameState;
  private scoring: ScoringState;
  private currentSpeed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.world = new World(this.renderer.scene);
    this.traffic = new TrafficManager(this.renderer.scene);
    this.environment = new Environment(this.renderer.scene);

    // Player mesh is set up in start() after assets load; create fallback now
    this.setupPlayerMesh();

    this.input = new Input(window);
    this.input.onLeft(() => {
      if (this.state.phase === 'running') this.player.changeLane(-1);
    });
    this.input.onRight(() => {
      if (this.state.phase === 'running') this.player.changeLane(+1);
    });
    this.input.onRestart(() => {
      if (this.state.phase === 'gameOver') this.restart();
    });

    this.state = startOnRamp();
    this.scoring = initScoring();

    // Position player off-screen for on-ramp intro
    this.playerMesh.position.set(laneToX(NUM_LANES - 1) + 6, this.playerMeshY, 15);
  }

  async start(): Promise<void> {
    // Load GLB assets — fall back to boxes on failure
    try {
      this.assets = await loadAssets();
    } catch (e) {
      console.warn('Asset loading failed, using fallback boxes', e);
    }

    // Replace the fallback box with the GLB sedan if available
    if (this.assets) {
      this.renderer.scene.remove(this.playerMesh);
      this.setupPlayerMesh();
      this.traffic.setAssets(this.assets);

      // Re-apply on-ramp starting position (setupPlayerMesh defaults to player.x, meshY, 0)
      if (this.state.phase === 'onRamp') {
        this.playerMesh.position.set(laneToX(NUM_LANES - 1) + 6, this.playerMeshY, 15);
      }
    }

    this.input.attach();
    this.hud.show();
    this.lastFrameTimeMs = performance.now();
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafHandle);
    this.input.detach();
    this.hud.dispose();
    this.overlay.dispose();
    this.renderer.dispose();
  }

  /**
   * Create (or re-create) the player mesh.
   * Uses the Kenney sedan GLB if assets are loaded, otherwise falls back
   * to a red box.
   */
  private setupPlayerMesh(): void {
    let meshY = 0.6; // default for fallback box

    if (this.assets?.sedan) {
      const group = cloneCar(this.assets.sedan);

      // Apply emissive red tail-light glow to all child meshes
      group.traverse((child) => {
        if ((child as Mesh).isMesh) {
          const mat = (child as Mesh).material;
          if (mat && 'emissive' in mat) {
            const stdMat = mat as MeshStandardMaterial;
            stdMat.emissive.set('#ff1a08');
            stdMat.emissiveIntensity = 0.5;
          }
        }
      });

      // Compute bounding box so the bottom of the car sits on the road
      const box = new Box3().setFromObject(group);
      meshY = -box.min.y;

      this.playerMesh = group;
    } else {
      // Fallback box
      this.playerMesh = new Mesh(
        new BoxGeometry(1.6, 1.2, 3.8),
        new MeshStandardMaterial({
          color: '#ff3a2a',
          emissive: '#ff1a08',
          emissiveIntensity: 0.25,
          roughness: 0.4,
        }),
      );
      meshY = 0.6;
    }

    this.playerMeshY = meshY;
    this.playerMesh.position.set(this.player.x, meshY, 0);
    this.renderer.scene.add(this.playerMesh);
  }

  private restart(): void {
    // Reset player to center lane (including interpolated x position)
    this.player.targetLane = Math.floor(NUM_LANES / 2);
    this.player.x = laneToX(this.player.targetLane);

    // Clear all traffic
    this.traffic.reset();
    this.traffic.clearDespawnedIds();

    // Fresh game + scoring state
    this.state = startOnRamp();
    this.scoring = resetScoring();
    this.currentSpeed = 0;

    // Position player off-screen for on-ramp intro
    this.playerMesh.position.set(laneToX(NUM_LANES - 1) + 6, this.playerMeshY, 15);

    // Hide overlay, show HUD
    this.overlay.hide();
    this.hud.show();
  }

  private readonly frame = (nowMs: number): void => {
    this.rafHandle = requestAnimationFrame(this.frame);
    const dtSeconds = Math.min((nowMs - this.lastFrameTimeMs) / 1000, 0.1);
    this.lastFrameTimeMs = nowMs;

    this.totalSeconds += dtSeconds;

    if (this.state.phase === 'onRamp') {
      this.updateOnRamp(dtSeconds);
    } else if (this.state.phase === 'running') {
      const ticks = this.loop.step(dtSeconds);
      for (let i = 0; i < ticks; i++) {
        this.tick(TICK_SECONDS);
        // Check if we crashed during this tick
        if (this.state.phase !== 'running') break;
      }
    }

    // Update HUD every frame (not just on ticks)
    if (this.state.phase === 'running') {
      const running = this.state as RunningState;
      const slipstreamProgress = this.scoring.slipstreamTimer / SLIPSTREAM_CHARGE_TIME;
      this.hud.update(
        running.distanceMeters,
        this.scoring.combo,
        this.scoring.boostTimer,
        BOOST_DURATION,
        slipstreamProgress,
        this.currentSpeed,
        this.scoring.burstTimer,
        NEAR_MISS_BURST_DURATION,
      );
    }

    // During on-ramp, position is driven by the intro curve; otherwise follow player model
    if (this.state.phase !== 'onRamp') {
      this.playerMesh.position.x = this.player.x;
    }
    this.renderer.render(this.player.x, this.totalSeconds, this.loop.alpha());
  };

  private updateOnRamp(dtSeconds: number): void {
    const onRamp = this.state as OnRampState;
    const nextState = tickOnRamp(onRamp, dtSeconds);

    const t = Math.min(onRamp.elapsedSeconds / ON_RAMP_DURATION, 1);
    // Smoothstep ease-in-out for position interpolation
    const tSmooth = t * t * (3 - 2 * t);

    // Start position: off-screen right and behind camera
    const startX = laneToX(NUM_LANES - 1) + 6;
    const startZ = 15;
    // End position: rightmost lane, normal player z
    const endX = laneToX(NUM_LANES - 1);
    const endZ = 0;

    // Interpolate position
    this.playerMesh.position.x = startX + (endX - startX) * tSmooth;
    this.playerMesh.position.z = startZ + (endZ - startZ) * tSmooth;
    this.playerMesh.position.y = this.playerMeshY;

    // Ramp speed with ease-in (t*t) for world scrolling
    const easeIn = t * t;
    const speed = 27 * easeIn;
    this.currentSpeed = speed;
    this.world.update(speed * dtSeconds);
    this.environment.update(speed * dtSeconds);
    this.renderer.updateSkyline(speed * dtSeconds);

    // Camera follows as normal
    this.renderer.tick(this.playerMesh.position.x, dtSeconds);

    // Do NOT update traffic during onRamp
    // Do NOT process input during onRamp (already gated by phase check)

    // TODO: "101 N" sign at t~1.5s

    this.state = nextState;

    // Transition to running: show "GO!" flash, reset player to rightmost lane
    if (nextState.phase === 'running') {
      this.player.targetLane = NUM_LANES - 1;
      this.player.x = laneToX(NUM_LANES - 1);
      this.playerMesh.position.x = this.player.x;
      this.playerMesh.position.z = 0;
      this.flashGo();
    }
  }

  private flashGo(): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontSize: '96px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      color: '#ffffff',
      textShadow: '0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,200,50,0.6)',
      pointerEvents: 'none',
      zIndex: '1000',
      opacity: '1',
      transition: 'opacity 0.5s ease-out',
    } satisfies Partial<CSSStyleDeclaration>);
    el.textContent = 'GO!';
    document.body.appendChild(el);

    // Force reflow so the initial opacity takes effect before transitioning
    void el.offsetHeight;
    el.style.opacity = '0';

    // Remove after transition completes
    setTimeout(() => el.remove(), 500);
  }

  private tick(dtSeconds: number): void {
    if (this.state.phase !== 'running') return;

    const running = this.state as RunningState;
    const baseSpeed = getSpeed(running.elapsedSeconds);

    // Apply scoring speed multiplier
    const effectiveSpeed = baseSpeed * getSpeedMultiplier(this.scoring);
    this.currentSpeed = effectiveSpeed;

    // Update player, world, traffic
    this.player.update(dtSeconds);
    this.world.update(effectiveSpeed * dtSeconds);
    this.environment.update(effectiveSpeed * dtSeconds);
    this.renderer.updateSkyline(effectiveSpeed * dtSeconds);
    this.traffic.update(effectiveSpeed, dtSeconds);
    this.renderer.tick(this.player.x, dtSeconds);

    // Check collisions
    const result = checkCollisions(this.player.x, this.traffic.collidables);

    if (result.hits.length > 0) {
      // Crash!
      this.state = crashRun(running, this.scoring.bestCombo);
      this.renderer.shakeCrash();
      this.hud.hide();
      this.overlay.show(
        this.state.distanceMeters,
        this.state.durationSeconds,
        this.state.bestCombo,
      );
      return;
    }

    // Update scoring with collision results
    const despawnedIds = this.traffic.despawnedIds;
    const { state: newScoring, events } = tickScoring(
      this.scoring,
      dtSeconds,
      result.nearMisses,
      result.hits,
      result.slipstreams,
      despawnedIds,
    );
    this.traffic.clearDespawnedIds();
    this.scoring = newScoring;

    // React to scoring events
    if (events.nearMiss) {
      this.renderer.shakeNearMiss();
      this.hud.flashNearMiss(this.scoring.combo);
    }

    // Update renderer boost state for FOV widen
    this.renderer.setBoostActive(this.scoring.boostTimer > 0);

    // Advance game state with effective speed
    this.state = tickRun(running, dtSeconds, effectiveSpeed);
  }
}
