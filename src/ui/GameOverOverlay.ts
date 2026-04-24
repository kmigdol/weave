const formatter = new Intl.NumberFormat('en-US');

export class GameOverOverlay {
  private el: HTMLDivElement | null = null;
  private muteBtn: HTMLButtonElement | null = null;
  private qualityBtn: HTMLButtonElement | null = null;

  private muteCb: (() => void) | null = null;
  private qualityCb: (() => void) | null = null;

  /** Show the overlay with run stats. Creates the DOM element if needed. */
  show(distanceMeters: number, durationSeconds: number, bestCombo: number = 0): void {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'game-over-overlay';
      document.body.appendChild(this.el);
    }

    const dist = formatter.format(Math.round(distanceMeters));
    const time = Math.round(durationSeconds);
    const combo = `\u00d7${bestCombo}`;

    Object.assign(this.el.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      background: 'rgba(0, 0, 0, 0.75)',
      zIndex: '1000',
      fontFamily: 'monospace',
      color: '#ffffff',
    } satisfies Partial<CSSStyleDeclaration>);

    this.el.innerHTML = [
      `<div style="font-size:48px;font-weight:bold;letter-spacing:4px">GAME OVER</div>`,
      `<div style="font-size:32px;font-weight:bold;color:#ffd700">${dist} m</div>`,
      `<div style="font-size:24px">best weave: ${combo}</div>`,
      `<div style="font-size:24px">time: ${time}s</div>`,
      `<div style="font-size:18px;color:rgba(255,255,255,0.6)">press space to retry</div>`,
    ].join('');

    // --- Bottom-right toggle buttons ---
    const btnContainer = document.createElement('div');
    Object.assign(btnContainer.style, {
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      alignItems: 'flex-start',
    } satisfies Partial<CSSStyleDeclaration>);

    this.qualityBtn = this.createToggleButton('HQ');
    this.qualityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.qualityCb?.();
    });
    btnContainer.appendChild(this.qualityBtn);

    this.muteBtn = this.createToggleButton('SOUND: ON');
    this.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.muteCb?.();
    });
    btnContainer.appendChild(this.muteBtn);

    this.el.appendChild(btnContainer);
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

  /** Hide the overlay. */
  hide(): void {
    if (this.el) {
      this.el.style.display = 'none';
    }
  }

  /** Remove the element entirely. */
  dispose(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
      this.muteBtn = null;
      this.qualityBtn = null;
    }
  }

  onMuteToggle(cb: () => void): void {
    this.muteCb = cb;
  }

  onQualityToggle(cb: () => void): void {
    this.qualityCb = cb;
  }

  setMuted(muted: boolean): void {
    if (this.muteBtn) {
      this.muteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    }
  }

  setLowQuality(low: boolean): void {
    if (this.qualityBtn) {
      this.qualityBtn.textContent = low ? 'LQ' : 'HQ';
    }
  }
}
