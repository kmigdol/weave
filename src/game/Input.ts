type IntentHandler = () => void;

/**
 * Thin keyboard + touch abstraction that turns raw DOM events into semantic
 * game intents (left, right, restart). Tests drive it directly via
 * dispatchEvent on the provided target; the production game passes `window`.
 */
export class Input {
  private leftHandlers: IntentHandler[] = [];
  private rightHandlers: IntentHandler[] = [];
  private restartHandlers: IntentHandler[] = [];
  private attached = false;

  constructor(private readonly target: Window) {}

  attach(): void {
    if (this.attached) return;
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('touchstart', this.onTouchStart);
    this.attached = false;
  }

  onLeft(handler: IntentHandler): void {
    this.leftHandlers.push(handler);
  }

  onRight(handler: IntentHandler): void {
    this.rightHandlers.push(handler);
  }

  onRestart(handler: IntentHandler): void {
    this.restartHandlers.push(handler);
  }

  private emit(list: IntentHandler[]): void {
    for (const h of list) h();
  }

  private readonly onKeyDown = (e: Event): void => {
    const key = (e as KeyboardEvent).key;
    switch (key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.emit(this.leftHandlers);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.emit(this.rightHandlers);
        break;
      case ' ':
      case 'Enter':
        this.emit(this.restartHandlers);
        break;
    }
  };

  private readonly onTouchStart = (e: Event): void => {
    const touch = (e as TouchEvent).touches[0];
    if (!touch) return;
    const half = this.target.innerWidth / 2;
    if (touch.clientX < half) {
      this.emit(this.leftHandlers);
    } else {
      this.emit(this.rightHandlers);
    }
  };
}
