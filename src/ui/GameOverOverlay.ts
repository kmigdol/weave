const formatter = new Intl.NumberFormat('en-US');

export class GameOverOverlay {
  private el: HTMLDivElement | null = null;

  /** Show the overlay with run stats. Creates the DOM element if needed. */
  show(distanceMeters: number, durationSeconds: number): void {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'game-over-overlay';
      document.body.appendChild(this.el);
    }

    const dist = formatter.format(Math.round(distanceMeters));
    const time = Math.round(durationSeconds);

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
      `<div style="font-size:24px">distance: ${dist}m</div>`,
      `<div style="font-size:24px">time: ${time}s</div>`,
      `<div style="font-size:18px;color:rgba(255,255,255,0.6)">press space to retry</div>`,
    ].join('');
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
    }
  }
}
