import { Game } from './game.js';

const canvas = document.getElementById('gameCanvas');
const game   = new Game(canvas);
const ctx    = canvas.getContext('2d');

let lastTime = null;
const MAX_DT = 1 / 20; // cap at 50ms to avoid spiral-of-death on tab-hide

function loop(timestamp) {
  if (lastTime === null) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, MAX_DT);
  lastTime = timestamp;

  game.update(dt);
  game.render(ctx);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
