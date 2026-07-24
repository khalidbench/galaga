# GALAGA — Browser Arcade Game

A faithful recreation of the 1981 Namco arcade classic, built with plain HTML, CSS, and vanilla JavaScript (Canvas 2D API). No build step, no frameworks, no external dependencies.

## How to Play

### Controls

| Action | Keyboard | Touch |
|--------|----------|-------|
| Move Left | ← Arrow / A | ◀ button |
| Move Right | → Arrow / D | ▶ button |
| Fire | Space | ● button |
| Pause | P | — |
| Mute / Unmute | M | — |

### Objective

Destroy all enemies in each stage to advance. Avoid enemy dive attacks and their bullets.

### Enemy Types

| Enemy | Formation Points | Diving Points |
|-------|-----------------|---------------|
| Bee (cyan) | 50 | 100 |
| Butterfly (red) | 80 | 160 |
| Boss Galaga (green) | 150 | 400 (800 if escorted) |

Boss Galagas take **2 hits** to destroy.

### Escort Formation Attack

From Stage 2 onward, a Boss Galaga will occasionally lead **2 butterfly escorts** in a coordinated V-formation dive. Destroy the boss while both escorts are still alive for **800 points**. Each escort you kill first drops the boss back to 400.

### The Capture / Rescue Mechanic

1. A **Boss Galaga** may swoop down and deploy a **tractor beam** — a cone of yellow-purple light.
2. If your ship flies into the beam, it is **captured** and you lose a life. The captured ship joins the boss in formation.
3. Later, if that specific Boss Galaga **dives again** and you destroy it mid-dive, your captured ship is freed.
4. The freed ship **docks alongside your current ship**, creating a **Dual Fighter** with double firepower.
5. The Dual Fighter is wider (bigger target), but fires two bullets per shot — classic risk/reward.
6. If the Dual Fighter is hit, only one ship is lost and you continue with a single ship.

### Stages

- Every **3rd stage** is a **Challenging Stage** (bonus round): enemies fly through in patterns without firing.
- Difficulty increases with each stage: faster enemy dives, more aggressive bullets.
- Enemy bullets always travel mostly downward — dodgeable by moving left or right.

## Running Locally

```bash
cd /path/to/galaga
node serve.js   # starts http://localhost:8181
```

Or with Python:
```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080). ES modules require an HTTP server (not `file://`) in Chrome.

## Deploying to GitHub Pages

1. Push the folder contents to a GitHub repository's `main` branch.
2. Go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Click **Save**. Live at `https://<username>.github.io/<repo-name>/` within ~1 minute.

## Project Structure

```
index.html        entry point
style.css         minimal styling + retro font
js/
  main.js         game bootstrap and RAF loop
  game.js         Game class: state machine, level progression
  player.js       Player ship: movement, shooting, dual-fighter
  enemy.js        Enemy class: bee / butterfly / boss-galaga
  formation.js    Formation grid, entry paths, dive attacks, escort formation
  bullet.js       Bullet class (player and enemy)
  input.js        Keyboard and touch input handler
  audio.js        WebAudio retro SFX (no external files)
  sprites.js      Procedural pixel-art drawing helpers
  stars.js        Scrolling parallax starfield
```
