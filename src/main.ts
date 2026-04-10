import './style.css';
import { inject } from '@vercel/analytics';
import { Game } from './game/Game';

inject();

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected <canvas id="game"> in index.html');
}

const game = new Game(canvas);
game.start();

// Expose for debugging / hot reload cleanup in dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.stop());
}
