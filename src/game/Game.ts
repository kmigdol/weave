import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { Renderer } from '../render/Renderer';
import { Player, laneToX, NUM_LANES } from './Player';
import { Input } from './Input';
import { World } from './World';
import { FixedTimestepLoop } from '../lib/Loop';
import { TrafficManager } from './Traffic';
import { checkCollisions } from './Collisions';
import { getSpeed } from './SpeedCurve';
import { startRun, tickRun, crashRun, type GameState, type RunningState } from './GameState';
import { initScoring, tickScoring, getSpeedMultiplier, resetScoring, type ScoringState } from './Scoring';
import { GameOverOverlay } from '../ui/GameOverOverlay';
import { HUD } from '../ui/HUD';
import { BOOST_DURATION, SLIPSTREAM_CHARGE_TIME, NEAR_MISS_BURST_DURATION } from './constants';

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
  private readonly overlay = new GameOverOverlay();
  private readonly hud = new HUD();
  private readonly playerMesh: Mesh;
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

    // Placeholder player car — just a red box at z=0. Real Kenney model in WEA-4.
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
    this.input.onLeft(() => {
      if (this.state.phase === 'running') this.player.changeLane(-1);
    });
    this.input.onRight(() => {
      if (this.state.phase === 'running') this.player.changeLane(+1);
    });
    this.input.onRestart(() => {
      if (this.state.phase === 'gameOver') this.restart();
    });

    this.state = startRun();
    this.scoring = initScoring();
  }

  start(): void {
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

  private restart(): void {
    // Reset player to center lane (including interpolated x position)
    this.player.targetLane = Math.floor(NUM_LANES / 2);
    this.player.x = laneToX(this.player.targetLane);

    // Clear all traffic
    this.traffic.reset();
    this.traffic.clearDespawnedIds();

    // Fresh game + scoring state
    this.state = startRun();
    this.scoring = resetScoring();
    this.currentSpeed = 0;

    // Hide overlay, show HUD
    this.overlay.hide();
    this.hud.show();
  }

  private readonly frame = (nowMs: number): void => {
    this.rafHandle = requestAnimationFrame(this.frame);
    const dtSeconds = Math.min((nowMs - this.lastFrameTimeMs) / 1000, 0.1);
    this.lastFrameTimeMs = nowMs;

    this.totalSeconds += dtSeconds;

    if (this.state.phase === 'running') {
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

    this.playerMesh.position.x = this.player.x;
    this.renderer.render(this.player.x, this.totalSeconds, this.loop.alpha());
  };

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
