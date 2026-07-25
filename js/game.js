import { Player } from './player.js';
import { Formation } from './formation.js';
import { Stars } from './stars.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { BonusFly, BONUS_FLIES } from './bonusfly.js';

const CANVAS_W = 448;
const CANVAS_H = 512;

// Level names cycle in this order, repeating until game over
const LEVEL_NAMES = [
  'DEVOPS', 'JAVA', 'COBOL', 'FACADE', 'TEST AND DELIVERY', 'QUICK WINS',
];

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
    this.bonusFlies = [];         // active bonus fly enemies

    // Stage-clear / death timers
    this._stateTimer = 0;
    this._muted = false;

    // Bonus stage tracking
    this._bonusKills = 0;
    this._bonusTotal = 0;

    // Death sequence
    this._deathTimer = 0;
    this._respawnReady = false;

    // Bonus fly spawn: first appears quickly, then one every 10s
    this._bonusFlyTimer = 3;
    this._bonusFlyPool = shuffle([...BONUS_FLIES]); // randomised order
    this._bonusFlyIdx  = 0;

    // Floating score pop-ups
    this._scorePops = [];
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
    ctx.fillText('GALAGA', CANVAS_W / 2, 150);

    // Subtitle
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.shadowColor = '#0f0';
    ctx.shadowBlur = 6;
    ctx.fillText('INFRATASK FORCE', CANVAS_W / 2, 182);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#0cf';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText('INSPIRED BY © 1981 NAMCO', CANVAS_W / 2, 206);

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
    ctx.fillText('MOVE: ◀ ▶   INFRA GUN: SPACE', CANVAS_W / 2, 360);
    ctx.fillText('PAUSE: P   MUTE: M', CANVAS_W / 2, 376);

    ctx.restore();
  }

  // ── State: PLAYING ────────────────────────────────────────────────────

  _startGame() {
    this.stage = 1;
    this.player = new Player(this.audio);
    this.bonusFlies = [];
    this._scorePops = [];
    this._bonusFlyTimer = 3;
    this._bonusFlyPool  = shuffle([...BONUS_FLIES]);
    this._bonusFlyIdx   = 0;
    this._startStage();
    this.state = STATE.PLAYING;
  }

  // Level name for the current stage, cycling through LEVEL_NAMES
  get levelName() {
    return LEVEL_NAMES[(this.stage - 1) % LEVEL_NAMES.length];
  }

  _startStage() {
    this.isBonus = this.stage % 3 === 0;
    this.formation = new Formation(this.audio, this.stage);
    this._bonusKills = 0;
    this._bonusTotal = this.formation.livingCount();
    this._levelBannerTimer = 3.0; // show level name at stage start
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

    if (this._levelBannerTimer > 0) this._levelBannerTimer -= dt;

    this.player.update(dt, this.input);
    this.formation.update(dt, this.player, this.stage);

    // Drain formation feedback events (score pops + triple-kill banners)
    for (const ev of this.formation.events) {
      if (ev.type === 'score') {
        this._scorePops.push({ x: ev.x, y: ev.y, pts: ev.pts, timer: 1.2, color: ev.color });
      } else if (ev.type === 'banner') {
        this._scorePops.push({ x: ev.x, y: ev.y, text: ev.text, timer: 2.0, color: ev.color, big: true });
      }
    }
    this.formation.events.length = 0;
    // Keep high score fresh if formation kills pushed us over
    if (this.player.score > this.highScore) {
      this.highScore = this.player.score;
      localStorage.setItem('gal_hi', this.highScore);
    }

    // Bonus fly spawn timer (only after formation has entered)
    if (this.formation.allEntered()) {
      this._bonusFlyTimer -= dt;
      if (this._bonusFlyTimer <= 0) {
        const def = this._bonusFlyPool[this._bonusFlyIdx % this._bonusFlyPool.length];
        this._bonusFlyIdx++;
        this.bonusFlies.push(new BonusFly(def));
        this._bonusFlyTimer = 10;
      }
    }

    // Update bonus flies + collision with player bullets
    for (const bf of this.bonusFlies) {
      bf.update(dt, this.player.x, this.player.y, this.audio);

      // Player bullets hit bonus fly
      for (const b of this.player.bullets) {
        if (b.dead) continue;
        if (Math.abs(b.x - bf.x) < b.hw + bf.hw &&
            Math.abs(b.y - bf.y) < b.hh + bf.hh) {
          b.dead = true;
          const pts = bf.takeHit(this.audio);
          if (pts > 0) {
            this.player.score += pts;
            this._scorePops.push({ x: bf.x, y: bf.y, pts, timer: 1.2, color: bf.color });
            if (this.player.score > this.highScore) {
              this.highScore = this.player.score;
              localStorage.setItem('gal_hi', this.highScore);
            }
          }
        }
      }

      // Bonus fly bullets hit player
      if (!this.player.dead && !this.player.captured && !this.player.isInvincible()) {
        for (const b of bf.bullets) {
          if (b.dead) continue;
          if (Math.abs(b.x - this.player.x) < b.hw + this.player.hw &&
              Math.abs(b.y - this.player.y) < b.hh + this.player.hh) {
            b.dead = true;
            this.player.hit();
          }
        }
      }
    }
    this.bonusFlies = this.bonusFlies.filter(bf => !bf.dead);

    // Score pop-up timers
    for (const p of this._scorePops) p.timer -= dt;
    this._scorePops = this._scorePops.filter(p => p.timer > 0);

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
    for (const bf of this.bonusFlies) bf.draw(ctx);
    this.player.draw(ctx);
    this._renderScorePops(ctx);
    this._renderHUD(ctx);
    if (this.isBonus) this._renderBonusBanner(ctx);
    this._renderLevelBanner(ctx);
  }

  // "LEVEL: DEVOPS" splash shown for a few seconds at the start of each stage
  _renderLevelBanner(ctx) {
    if (!this._levelBannerTimer || this._levelBannerTimer <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this._levelBannerTimer / 0.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0cf';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText('LEVEL ' + this.stage, CANVAS_W / 2, CANVAS_H / 2 - 46);
    ctx.fillStyle = '#ff0';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.shadowColor = '#ff0';
    ctx.shadowBlur = 8;
    ctx.fillText(this.levelName, CANVAS_W / 2, CANVAS_H / 2 - 20);
    ctx.restore();
  }

  _renderScorePops(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const p of this._scorePops) {
      const fade = Math.min(1, p.timer / 0.4);
      ctx.globalAlpha = fade;

      if (p.big) {
        // Triple-kill banner — big, centred horizontally, glowing
        const yOff = (2.0 - p.timer) * 24;
        ctx.font = 'bold 16px "Press Start 2P", monospace';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, CANVAS_W / 2, Math.max(80, p.y - yOff));
        ctx.shadowBlur = 0;
      } else {
        const yOff = (1.2 - p.timer) * 30;
        ctx.font = 'bold 8px "Press Start 2P", monospace';
        ctx.fillStyle = p.color;
        ctx.fillText('+' + p.pts, p.x, p.y - yOff);
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
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

    // Level name top-right
    ctx.fillStyle = '#0cf';
    ctx.textAlign = 'right';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(this.levelName, CANVAS_W - 8, 14);
    ctx.font = '8px "Press Start 2P", monospace';

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
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.shadowColor = '#0f0';
    ctx.shadowBlur = 8;
    ctx.fillText('ALL TICKETS CLEARED!', CANVAS_W / 2, CANVAS_H / 2 - 10);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff0';
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillText(this.levelName + ' SPRINT COMPLETE', CANVAS_W / 2, CANVAS_H / 2 + 16);
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
