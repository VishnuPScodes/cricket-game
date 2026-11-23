# 🏏 Cricket Blast

**A 3D cricket batting game in the browser, built on real ball and bat physics.**

### ▶️ [Play now at cricket-game-sable.vercel.app](https://cricket-game-sable.vercel.app/)

Pick a difficulty, set a target and chase it down before your overs or wickets run out. Every delivery is simulated with drag, spin, swing and bounce. Every shot comes from a real collision between the ball and the bat, so the result depends on your timing.

---

## ✨ Features

- **Physics-driven gameplay:** quadratic air drag, Magnus force from spin, seam swing, and an impulse-based bounce with friction, so spinners really turn off the pitch.
- **Real bat–ball collision:** the ball (a sphere) hits the moving bat blade (a box), and the result depends on where it lands on the bat. Middle it for a clean strike or nick it for an edge.
- **Varied bowling:** pace and spin deliveries aimed at chosen spots on the pitch, released at 130–150 km/h.
- **Full match rules:** bowled, caught, LBW, wides, no-balls, fours, sixes and runs worked out from fielding time.
- **Procedural stadium:** a striped outfield, floodlights, tiered stands with a crowd, ad boards and sight screens, all generated in code.
- **Animated players:** skinned human models in team kit, driven by a procedural animation rig (IK limbs). The batsman has a realistic stance, backlift, stride and follow-through, alongside a bowler with a full run-up and action, fielders, a keeper and an umpire.
- **Minimal broadcast-style HUD:** score, overs, target, runs needed and balls left, and nothing else.

## 🎮 Controls

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Swing the bat |
| <kbd>←</kbd> / <kbd>→</kbd> | Set shot direction (leg side ↔ off side) |
| <kbd>↑</kbd> | Lofted shot (go aerial for a six) |
| <kbd>↓</kbd> | Ground shot (keep it along the ground) |

> **Tip:** timing matters most. The bat connects within about ±20 ms of the ideal moment, and only a strike within about ±10 ms comes off clean.

## ⚙️ Match Setup

| Option | Choices |
|---|---|
| Difficulty | Easy · Medium · Hard |
| Target | 20 · 30 · 50 · 100 |
| Overs | 2 · 5 · 10 |

Difficulty never slows the ball down. It changes how much the bowling varies and how forgiving the timing is. On Hard, a mistimed shot is punished much more.

## 🛠️ Tech Stack

- **[Three.js](https://threejs.org/) 0.160**: loaded from a CDN through an import map
- **Plain JavaScript (ES modules)**: no framework, no bundler, no build step
- **Custom physics engine**: written specifically for cricket, stepped every 0.5 ms so a fast ball can't pass through the bat
- **[Vercel](https://vercel.com/)**: static hosting

## 🚀 Run Locally

```bash
git clone https://github.com/VishnuPScodes/cricket-game.git
cd cricket-game
npm run dev        # serves at http://localhost:8765
```

Any static file server works. The game has no dependencies to install.

## 🧪 Tests

Headless tests run in Node with no browser needed:

```bash
npm test
```

- `tests/physics-test.js`: sanity checks for ball flight, bounce and bat collisions
- `tests/game-test.js`: simulates full matches with a bot batsman at every difficulty

## 📁 Project Structure

```
├── index.html        # Page shell, menu, HUD, import map
├── style.css         # UI styling
├── js/
│   ├── main.js       # Renderer, game loop, input, camera
│   ├── game.js       # Match state machine, rules, scoring, fielding
│   ├── physics.js    # Ball flight, drag, spin, swing, bounce
│   ├── bat.js        # Bat swing and collision
│   ├── bowling.js    # Difficulty settings and delivery generation
│   ├── scene.js      # Scene assembly
│   ├── stadium.js    # Procedural stadium
│   ├── models.js     # Player and bat models
│   ├── anim.js       # Player animation
│   ├── avatar.js     # Skinned player models driven by the animation rig
│   ├── ui.js         # Menu, HUD, end screen
│   └── vec.js        # Vector maths helpers
├── assets/models/    # Player model (glTF)
└── tests/            # Headless physics and match tests
```

## 🙏 Credits

- Player model: the Ready Player Me sample avatar from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) (© Ready Player Me), restyled at load time into cricket kit.

## 🌐 Deployment

The site deploys to Vercel as a static site (see `vercel.json`). Each push to `main` redeploys it automatically.

**Live:** https://cricket-game-sable.vercel.app/
