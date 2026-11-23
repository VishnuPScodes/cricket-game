# Cricket Batting Game: Handover

## Goal
A browser-based 3D cricket batting game: Three.js, plain JavaScript, no paid assets.
The priority is realistic ball and bat physics; graphics stay simple.
The original spec is the user's long prompt asking for stages 1–7.

Main requirements from that spec:
- Third-person camera behind the batsman.
- Real physics: drag, spin, swing, bounce, and genuine bat-ball collision.
- Controls: Space swings; Left/Right set direction; Up lofts; Down plays along the ground.
- Difficulty comes from delivery variation and timing tolerance. Easy mode must not slow the ball down.
- HUD shows only runs, wickets, overs, target, runs needed and balls left.
- Setup menu: Easy/Medium/Hard; target 20/30/50/100; 2/5/10 overs.

## How to run
```
cd /Users/vishnups/Documents/personalProjects/cricket
python3 -m http.server 8765    # then open http://localhost:8765
node tests/physics-test.js      # headless physics sanity check
node tests/game-test.js         # headless full-match simulation with a bot batsman (~6 s)
```
- Three.js 0.160.0 loads from jsdelivr through an importmap in `index.html`. There is no build step.
- `package.json` contains only `"type": "module"`, so Node can import the `js/` modules in tests.

## Status
All stages (1–7) have a first implementation.
- **Browser test:** the game loads and plays in Chrome with no console errors. A scripted bot swinging with near-perfect timing scored a SIX. A ball left alone while I took a screenshot was BOWLED.
- **Not done:** nobody has played it by hand yet, so the next step is a real playtest and tuning.
- **Unexplained display mismatch:** one screenshot showed the HUD at 0/2 with 0 runs, while the bot's log showed only one BOWLED (then SIX 6/2). Probably a delivery dismissed before the bot started, but it was never checked.

## Update: realistic batting technique (after playtest)
User feedback: "he is not holding the bat as a real batsman does"; everything else was fine. Visual only (`anim.js`, `models.js`); physics and timing are unchanged.
- **Stance:** knees flexed (hips 0.845), hands resting against the front thigh, handle leaning towards the bowler, toe grounded just outside the back toe, top elbow pointing at the bowler.
- **Backlift:** hands at hip height just behind the back hip, toe up towards second slip, face open.
- **Stride:** the front foot strides to the line of the ball (from `bat.Pt`), and the front knee bends as the hips drop and move forward. The top-hand elbow rises through the shot; the bottom elbow stays tucked.
- **Follow-through:** the back heel lifts and the back foot pivots.
- **Head:** `Object3D.lookAt` keeps the eyes level. It watches the bowler's hand in the run-up and the ball after release, with the neck turn capped at 1.75 rad.
- **Gloves:** batting gloves have a palm, four padded finger rolls, a thumb, a back panel and a gauntlet cuff that follows the forearm (`L.cuff`).

## Update: realistic bowler run-up/action and body models
Visual only, except that the release point and run-up times changed to match the new animation.
- **Run-up** (`anim.js`, `gaitPose`/`gaitFoot`): a running gait with planted feet. The stance foot slides back at exactly the run speed, so it never skates. There is a flight phase, cadence rises with speed, and the arms pump opposite the legs. Pace bowlers accelerate from about 2.4 to 6.8 m/s over roughly 11 m; spinners jog in over roughly 3.5 m.
- **Action** (`BOWL` table): take off from the left foot into the bound with a knee drive. Turn side-on in the air with the front arm reaching high. The back foot lands parallel to the crease (`uB`). The braced front foot lands on the popping crease (`ff`). Hips open before the shoulders. The straight arm comes over and releases just past vertical.
- **Follow-through**: the arm sweeps across the body, the back leg drives through, then the bowler runs off decelerating, peels away to the off side, and stands.
- **Release sync**: `d.p0` in `bowling.js` equals the bowler's grip point (`Character.gripW.R`) at release. If you change the action, re-measure it. `relT` uses `game.t` while the ball is live, so the hand and ball meet exactly.
- `d.runup` is now 2.4 s (pace) and 1.5 s (spin). `anim.js` derives the whole path and gait phase from it, so the left foot takes off exactly at the start of the gather.
- **Models** (`models.js`): lathe-built torso (tapered waist, broad chest, sloping trapezius) and muscle-profiled limbs. Face (jaw, nose, ears, eyes, brows). Bare hands with fingers and thumb. Short sleeves with trim. Boots with sole and heel. Batting pads with bolsters, knee roll and straps. `placeSeg(..., front)` orients segments so that pads and knees face the knee direction.
- **Batsman stance**: hips flexed and pushed back, chest over the knees, knees over the toes instead of splayed.
- **Debug harness used**: headless Chrome via CDP with a virtual clock (patched `performance.now`/`requestAnimationFrame`), driven frame by frame with `window.camOverride` for side views. Use `--use-angle=metal`; SwiftShader stalls.

## Architecture (`js/`)
| File | Role |
|---|---|
| `vec.js` | Small vector helpers on plain `{x,y,z}` objects, so physics runs without Three.js. |
| `physics.js` | `Ball` and `stepBall()`: gravity, quadratic drag, Magnus force, seam swing, and an impulse-based bounce. The bounce applies restitution plus Coulomb friction at the contact point, so spin produces real turn. Also rolling resistance on the outfield, separate pitch and outfield surfaces, and `hitsStumps()`. |
| `bowling.js` | `DIFFICULTY` table and `makeDelivery()`. A delivery is defined by speed, spin, swing and the spot it should pitch on. `solveRelease()` uses Newton iteration over real simulations to find the release velocity that pitches there. |
| `bat.js` | `Bat`: an oriented box blade swung on an arc (angle φ, hands on an arm around pivot P). Sphere-vs-box collision uses the bat's velocity at the contact point (finite difference of poses). Restitution and effective mass depend on distance from the sweet spot and across the blade, which produces edges. Also contains `aimAt()` (auto footwork) and `start(timingError, assist)`. |
| `game.js` | States: `menu → runup → play → result → … → end`. Handles release, bat/pad/stump checks, wides, no-balls, LBW (predicts the path after pad impact), catches, fielding with 2 chasers, boundaries (4 if it bounced, 6 if not), runs from field-and-throw time, and the target-chase end. |
| `scene.js` | Assembles lights, stadium, characters, stumps, bat, ball (+trail, blob shadow). The ball is drawn 1.4× its physical size for visibility. |
| `stadium.js` | Procedural stadium: gradient sky + clouds, striped outfield with 30-yard circle, textured pitch, ad boards, tiered stands with instanced crowd, roof, floodlights, black sight screens. |
| `models.js` | `Character`: FK torso/head, limbs placed between IK-solved world joints (hands grip the physics bat). Also the visual bat model. |
| `anim.js` | `Animator`: per-frame poses for batsman (stride, spine lean search so hands reach the bat, head tracks ball), bowler (run-up, bound, delivery stride, windmill arm, follow-through), fielders (run/ready), keeper, umpire signals, non-striker. Visual only. |
| `main.js` | Renderer, fixed 0.5 ms physics step, keyboard input, camera (fixed behind the batsman, loosely follows the ball after a hit), mesh sync. `window.game` is exposed for debugging. |
| `ui.js` | Menu, HUD, end screen. |

## Coordinates
- Batting stumps at z=0; bowler's stumps at z=-20.12. The ball travels towards +z.
- +x is the off side for a right-handed batsman; +y is up.
- Ideal contact plane `CONTACT_Z = -1.55`. Boundary radius 62 m around (0, -10.06).
- Aim: `game.aim` runs -2..2, where positive means leg side (Left arrow). The bat's yaw is aim × 0.5 rad.
- Shot type: `game.shot` is -1 ground, 0 normal, 1 lofted. Shot types are defined in `SHOT_TYPES` in `bat.js`.

## Design decisions (and why)
- **Custom physics instead of Rapier.** A generic rigid-body engine doesn't model seam swing or the cricket-specific spin and friction on the bounce. It also risks letting a fast ball pass through a thin bat. Collision is checked every 0.5 ms.
- **Auto footwork.** At release the batsman reads the delivery and moves the swing pivot so the sweet spot lines up with the ball. Difficulty sets how inaccurate this is (`noise`). The player controls timing, direction and loft, which is the N-Power-style control scheme.
- **Timing tolerance.** `timingAssist` (easy 0.65, medium 0.35, hard 0.1) is the fraction of the player's timing error that the batsman corrects, by holding the backlift a little longer or shortening it. `pitchSens`/`yawSens` set how fast the bat face tilts and turns through the swing, so mistiming hurts more on Hard. The physics itself is unchanged.
- **Runs.** T = time for the ball to be fielded + throw distance / 25 m/s + 0.5 s; runs = clamp(floor((T + 0.6) / 3), 0, 3).

## Measured behaviour (headless tests)
- **Deliveries:** pace balls pitch within 1 cm of target. Release at 130–150 km/h arrives at the stumps at about 104–123 km/h (roughly a 20% loss; reality is 10–15%, which could be tuned). Spinners turn about 0.2–0.3 m.
- **Perfect timing:** exit speed about 130 km/h. Lofted shots launch at about 28° and carry about 84 m (six). Normal shots launch at about 1°. Ground shots go into the ground at about -10°.
- **Timing window:** the bat connects within roughly ±20 ms of ideal; inside about ±10 ms the shot is clean.
- **Bot match results:** chase of 100 in 10 overs, 6 matches per row. "Timing spread" is the standard deviation of the bot's timing error.

  | Difficulty | 15 ms spread: wins, run rate | 30 ms spread: wins, run rate |
  |---|---|---|
  | Easy | 6/6, 17.6/over | 2/6, 13.8/over |
  | Medium | 6/6, 16.8/over | 0/6, 8.8/over |
  | Hard | 1/6, 11.4/over | 0/6, 5.8/over |

## Known issues / next steps
1. **Hand playtest.** Check the timing feel at real speed (about 0.5 s of ball flight), whether the ball is easy to see, and whether the camera framing works.
2. **Scoring balance.** Boundaries are frequent and singles and twos are rare. Options: more or better-placed fielders, a larger diving reach for ground balls, or less exit speed from normal shots.
3. **Speed loss.** Release-to-bat loss is about 20%; it could be lowered towards 12–15% (pitch `mu`, `CD` in `physics.js`). Re-check spin turn after any change.
4. **Visuals.** Rebuilt (see models/anim/stadium). The pads collision box still follows `game.body`, so LBW is rare. Debug: `window.S` is the scene bundle; set `window.camOverride = {pos:[x,y,z], look:[x,y,z]}` to free the camera.
5. **No feedback after each ball.** There is no hint about timing (early or late). The spec says to show minimal stats, so this was left out on purpose.
6. **Extras.** Only wides (crease x > 0.95 or < -0.75, or height > 2.0) and no-balls (random overstep). No byes, leg-byes or run-outs.
7. **Pending decision.** The first BOWLED in the browser test happened on a ball nobody swung at. That's correct behaviour, but confirm it with the user if the HUD count seems off.
