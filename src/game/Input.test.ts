import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  let input: Input;

  beforeEach(() => {
    input = new Input(window);
    input.attach();
  });

  afterEach(() => {
    input.detach();
  });

  function keyDown(key: string) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }

  function touchAtX(x: number, y = 100) {
    // jsdom's Touch constructor is missing; fall back to synthetic event.
    const evt = new Event('touchstart', { bubbles: true }) as TouchEvent & {
      touches: ReadonlyArray<{ clientX: number; clientY: number }>;
    };
    Object.defineProperty(evt, 'touches', {
      value: [{ clientX: x, clientY: y }],
    });
    window.dispatchEvent(evt);
  }

  describe('keyboard', () => {
    it('emits "left" on ArrowLeft', () => {
      const spy = vi.fn();
      input.onLeft(spy);
      keyDown('ArrowLeft');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits "left" on "a" (lowercase)', () => {
      const spy = vi.fn();
      input.onLeft(spy);
      keyDown('a');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits "left" on "A" (uppercase)', () => {
      const spy = vi.fn();
      input.onLeft(spy);
      keyDown('A');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits "right" on ArrowRight', () => {
      const spy = vi.fn();
      input.onRight(spy);
      keyDown('ArrowRight');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits "right" on "d"', () => {
      const spy = vi.fn();
      input.onRight(spy);
      keyDown('d');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits "restart" on Space', () => {
      const spy = vi.fn();
      input.onRestart(spy);
      keyDown(' ');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('ignores unknown keys', () => {
      const leftSpy = vi.fn();
      const rightSpy = vi.fn();
      const restartSpy = vi.fn();
      input.onLeft(leftSpy);
      input.onRight(rightSpy);
      input.onRestart(restartSpy);
      keyDown('q');
      keyDown('Shift');
      expect(leftSpy).not.toHaveBeenCalled();
      expect(rightSpy).not.toHaveBeenCalled();
      expect(restartSpy).not.toHaveBeenCalled();
    });
  });

  describe('touch', () => {
    beforeEach(() => {
      // jsdom default window has innerWidth 1024
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    });

    it('emits "left" when touch starts in the left half of the screen', () => {
      const spy = vi.fn();
      input.onLeft(spy);
      touchAtX(100); // left half
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('emits "right" when touch starts in the right half of the screen', () => {
      const spy = vi.fn();
      input.onRight(spy);
      touchAtX(900); // right half
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('detach', () => {
    it('stops emitting events after detach', () => {
      const spy = vi.fn();
      input.onLeft(spy);
      input.detach();
      keyDown('ArrowLeft');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
