# Tank Brawl

A 2D top-down multiplayer tank arena game. Two teams (blue vs red), 2v2 to 5v5, browser-based, 100% static, peer-to-peer over WebRTC.

No build step. No backend. Pure HTML, CSS, and JavaScript loaded as ES modules. PeerJS is pulled in via CDN and uses the free public broker for signaling.

## Quick play

1. Open the deployed page (or `index.html` locally — see "Run locally" below).
2. Enter your display name (saved in localStorage for next time).
3. Pick **Create Room** to host, or **Join Room** to enter a code your friend shared.
4. Choose a team (blue or red). The host clicks **Start Match** when both teams have at least one player.

## Controls

- **WASD** — move tank
- **Mouse** — aim turret
- **Left click** — fire
- **Speaker icon (HUD)** — mute / unmute (saved in localStorage)

## Match rules

- Tanks have **100 HP**, bullets do **20 damage** (no friendly fire).
- Match runs **10 minutes**, or first team to **20 kills** wins.
- Respawn at your team base **7 seconds** after death.
- Pickups spawn every **25 seconds** at random safe points.

## Pickups

| Name | Effect |
| --- | --- |
| **Kafka** | Triple fire rate for 10s. |
| **Precisely** | Next 5 shots are crits (2x damage). |
| **OpenSearch** | Reveals enemy positions for 15s. |
| **DMS** | Teleport to a random safe location. |
| **Control-M** | Drops an automated turret that fires for 20s. |
| **CFT** | One slow heavy shell that does 60 damage. |
| **WAS** | Shield: absorbs the next 2 hits. |
| **IBM-MQ** | Queues 3 shots fired in rapid succession. |
| **ROCKET ES** | +75% movement speed for 12s. |

The HUD shows active buffs with countdown timers.

## Project structure

```
index.html      Entry point — lobby screens and the game canvas
style.css       Arcade-flavored styling for lobby and HUD
game.js         Main module: UI flow, host simulation, rendering, input
network.js      PeerJS layer (host-authoritative, room codes, sync)
pickups.js      Pickup definitions and effect application
audio.js        Procedural Web Audio sound effects + mute toggle
```

All asset paths are relative, so the game works under `username.github.io/repo-name/`.

## Run locally

Because the page uses ES modules, you need to serve it over HTTP (not `file://`). Any static server works:

```bash
# Python 3
python3 -m http.server 8080

# Node (npx)
npx serve .
```

Then open <http://localhost:8080>.

To play locally with two players on one machine, open the page in two browser windows (one creates a room, the other joins with the code).

## GitHub Pages setup

1. Create a new GitHub repo (any name) and push these files at the root:
   - `index.html`, `style.css`, `game.js`, `network.js`, `pickups.js`, `audio.js`, `README.md`
2. In the repo settings, go to **Pages** → **Build and deployment**.
3. Set **Source** to **Deploy from a branch**.
4. Select **Branch: `main`** (or `master`) and **Folder: `/ (root)`**, then **Save**.
5. Wait for the Pages build to finish, then visit `https://<username>.github.io/<repo-name>/`.

That's it — no Actions, no build pipeline, no server-side code.

## Networking notes

- The host's PeerJS ID is a known prefix + your room code, so other players can connect by entering just the short code (e.g. `ABC123`).
- All game logic runs on the host. Other players send only their input state and render the snapshot the host broadcasts (~25 Hz).
- If the host disconnects, the match ends for everyone. Restart by creating a new room.
- The free PeerJS public broker is used for signaling. WebRTC traffic is direct peer-to-peer once connected.

## Audio

All sound effects are generated at runtime with the Web Audio API — no external audio files. The mute preference persists across sessions.

## Browser support

Tested on recent Chrome, Firefox, Safari, and Edge. Requires WebRTC and Web Audio.
