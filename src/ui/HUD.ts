const formatter = new Intl.NumberFormat('en-US');

const MS_TO_MPH = 2.237;

export class HUD {
  private root: HTMLDivElement;

  // Top-left: score + speed
  private scoreEl: HTMLDivElement;
  private speedEl: HTMLDivElement;

  // Top-center: combo counter
  private comboEl: HTMLDivElement;

  // Bottom-center: boost meter
  private boostOuter: HTMLDivElement;
  private boostInner: HTMLDivElement;
  private boostLabel: HTMLDivElement;

  // Near-miss floating text (recycled)
  private floatEl: HTMLDivElement;
  private floatTimer: ReturnType<typeof setTimeout> | null = null;

  // Screen edge flash overlay
  private flashEl: HTMLDivElement;

  // Cached values to skip redundant DOM writes
  private prevScore = '';
  private prevSpeed = '';
  private prevCombo = -1;
  private prevBoostWidth = '';
  private prevBarMode: 'idle' | 'slipstream' | 'burst' | 'boost' = 'idle';

  constructor() {
    // --- Root container ---
    this.root = document.createElement('div');
    this.root.id = 'hud-overlay';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '900',
      fontFamily: 'monospace',
      color: '#ffffff',
    } satisfies Partial<CSSStyleDeclaration>);

    // --- Top-left: score ---
    this.scoreEl = document.createElement('div');
    Object.assign(this.scoreEl.style, {
      position: 'absolute',
      top: '16px',
      left: '16px',
      fontSize: '24px',
      fontWeight: 'bold',
      textShadow: '0 0 6px rgba(0,0,0,0.8)',
      background: 'rgba(0,0,0,0.35)',
      padding: '4px 10px',
      borderRadius: '4px',
    } satisfies Partial<CSSStyleDeclaration>);
    this.scoreEl.textContent = '0 m';
    this.root.appendChild(this.scoreEl);

    // --- Top-left: speed (below score) ---
    this.speedEl = document.createElement('div');
    Object.assign(this.speedEl.style, {
      position: 'absolute',
      top: '50px',
      left: '16px',
      fontSize: '16px',
      textShadow: '0 0 6px rgba(0,0,0,0.8)',
      background: 'rgba(0,0,0,0.35)',
      padding: '2px 10px',
      borderRadius: '4px',
      color: 'rgba(255,255,255,0.7)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.speedEl.textContent = '0 mph';
    this.root.appendChild(this.speedEl);

    // --- Top-center: combo counter ---
    this.comboEl = document.createElement('div');
    Object.assign(this.comboEl.style, {
      position: 'absolute',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#ffaa00',
      textShadow: '0 0 10px rgba(255,170,0,0.6)',
      background: 'rgba(0,0,0,0.35)',
      padding: '4px 14px',
      borderRadius: '6px',
      display: 'none',
      transition: 'transform 0.2s ease-out',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.comboEl);

    // --- Bottom-center: boost meter ---
    this.boostOuter = document.createElement('div');
    Object.assign(this.boostOuter.style, {
      position: 'absolute',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '200px',
      height: '14px',
      border: '2px solid rgba(255,255,255,0.5)',
      borderRadius: '7px',
      overflow: 'hidden',
      background: 'rgba(0,0,0,0.4)',
    } satisfies Partial<CSSStyleDeclaration>);

    this.boostInner = document.createElement('div');
    Object.assign(this.boostInner.style, {
      width: '0%',
      height: '100%',
      background: '#00ccff',
      borderRadius: '5px',
      transition: 'width 0.1s linear',
    } satisfies Partial<CSSStyleDeclaration>);
    this.boostOuter.appendChild(this.boostInner);

    this.boostLabel = document.createElement('div');
    Object.assign(this.boostLabel.style, {
      position: 'absolute',
      bottom: '42px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '12px',
      color: 'rgba(255,255,255,0.6)',
      textTransform: 'uppercase',
      letterSpacing: '2px',
    } satisfies Partial<CSSStyleDeclaration>);
    this.boostLabel.textContent = 'boost';

    this.root.appendChild(this.boostLabel);
    this.root.appendChild(this.boostOuter);

    // --- Near-miss floating text (recycled element) ---
    this.floatEl = document.createElement('div');
    Object.assign(this.floatEl.style, {
      position: 'absolute',
      left: '50%',
      top: '40%',
      transform: 'translateX(-50%)',
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#ffcc00',
      textShadow: '0 0 12px rgba(255,204,0,0.8)',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.6s ease-out, top 0.6s ease-out',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.appendChild(this.floatEl);

    // --- Screen edge flash overlay ---
    this.flashEl = document.createElement('div');
    Object.assign(this.flashEl.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      boxShadow: 'inset 0 0 0px 0px rgba(255,200,50,0)',
      transition: 'box-shadow 0.3s ease-out',
      zIndex: '899',
    } satisfies Partial<CSSStyleDeclaration>);

    document.body.appendChild(this.flashEl);
    document.body.appendChild(this.root);
  }

  update(
    distance: number,
    combo: number,
    boostTimer: number,
    boostMaxDuration: number,
    slipstreamProgress: number,
    speedMs: number,
    burstTimer: number,
    burstMaxDuration: number,
  ): void {
    // Score
    const scoreText = `${formatter.format(Math.round(distance))} m`;
    if (scoreText !== this.prevScore) {
      this.scoreEl.textContent = scoreText;
      this.prevScore = scoreText;
    }

    // Speed
    const mph = Math.round(speedMs * MS_TO_MPH);
    const speedText = `${mph} mph`;
    if (speedText !== this.prevSpeed) {
      this.speedEl.textContent = speedText;
      this.prevSpeed = speedText;
    }

    // Combo counter
    if (combo !== this.prevCombo) {
      if (combo <= 0) {
        this.comboEl.style.display = 'none';
      } else {
        this.comboEl.style.display = 'block';
        this.comboEl.textContent = `\u00d7${combo}`;
      }
      this.prevCombo = combo;
    }

    // Boost meter — priority: BOOST > burst > slipstream charging > idle
    const isBoosting = boostTimer > 0 && boostMaxDuration > 0;
    const isBursting = burstTimer > 0 && burstMaxDuration > 0;

    let fillFraction: number;
    let barMode: 'idle' | 'slipstream' | 'burst' | 'boost';

    if (isBoosting) {
      fillFraction = boostTimer / boostMaxDuration;
      barMode = 'boost';
    } else if (isBursting) {
      fillFraction = burstTimer / burstMaxDuration;
      barMode = 'burst';
    } else if (slipstreamProgress > 0) {
      fillFraction = Math.min(1, slipstreamProgress);
      barMode = 'slipstream';
    } else {
      fillFraction = 0;
      barMode = 'idle';
    }

    const widthPct = `${Math.round(fillFraction * 100)}%`;
    if (widthPct !== this.prevBoostWidth) {
      this.boostInner.style.width = widthPct;
      this.prevBoostWidth = widthPct;
    }

    if (barMode !== this.prevBarMode) {
      switch (barMode) {
        case 'boost':
          this.boostInner.style.background = '#ff6600';
          this.boostInner.style.boxShadow = '0 0 12px #ff6600, 0 0 24px #ff6600';
          this.boostOuter.style.borderColor = '#ff8800';
          this.boostLabel.style.color = '#ff8800';
          this.boostLabel.textContent = 'BOOST!';
          break;
        case 'burst':
          this.boostInner.style.background = '#ffcc00';
          this.boostInner.style.boxShadow = '0 0 10px #ffcc00';
          this.boostOuter.style.borderColor = '#ffaa00';
          this.boostLabel.style.color = '#ffaa00';
          this.boostLabel.textContent = 'WEAVE!';
          break;
        case 'slipstream':
          this.boostInner.style.background = '#00ccff';
          this.boostInner.style.boxShadow = 'none';
          this.boostOuter.style.borderColor = 'rgba(255,255,255,0.5)';
          this.boostLabel.style.color = 'rgba(255,255,255,0.6)';
          this.boostLabel.textContent = 'boost';
          break;
        default:
          this.boostInner.style.background = '#00ccff';
          this.boostInner.style.boxShadow = 'none';
          this.boostOuter.style.borderColor = 'rgba(255,255,255,0.5)';
          this.boostLabel.style.color = 'rgba(255,255,255,0.6)';
          this.boostLabel.textContent = 'boost';
          break;
      }
      this.prevBarMode = barMode;
    }
  }

  flashNearMiss(combo: number): void {
    // 1. Floating text
    if (this.floatTimer !== null) {
      clearTimeout(this.floatTimer);
    }
    this.floatEl.textContent = combo <= 1 ? '+NEAR MISS' : `+WEAVE \u00d7${combo}`;
    // Reset position for re-trigger
    this.floatEl.style.transition = 'none';
    this.floatEl.style.top = '40%';
    this.floatEl.style.opacity = '1';
    // Force reflow so the reset takes effect before re-enabling transition
    void this.floatEl.offsetHeight;
    this.floatEl.style.transition = 'opacity 0.6s ease-out, top 0.6s ease-out';
    this.floatEl.style.top = '32%';
    this.floatEl.style.opacity = '0';
    this.floatTimer = setTimeout(() => {
      this.floatTimer = null;
    }, 600);

    // 2. Screen edge flash
    this.flashEl.style.transition = 'none';
    this.flashEl.style.boxShadow = 'inset 0 0 80px 30px rgba(255,200,50,0.35)';
    void this.flashEl.offsetHeight;
    this.flashEl.style.transition = 'box-shadow 0.3s ease-out';
    this.flashEl.style.boxShadow = 'inset 0 0 0px 0px rgba(255,200,50,0)';

    // 3. Combo counter punch
    this.comboEl.style.transition = 'none';
    this.comboEl.style.transform = 'translateX(-50%) scale(1.4)';
    void this.comboEl.offsetHeight;
    this.comboEl.style.transition = 'transform 0.2s ease-out';
    this.comboEl.style.transform = 'translateX(-50%) scale(1)';
  }

  show(): void {
    this.root.style.display = 'block';
    this.flashEl.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.flashEl.style.display = 'none';
  }

  dispose(): void {
    if (this.floatTimer !== null) {
      clearTimeout(this.floatTimer);
      this.floatTimer = null;
    }
    this.root.remove();
    this.flashEl.remove();
  }
}
