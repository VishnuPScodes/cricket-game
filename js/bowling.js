// Delivery generation. A delivery is defined by speed, spin, swing and the spot where it
// should pitch; the release velocity is then SOLVED with the real physics (Newton
// iteration), so what the player sees is genuine simulated flight, not a scripted path.
import { v3, gauss } from './vec.js';
import { Ball, stepBall } from './physics.js';

export const SIM_DT = 1 / 2000;

export const DIFFICULTY = {
  easy: {
    pace: [128, 134], spinChance: 0, spinSpeed: [80, 86], spinRps: [16, 20],
    line: [0.02, 0.16], len: [4.5, 7.0], swing: 0.8, seam: 0, special: 0, noBall: 0.02,
    pitchSens: 0.4, yawSens: 0.18, noise: 0, timingAssist: 0.65,
  },
  medium: {
    pace: [124, 142], spinChance: 0.25, spinSpeed: [80, 90], spinRps: [20, 26],
    line: [-0.12, 0.32], len: [2.5, 8.5], swing: 3.0, seam: 0.25, special: 0.1, noBall: 0.03,
    pitchSens: 0.65, yawSens: 0.35, noise: 0.015, timingAssist: 0.35,
  },
  hard: {
    pace: [134, 152], spinChance: 0.2, spinSpeed: [84, 95], spinRps: [24, 30],
    line: [-0.22, 0.5], len: [1.8, 9.5], swing: 5.0, seam: 0.5, special: 0.22, noBall: 0.04,
    pitchSens: 0.9, yawSens: 0.55, noise: 0.03, timingAssist: 0.1,
  },
};

const rnd = (a, b) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

export function makeDelivery(cfg) {
  const d = { spinner: Math.random() < cfg.spinChance, noBall: Math.random() < cfg.noBall };
  if (d.spinner) {
    const turn = sign(); // +1 off-spin (turns into the right-hander), -1 leg-spin
    const w = rnd(...cfg.spinRps) * 2 * Math.PI;
    d.speed = rnd(...cfg.spinSpeed) / 3.6;
    d.p0 = v3(0.2, 2.07, -18.99); // matches the hand at release in anim.js
    d.w = v3(w * 0.45, 0, turn * w * 0.85); // topspin + side-spin about the flight axis
    d.swing = 0; d.seam = 0;
    d.length = rnd(3.0, 6.5);
    d.lineX = rnd(...cfg.line) + 0.12 * turn;
    d.runup = 1.5;
  } else {
    d.speed = rnd(...cfg.pace) / 3.6;
    d.p0 = v3(0.36, 2.07, -18.85); // matches the hand at release in anim.js
    d.w = v3(-rnd(8, 14) * 2 * Math.PI, 0, 0); // seam backspin
    d.swing = sign() * rnd(0.3, 1) * cfg.swing;
    d.seam = gauss() * cfg.seam;
    d.length = rnd(...cfg.len);
    if (Math.random() < cfg.special) d.length = Math.random() < 0.5 ? rnd(0.5, 1.3) : rnd(9, 11);
    d.lineX = rnd(...cfg.line);
    d.runup = 2.4;
  }
  d.v0 = solveRelease(d.p0, d.speed, { x: d.lineX, z: -d.length }, d.w, d.swing);
  return d;
}

function simulateToBounce(p0, v0, w0, swing) {
  const b = new Ball();
  b.p = { ...p0 }; b.v = { ...v0 }; b.w = { ...w0 }; b.swing = swing; b.swingOn = true;
  for (let t = 0; t < 3; t += SIM_DT) {
    stepBall(b, SIM_DT);
    if (b.bounces > 0 || b.p.z > 3) break;
  }
  return { x: b.p.x, z: b.p.z };
}

const dirv = (yaw, pitch, s) =>
  v3(s * Math.sin(yaw) * Math.cos(pitch), s * Math.sin(pitch), s * Math.cos(yaw) * Math.cos(pitch));

export function solveRelease(p0, speed, target, w0, swing) {
  let yaw = Math.atan2(target.x - p0.x, target.z - p0.z);
  let pitch = -Math.atan2(p0.y, target.z - p0.z) * 0.6;
  const f = (y, p) => simulateToBounce(p0, dirv(y, p, speed), w0, swing);
  const h = 1e-3;
  for (let i = 0; i < 8; i++) {
    const r0 = f(yaw, pitch);
    const ex = r0.x - target.x, ez = r0.z - target.z;
    if (Math.abs(ex) < 0.005 && Math.abs(ez) < 0.01) break;
    const ry = f(yaw + h, pitch), rp = f(yaw, pitch + h);
    const a = (ry.x - r0.x) / h, b = (rp.x - r0.x) / h, c = (ry.z - r0.z) / h, d = (rp.z - r0.z) / h;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-9) break;
    yaw -= (d * ex - b * ez) / det;
    pitch -= (-c * ex + a * ez) / det;
  }
  return dirv(yaw, pitch, speed);
}
