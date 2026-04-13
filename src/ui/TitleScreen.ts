/**
 * Title screen DOM overlay shown on game load.
 * Semi-transparent dark background over the 3D scene.
 */
export class TitleScreen {
  private root: HTMLDivElement;
  private subtitleEl: HTMLDivElement;
  private muteBtn: HTMLButtonElement;
  private qualityBtn: HTMLButtonElement;
  private styleEl: HTMLStyleElement;

  private startCb: (() => void) | null = null;
  private muteCb: (() => void) | null = null;
  private qualityCb: (() => void) | null = null;

  private readonly handleKeyDown: (e: KeyboardEvent) => void;
  private readonly handleClick: (e: MouseEvent) => void;
  private readonly handleTouch: (e: TouchEvent) => void;

  constructor() {
    // --- Inject keyframe animation ---
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = `
      @keyframes weave-title-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(this.styleEl);

    // --- Root container ---
    this.root = document.createElement('div');
    this.root.id = 'title-screen-overlay';
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '24px',
      background: 'rgba(0, 0, 0, 0.6)',
      zIndex: '1000',
      fontFamily: 'monospace',
      color: '#ffffff',
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    // --- Title ---
    const titleEl = document.createElement('div');
    Object.assign(titleEl.style, {
      fontSize: '72px',
      fontWeight: 'bold',
      letterSpacing: '8px',
      textShadow: '0 0 20px rgba(0, 204, 255, 0.5)',
    } satisfies Partial<CSSStyleDeclaration>);
    titleEl.textContent = 'WEAVE';
    this.root.appendChild(titleEl);

    // --- Subtitle ---
    this.subtitleEl = document.createElement('div');
    const isTouchDevice = 'ontouchstart' in window;
    Object.assign(this.subtitleEl.style, {
      fontSize: '18px',
      color: 'rgba(255, 255, 255, 0.6)',
      letterSpacing: '3px',
      animation: 'weave-title-pulse 2s ease-in-out infinite',
    } satisfies Partial<CSSStyleDeclaration>);
    this.subtitleEl.textContent = isTouchDevice
      ? 'TAP TO START'
      : 'PRESS SPACE TO START';
    this.root.appendChild(this.subtitleEl);

    // --- Bottom-right button container ---
    const btnContainer = document.createElement('div');
    Object.assign(btnContainer.style, {
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'flex-end',
    } satisfies Partial<CSSStyleDeclaration>);

    // --- Quality toggle ---
    this.qualityBtn = this.createToggleButton('HQ');
    btnContainer.appendChild(this.qualityBtn);

    // --- Mute toggle ---
    this.muteBtn = this.createToggleButton('SOUND: ON');
    btnContainer.appendChild(this.muteBtn);

    this.root.appendChild(btnContainer);

    // --- Event handlers ---
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.startCb?.();
      }
    };

    this.handleClick = (e: MouseEvent) => {
      // Only trigger start if not clicking a button
      if ((e.target as HTMLElement).tagName !== 'BUTTON') {
        this.startCb?.();
      }
    };

    this.handleTouch = (e: TouchEvent) => {
      if ((e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault();
        this.startCb?.();
      }
    };

    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.muteCb?.();
    });

    this.qualityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.qualityCb?.();
    });

    // Attach listeners
    window.addEventListener('keydown', this.handleKeyDown);
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('touchstart', this.handleTouch);

    document.body.appendChild(this.root);
  }

  private createToggleButton(label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      background: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '4px',
      color: 'rgba(255, 255, 255, 0.7)',
      fontFamily: 'monospace',
      fontSize: '12px',
      padding: '6px 12px',
      cursor: 'pointer',
      letterSpacing: '1px',
      pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);
    btn.textContent = label;
    return btn;
  }

  show(): void {
    this.root.style.display = 'flex';
    window.addEventListener('keydown', this.handleKeyDown);
  }

  hide(): void {
    this.root.style.display = 'none';
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('touchstart', this.handleTouch);
    this.root.remove();
    this.styleEl.remove();
  }

  onStart(cb: () => void): void {
    this.startCb = cb;
  }

  onMuteToggle(cb: () => void): void {
    this.muteCb = cb;
  }

  onQualityToggle(cb: () => void): void {
    this.qualityCb = cb;
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  }

  setLowQuality(low: boolean): void {
    this.qualityBtn.textContent = low ? 'LQ' : 'HQ';
  }
}
