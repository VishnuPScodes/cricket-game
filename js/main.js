// Entry: renderer, fixed-step loop, input, camera, syncing meshes to simulation.
import * as THREE from 'three';
import { Game, DT, GROUND_CENTER } from './game.js';
import { buildScene } from './scene.js';
import { Animator } from './anim.js';
import { initMenu, updateHUD } from './ui.js';
import { loadAvatarModel } from './avatar.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

await loadAvatarModel('assets/models/player.glb');
const S = buildScene(renderer);
const game = new Game();
const anim = new Animator(S);
window.game = game; // handy for debugging in the console
window.S = S;

initMenu((opts) => game.start(opts));

addEventListener('resize', () => {
  S.camera.aspect = innerWidth / innerHeight;
  S.camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

addEventListener('keydown', (e) => {
  if (game.state === 'menu' || game.state === 'end') return;
  const k = e.code;
  if (k === 'Space') game.swing();
  else if (k === 'ArrowLeft') game.setAim(1);
  else if (k === 'ArrowRight') game.setAim(-1);
  else if (k === 'ArrowUp') game.setShot(1);
  else if (k === 'ArrowDown') game.setShot(-1);
  else return;
  e.preventDefault();
});

// ---- camera: behind the batsman at the crease; follows the ball after a hit ----
// lower and closer than a broadcast view, so the ball's flight is seen against the dark sight screen
const CAM_POS = new THREE.Vector3(1.0, 1.95, 4.4);
const CAM_LOOK = new THREE.Vector3(0.1, 0.95, -12);
const camPos = new THREE.Vector3(40, 25, 20), camLook = new THREE.Vector3(0, 0, -10);
const tmpPos = new THREE.Vector3(), tmpLook = new THREE.Vector3();
let menuT = 0;

function updateCamera(dt) {
  const b = game.ball.p;
  if (game.state === 'menu') {
    menuT += dt * 0.06;
    tmpPos.set(GROUND_CENTER.x + Math.sin(menuT) * 48, 16 + Math.sin(menuT * 1.7) * 3, GROUND_CENTER.z + Math.cos(menuT) * 48);
    tmpLook.set(0, 1, GROUND_CENTER.z);
    camPos.lerp(tmpPos, 1 - Math.exp(-2 * dt));
    camLook.lerp(tmpLook, 1 - Math.exp(-2 * dt));
  } else {
    const following = game.batHit && (game.state === 'play' || game.state === 'result' || game.state === 'end');
    if (following) {
      const dist = Math.hypot(b.x, b.z + 1.5);
      tmpLook.set(b.x, Math.max(0, b.y), b.z);
      tmpPos.set(CAM_POS.x + b.x * 0.06, CAM_POS.y + Math.min(10, dist * 0.15), CAM_POS.z + Math.min(6, dist * 0.06));
    } else {
      tmpLook.copy(CAM_LOOK);
      tmpPos.copy(CAM_POS);
    }
    const kPos = 1 - Math.exp(-(following ? 1.5 : 3) * dt);
    const kLook = 1 - Math.exp(-(following ? 3 : 4) * dt);
    camPos.lerp(tmpPos, kPos);
    camLook.lerp(tmpLook, kLook);
  }
  const o = window.camOverride; // debug: { pos: [x,y,z], look: [x,y,z] }
  if (o) { S.camera.position.set(...o.pos); S.camera.lookAt(...o.look); return; }
  S.camera.position.copy(camPos);
  S.camera.lookAt(camLook);
}

// ---- mesh sync ----
const spinAxis = new THREE.Vector3(), spinQ = new THREE.Quaternion();
const history = [];
let brokenT = 0;
const MIN_BALL_PX = 4.5, BALL_VIS_R = 0.036 * 1.4;
let lastBounces = 0, markT = 9;

function sync(dt) {
  anim.update(game, dt); // also places the bat (stance/backlift, then the exact physics pose)
  for (const c of S.people) c.avatar.drive();

  // ball: in the bowler's hand during the run-up, otherwise the simulated position
  const bp = game.ball.p;
  if (game.state === 'runup') S.ball.position.copy(S.bowler.gripW.R);
  else if (S.heldBall) S.ball.position.copy(S.heldBall); // caught or fielded: in the fielder's hands
  else S.ball.position.set(bp.x, bp.y, bp.z);
  S.ball.visible = game.state !== 'menu';
  // never let the ball shrink below a few pixels on screen (it is only ~2 px at the bowler's end)
  const camD = S.camera.position.distanceTo(S.ball.position);
  const pxPerRad = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(S.camera.fov) / 2));
  const ballScale = Math.max(1, (MIN_BALL_PX / pxPerRad) * camD / (BALL_VIS_R));
  S.ball.scale.setScalar(ballScale);
  const live = game.state === 'runup' || (game.state === 'play' && !game.batHit);
  S.halo.visible = live || (game.state === 'play' && game.batHit);
  // pitch marker: where the delivery bounced, fading out
  const bn = game.ball.bounces;
  if (game.state === 'play' && !game.batHit && bn === 1 && lastBounces === 0) {
    S.pitchMark.position.set(bp.x, 0.013, bp.z); markT = 0;
  }
  lastBounces = game.state === 'runup' ? 0 : bn;
  markT += dt;
  S.pitchMark.material.opacity = game.state === 'runup' ? 0 : 0.75 * Math.max(0, 1 - markT / 1.6);
  const w = game.ball.w, wl = Math.hypot(w.x, w.y, w.z);
  if (wl > 1e-3 && game.state !== 'runup') {
    spinAxis.set(w.x / wl, w.y / wl, w.z / wl);
    spinQ.setFromAxisAngle(spinAxis, Math.min(wl, 30) * dt);
    S.ball.quaternion.premultiply(spinQ);
  }
  const h = Math.max(0, S.ball.position.y);
  S.ballShadow.position.set(S.ball.position.x, 0.014, S.ball.position.z);
  const sh = 0.09 + h * 0.04;
  S.ballShadow.scale.set(sh, 1, sh);
  S.ballShadow.material.opacity = Math.max(0.15, 0.9 - h * 0.18);
  S.ballShadow.visible = S.ball.visible;

  // speed trail
  const v = game.ball.v, speed = Math.hypot(v.x, v.y, v.z);
  history.unshift(S.ball.position.clone());
  if (history.length > S.trail.length * 2) history.length = S.trail.length * 2;
  const trailOn = (game.state === 'play' || game.state === 'result') && speed > 12;
  S.trail.forEach((m, i) => {
    const p = history[i + 1];
    m.visible = trailOn && !!p;
    if (p) m.position.copy(p);
    m.scale.setScalar((1 - i / 16) * ballScale);
  });

  // stumps: knocked back with flying bails when bowled
  const { stumps, bails } = S.stumps.userData;
  if (game.stumpsBroken) {
    brokenT += dt;
    const k = Math.min(1, brokenT * 6);
    stumps.forEach((s, i) => { s.rotation.x = 0.45 * k; s.rotation.z = (i - 1) * 0.18 * k; });
    bails.forEach((b, i) => {
      const t = Math.min(brokenT, 0.7);
      b.position.set((i ? 0.055 : -0.055) + (i ? 0.6 : -0.4) * t, 0.719 + 3.2 * t - 4.9 * t * t, 1.4 * t);
      b.rotation.set(t * 14, 0, Math.PI / 2 + t * 9);
    });
  } else if (brokenT) {
    brokenT = 0;
    stumps.forEach((s) => s.rotation.set(0, 0, 0));
    bails.forEach((b, i) => { b.position.set(i ? 0.055 : -0.055, 0.719, 0); b.rotation.set(0, 0, Math.PI / 2); });
  }
}

let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game.state !== 'menu' && game.state !== 'end') {
    acc += dt;
    while (acc >= DT) { game.step(DT); acc -= DT; }
  }
  sync(dt);
  updateCamera(dt);
  updateHUD(game);
  renderer.render(S.scene, S.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
