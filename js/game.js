import { Player } from './player.js';
import { Formation } from './formation.js';
import { Stars } from './stars.js';
import { Audio } from './audio.js';
import { Input } from './input.js';

const CANVAS_W = 448;
const CANVAS_H = 512;

// Game states
const STATE = {
  TITLE:      'title',
  PLAYING:    'playing',
  STAGE_CLEAR:'stage_clear',
  DEAD:       'dead',
  GAME_OVER:  'game_over',
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.audio  = new Audio();
    this.input  = new Input();
    this.stars  = new Stars(CANVAS_W, CANVAS_H);

    this.state  = STATE.TITLE;
    this.stage  = 1;
    this.highScore = parseInt(localStorage.getItem('gal_hi') || '0', 10);

    this.player    = null;
    this.formation = null;

    // Stage-clear / death timers
    this._stateTimer = 0;
    this._muted = false;

    // Bonus stage tracking
    this._bonusKills = 0;
    this._bonusTotal = 0;

    // Death sequence
    this._deathTimer = 0;
    this._respawnReady = false;
  }

  // ── Main loop entry points ──────────────────────────────────────────────

  update(dt) {
    this.input.poll();
    this.stars.update(dt);

    switch (this.state) {
      case STATE.TITLE:       this._updateTitle(dt); break;
      case STATE.PLAYING:     this._updatePlaying(dt); break;
      case STATE.STAGE_CLEAR: this._updateStageClear(dt); break;
      case STATE.DEAD:        this._updateDead(dt); break;
      case STATE.GAME_OVER:   this._updateGameOver(dt); break;
    }
  }

  render(ctx) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.stars.draw(ctx);

    switch (this.state) {
      case STATE.TITLE:       this._renderTitle(ctx); break;
      case STATE.PLAYING:     this._renderPlaying(ctx); break;
      case STATE.STAGE_CLEAR: this._renderPlaying(ctx); this._renderStageClear(ctx); break;
      case STATE.DEAD:        this._renderPlaying(ctx); break;
      case STATE.GAME_OVER:   this._renderPlaying(ctx); this._renderGameOver(ctx); break;
    }
  }

  // ── State: TITLE ──────────────────────────────────────────────────────

  _updateTitle(dt) {
    if (this.input.wasJustPressed('Space') || this.input.wasJustPressed('Enter')) {
      this._startGame();
    }
    // Toggle mute
    if (this.input.wasJustPressed('KeyM')) {
      this._muted = this.audio.toggleMute();
    }
  }

  _renderTitle(ctx) {
    ctx.save();
    // Title
    ctx.fillStyle = '#ff0';
    ctx.font = '32px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GALAGA', CANVAS_W / 2, 160);

    // Subtitle
    ctx.fillStyle = '#0cf';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('© 1981 NAMCO', CANVAS_W / 2, 186);

    // Blink press space
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '9px "Press Start 2P", monospace';
      ctx.fillText('PRESS SPACE TO START', CANVAS_W / 2, 260);
    }

    // High score
    ctx.fillStyle = '#f80';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('HI-SCORE  ' + this.highScore, CANVAS_W / 2, 300);

    // Controls hint
    ctx.fillStyle = '#888';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('MOVE: ◀ ▶   FIRE: SPACE', CANVAS_W / 2, 360);
    ctx.fillText('PAUSE: P   MUTE: M', CANVAS_W / 2, 376);

    ctx.restore();
  }

  // ── State: PLAYING ────────────────────────────────────────────────────

  _startGame() {
    this.stage = 1;
    this.player = new Player(this.audio);
    this._startStage();
    this.state = STATE.PLAYING;
  }

  _startStage() {
    this.isBonus = this.stage % 3 === 0;
    this.formation = new Formation(this.audio, this.stage);
    this._bonusKills = 0;
    this._bonusTotal = this.formation.livingCount();
  }

  _updatePlaying(dt) {
    // Pause toggle
    if (this.input.wasJustPressed('KeyP')) {
      this._paused = !this._paused;
    }
    if (this.input.wasJustPressed('KeyM')) {
      this._muted = this.audio.toggleMute();
    }
    if (this._paused) return;

    this.player.update(dt, this.input);
    this.formation.update(dt, this.player, this.stage);

    // Player died (dead=true set by hit(), lives already decremented)
    if (this.player.dead) {
      this._enterDead();
      return;
    }

    // Stage cleared
    if (this.formation.allDead()) {
      this._enterStageClear();
    }
  }

  _renderPlaying(ctx) {
    if (!this.formation || !this.player) return;
    this.formation.draw(ctx);
    this.player.draw(ctx);
    this._renderHUD(ctx);
    if (this.isBonus) this._renderBonusBanner(ctx);
  }

  _renderBonusBanner(ctx) {
    ctx.save();
    ctx.fillStyle = '#ff0';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CHALLENGING STAGE', CANVAS_W / 2, 46);
    ctx.restore();
  }

  _renderHUD(ctx) {
    ctx.save();
    ctx.font = '8px "Press Start 2P", monospace';

    // Score top-left
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('1UP', 8, 14);
    ctx.fillStyle = '#ff0';
    ctx.fillText(String(this.player.score).padStart(6, '0'), 8, 26);

    // Hi-score top-center
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('HI-SCORE', CANVAS_W / 2, 14);
    ctx.fillStyle = '#ff0';
    ctx.fillText(String(this.highScore).padStart(6, '0'), CANVAS_W / 2, 26);

    // Stage number top-right
    ctx.fillStyle = '#0cf';
    ctx.textAlign = 'right';
    ctx.fillText('ST ' + this.stage, CANVAS_W - 8, 14);

    // Muted indicator
    if (this._muted) {
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText('MUTE', CANVAS_W - 8, 26);
    }

    // Paused
    if (this._paused) {
      ctx.fillStyle = '#ff0';
      ctx.textAlign = 'center';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText('PAUSED', CANVAS_W / 2, CANVAS_H / 2);
    }

    ctx.restore();
    this.player.drawHUD(ctx);
  }

  // ── State: STAGE_CLEAR ────────────────────────────────────────────────

  _enterStageClear() {
    this.audio.stageClear();
    this._stateTimer = 2.5;
    // Update high score
    if (this.player.score > this.highScore) {
      this.highScore = this.player.score;
      localStorage.setItem('gal_hi', this.highScore);
    }
    this.state = STATE.STAGE_CLEAR;
  }

  _updateStageClear(dt) {
    this._stateTimer -= dt;
    if (this._stateTimer <= 0) {
      this.stage++;
      this._startStage();
      this.state = STATE.PLAYING;
    }
  }

  _renderStageClear(ctx) {
    ctx.save();
    ctx.fillStyle = '#0f0';
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE ' + this.stage + ' CLEAR!', CANVAS_W / 2, CANVAS_H / 2);
    ctx.restore();
  }

  // ── State: DEAD ───────────────────────────────────────────────────────

  _enterDead() {
    if (this.player.lives <= 0) {
      this._enterGameOver();
      return;
    }
    this._deathTimer = 2.0;
    this.state = STATE.DEAD;
  }

  _updateDead(dt) {
    this._deathTimer -= dt;
    if (this._deathTimer <= 0) {
      this.player.dead = false;
      this.player.x = CANVAS_W / 2;
      this.player.y = CANVAS_H - 40;
      this.player.invincibleTimer = 2500;
      this.player.dual = false;
      this.player.captured = false;
      this.player.bullets = [];
      this.state = STATE.PLAYING;
    }
  }

  // ── State: GAME_OVER ──────────────────────────────────────────────────

  _enterGameOver() {
    if (this.player.score > this.highScore) {
      this.highScore = this.player.score;
      localStorage.setItem('gal_hi', this.highScore);
    }
    this._stateTimer = 4.0;
    this.state = STATE.GAME_OVER;
  }

  _updateGameOver(dt) {
    this._stateTimer -= dt;
    if (this._stateTimer <= 0) {
      this.state = STATE.TITLE;
    }
    if (this.input.wasJustPressed('Space')) {
      this.state = STATE.TITLE;
    }
  }

  _renderGameOver(ctx) {
    ctx.save();
    ctx.fillStyle = '#f44';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 10);

    ctx.fillStyle = '#ff0';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText('SCORE: ' + this.player.score, CANVAS_W / 2, CANVAS_H / 2 + 16);
    ctx.restore();
  }
}
