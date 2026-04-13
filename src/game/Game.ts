import {
  BoxGeometry, Mesh, MeshStandardMaterial, MeshBasicMaterial, Object3D, Box3,
  PlaneGeometry, CanvasTexture, DoubleSide, Group,
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
  titleState, tickRun, crashRun, startOnRamp, tickOnRamp,
  type GameState, type RunningState, type OnRampState,
} from './GameState';
import { initScoring, tickScoring, getSpeedMultiplier, resetScoring, type ScoringState } from './Scoring';
import { GameOverOverlay } from '../ui/GameOverOverlay';
import { HUD } from '../ui/HUD';
import { TitleScreen } from '../ui/TitleScreen';
import { AudioManager } from '../audio/AudioManager';
import { BOOST_DURATION, SLIPSTREAM_CHARGE_TIME, NEAR_MISS_BURST_DURATION, ON_RAMP_DURATION } from './constants';
import { loadAssets, cloneCar, type AssetManifest } from '../render/Assets';
import { Environment } from './Environment';

const TICK_SECONDS = 1 / 60;

/** Gentle speed for the title screen auto-scroll (m/s, ~30 mph). */
const TITLE_SCROLL_SPEED = 13;

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
  private readonly titleScreen = new TitleScreen();
  private readonly audio = new AudioManager();
  private playerMesh!: Object3D;
  private assets: AssetManifest | null = null;
  private playerMeshY = 0.6;
  private rafHandle = 0;
  private lastFrameTimeMs = 0;
  private totalSeconds = 0;
  private state: GameState;
  private scoring: ScoringState;
  private currentSpeed = 0;
  private prevBoostActive = false;
  private lowQuality = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.world = new World(this.renderer.scene);
    this.traffic = new TrafficManager(this.renderer.scene);
    this.environment = new Environment(this.renderer.scene);

    this.setupPlayerMesh();

    this.input = new Input(window);
    this.input.onLeft(() => {
      if (this.state.phase === 'running') {
        this.player.changeLane(-1);
        this.audio.triggerSFX('laneChange');
      }
    });
    this.input.onRight(() => {
      if (this.state.phase === 'running') {
        this.player.changeLane(+1);
        this.audio.triggerSFX('laneChange');
      }
    });
    this.input.onRestart(() => {
      if (this.state.phase === 'gameOver') this.restart();
    });

    // ── Title screen callbacks ────────────────────────────────────
    this.titleScreen.onStart(() => this.startFromTitle());
    this.titleScreen.onMuteToggle(() => this.toggleMute());
    this.titleScreen.onQualityToggle(() => this.toggleQuality());

    // ── Game over overlay callbacks ───────────────────────────────
    this.overlay.onMuteToggle(() => this.toggleMute());
    this.overlay.onQualityToggle(() => this.toggleQuality());

    // ── Read persisted quality state ──────────────────────────────
    try {
      this.lowQuality = localStorage.getItem('weave:lowQuality') === '1';
    } catch { /* private browsing */ }
    this.titleScreen.setLowQuality(this.lowQuality);
    this.titleScreen.setMuted(this.audio.isMuted());

    // ── Start in title phase ──────────────────────────────────────
    this.state = titleState();
    this.scoring = initScoring();
  }

  start(): void {
    this.input.attach();
    this.lastFrameTimeMs = performance.now();
    this.rafHandle = requestAnimationFrame(this.frame);

    // Load GLB assets in background — swap in when ready
    loadAssets()
      .then((assets) => {
        this.assets = assets;
        this.renderer.scene.remove(this.playerMesh);
        this.setupPlayerMesh();
        this.traffic.setAssets(assets);

        // Clear any fallback-box traffic spawned before assets loaded
        this.traffic.reset();
        this.traffic.clearDespawnedIds();

        if (this.state.phase === 'onRamp') {
          this.playerMesh.position.set(laneToX(NUM_LANES - 1) + 6, this.playerMeshY, 15);
        }
      })
      .catch((e) => {
        console.warn('Asset loading failed, using fallback boxes', e);
      });
  }

  stop(): void {
    cancelAnimationFrame(this.rafHandle);
    this.input.detach();
    this.hud.dispose();
    this.overlay.dispose();
    this.titleScreen.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }

  private setupPlayerMesh(): void {
    let meshY = 0.6;

    if (this.assets?.sedan) {
      const group = cloneCar(this.assets.sedan);
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
      const box = new Box3().setFromObject(group);
      meshY = -box.min.y;
      this.playerMesh = group;
    } else {
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

  private startFromTitle(): void {
    this.titleScreen.hide();
    void this.audio.unlock();

    this.traffic.reset();
    this.traffic.clearDespawnedIds();

    this.state = startOnRamp();
    this.scoring = initScoring();
    this.currentSpeed = 0;
    this.prevBoostActive = false;

    this.playerMesh.position.set(laneToX(NUM_LANES - 1) + 6, this.playerMeshY, 15);
    this.hud.show();
  }

  private restart(): void {
    this.player.targetLane = Math.floor(NUM_LANES / 2);
    this.player.x = laneToX(this.player.targetLane);

    this.traffic.reset();
    this.traffic.clearDespawnedIds();

    this.state = startOnRamp();
    this.scoring = resetScoring();
    this.currentSpeed = 0;
    this.prevBoostActive = false;

    this.audio.endBoost();
    this.audio.setSpeed(0);

    this.playerMesh.position.set(laneToX(NUM_LANES - 1) + 6, this.playerMeshY, 15);
    this.removeHighwaySign();

    this.overlay.hide();
    this.hud.show();
  }

  private toggleMute(): void {
    this.audio.triggerSFX('uiBlip');
    const muted = !this.audio.isMuted();
    this.audio.setMuted(muted);
    this.titleScreen.setMuted(muted);
    this.overlay.setMuted(muted);
  }

  private toggleQuality(): void {
    this.audio.triggerSFX('uiBlip');
    this.lowQuality = !this.lowQuality;
    this.renderer.setQuality(this.lowQuality);
    this.titleScreen.setLowQuality(this.lowQuality);
    this.overlay.setLowQuality(this.lowQuality);
    try {
      localStorage.setItem('weave:lowQuality', this.lowQuality ? '1' : '0');
    } catch { /* private browsing */ }
  }

  private readonly frame = (nowMs: number): void => {
    this.rafHandle = requestAnimationFrame(this.frame);
    const dtSeconds = Math.min((nowMs - this.lastFrameTimeMs) / 1000, 0.1);
    this.lastFrameTimeMs = nowMs;

    this.totalSeconds += dtSeconds;

    if (this.state.phase === 'title') {
      this.world.update(TITLE_SCROLL_SPEED * dtSeconds);
      this.traffic.update(TITLE_SCROLL_SPEED, dtSeconds);
      this.renderer.tick(0, dtSeconds);
    } else if (this.state.phase === 'onRamp') {
      this.updateOnRamp(dtSeconds);
    } else if (this.state.phase === 'running') {
      const ticks = this.loop.step(dtSeconds);
      for (let i = 0; i < ticks; i++) {
        this.tick(TICK_SECONDS);
        if (this.state.phase !== 'running') break;
      }
    }

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

    if (this.state.phase !== 'onRamp' && this.state.phase !== 'title') {
      this.playerMesh.position.x = this.player.x;
    }
    this.renderer.render(this.player.x, this.totalSeconds, this.loop.alpha());
  };

  private updateOnRamp(dtSeconds: number): void {
    const onRamp = this.state as OnRampState;
    const nextState = tickOnRamp(onRamp, dtSeconds);

    const newElapsed = Math.min(onRamp.elapsedSeconds + dtSeconds, ON_RAMP_DURATION);
    const t = newElapsed / ON_RAMP_DURATION;
    const tSmooth = t * t * (3 - 2 * t);

    const startX = laneToX(NUM_LANES - 1) + 6;
    const startZ = 15;
    const endX = laneToX(NUM_LANES - 1);
    const endZ = 0;

    this.playerMesh.position.x = startX + (endX - startX) * tSmooth;
    this.playerMesh.position.z = startZ + (endZ - startZ) * tSmooth;
    this.playerMesh.position.y = this.playerMeshY;

    const easeIn = t * t;
    const speed = 27 * easeIn;
    this.currentSpeed = speed;
    this.world.update(speed * dtSeconds);
    this.environment.update(speed * dtSeconds);
    this.renderer.updateSkyline(speed * dtSeconds);

    this.renderer.tick(this.playerMesh.position.x, dtSeconds);

    if (!this.highwaySign) {
      this.spawnHighwaySign();
    }

    if (this.highwaySign) {
      this.highwaySign.position.z += speed * dtSeconds;
    }

    this.state = nextState;

    if (nextState.phase === 'running') {
      this.player.targetLane = NUM_LANES - 1;
      this.player.x = laneToX(NUM_LANES - 1);
      this.playerMesh.position.x = this.player.x;
      this.playerMesh.position.z = 0;
      this.removeHighwaySign();
      this.flashGo();
    }
  }

  private highwaySign: Group | null = null;

  private spawnHighwaySign(): void {
    const group = new Group();

    const postMat = new MeshStandardMaterial({ color: '#555555', roughness: 0.7 });
    const postGeo = new BoxGeometry(0.15, 4, 0.15);
    const leftPost = new Mesh(postGeo, postMat);
    leftPost.position.set(-1.8, 2, 0);
    group.add(leftPost);
    const rightPost = new Mesh(postGeo, postMat);
    rightPost.position.set(1.8, 2, 0);
    group.add(rightPost);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#006633';
    ctx.fillRect(0, 0, 256, 192);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 180);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('101', 128, 65);

    ctx.font = 'bold 28px sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('NORTH', 128, 115);

    ctx.font = '18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('San Francisco', 128, 155);

    const tex = new CanvasTexture(canvas);
    const signPlane = new Mesh(
      new PlaneGeometry(4, 3),
      new MeshBasicMaterial({ map: tex, side: DoubleSide }),
    );
    signPlane.position.set(0, 5, 0);
    group.add(signPlane);

    group.position.set(laneToX(NUM_LANES - 1) + 8, 0, -15);

    this.renderer.scene.add(group);
    this.highwaySign = group;
  }

  private removeHighwaySign(): void {
    if (this.highwaySign) {
      this.renderer.scene.remove(this.highwaySign);
      this.highwaySign = null;
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

    void el.offsetHeight;
    el.style.opacity = '0';

    setTimeout(() => el.remove(), 500);
  }

  private tick(dtSeconds: number): void {
    if (this.state.phase !== 'running') return;

    const running = this.state as RunningState;
    const baseSpeed = getSpeed(running.elapsedSeconds);

    const effectiveSpeed = baseSpeed * getSpeedMultiplier(this.scoring);
    this.currentSpeed = effectiveSpeed;

    this.player.update(dtSeconds);
    this.world.update(effectiveSpeed * dtSeconds);
    this.environment.update(effectiveSpeed * dtSeconds);
    this.renderer.updateSkyline(effectiveSpeed * dtSeconds);
    this.traffic.update(effectiveSpeed, dtSeconds);
    this.renderer.tick(this.player.x, dtSeconds);

    const result = checkCollisions(this.player.x, this.traffic.collidables);

    if (result.hits.length > 0) {
      this.state = crashRun(running, this.scoring.bestCombo);
      this.renderer.shakeCrash();
      this.audio.triggerSFX('crash');
      this.hud.hide();
      this.overlay.show(
        this.state.distanceMeters,
        this.state.durationSeconds,
        this.state.bestCombo,
      );
      this.overlay.setMuted(this.audio.isMuted());
      this.overlay.setLowQuality(this.lowQuality);
      return;
    }

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

    if (events.nearMiss) {
      this.renderer.shakeNearMiss();
      this.hud.flashNearMiss(this.scoring.combo);
      this.audio.triggerSFX('nearMiss', this.scoring.combo);
    }

    const boostActive = this.scoring.boostTimer > 0;
    this.renderer.setBoostActive(boostActive);
    if (boostActive && !this.prevBoostActive) {
      this.audio.startBoost();
    } else if (!boostActive && this.prevBoostActive) {
      this.audio.endBoost();
    }
    this.prevBoostActive = boostActive;

    this.audio.setSpeed(effectiveSpeed);
    this.audio.setSlipstreamIntensity(this.scoring.slipstreamTimer / SLIPSTREAM_CHARGE_TIME);

    this.state = tickRun(running, dtSeconds, effectiveSpeed);
  }
}
