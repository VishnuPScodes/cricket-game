// Cricket ball physics: gravity, drag, Magnus (spin), seam swing, bounce with friction.
// World units: metres, seconds. Batting stumps at z = 0, bowler's stumps at z = -20.12.
// +x = off side for a right-handed batsman, +y = up. The delivered ball travels towards +z.
import { v3, copy, cross, len } from './vec.js';

export const G = 9.81;
export const BALL_R = 0.036;
export const BALL_M = 0.16;
const RHO = 1.2;
const AREA = Math.PI * BALL_R * BALL_R;
const CD = 0.40;
export const K_DRAG = (0.5 * RHO * CD * AREA) / BALL_M;      // a = -K|v|v
export const K_MAGNUS = (RHO * AREA * BALL_R) / (2 * BALL_M); // a = K (w x v)

export const STUMPS = { halfWidth: 0.1143, height: 0.711, z: 0, bowlerZ: -20.12 };
export const PITCH = { halfWidth: 1.525, zMin: -21.6, zMax: 1.5, e: 0.52, mu: 0.30, roll: 0.8 };
export const OUTFIELD = { e: 0.38, mu: 0.55, roll: 2.6 };

export function surfaceAt(p) {
  const onPitch = Math.abs(p.x) < PITCH.halfWidth && p.z > PITCH.zMin && p.z < PITCH.zMax;
  return onPitch ? PITCH : OUTFIELD;
}

export class Ball {
  constructor() { this.reset(); }
  reset() {
    this.p = v3(); this.v = v3(); this.w = v3(); // position, velocity, spin (rad/s)
    this.swing = 0;      // lateral swing acceleration (m/s^2), + = towards off side
    this.swingOn = false;
    this.seamKick = 0;   // lateral m/s added off the seam at first bounce
    this.bounces = 0;
    this.rolling = false;
    this.stopped = false;
    this.firstBounce = null;
  }
  clone() {
    const b = new Ball();
    Object.assign(b, this, { p: copy(this.p), v: copy(this.v), w: copy(this.w) });
    return b;
  }
}

export function stepBall(b, dt) {
  if (b.stopped) return;
  const r = BALL_R;

  if (b.rolling) {
    const s = surfaceAt(b.p);
    const hs = Math.hypot(b.v.x, b.v.z);
    const dec = (s.roll + K_DRAG * hs * hs) * dt;
    if (hs <= dec) { b.v = v3(); b.stopped = true; return; }
    const k = (hs - dec) / hs;
    b.v.x *= k; b.v.z *= k; b.v.y = 0;
    b.p.x += b.v.x * dt; b.p.z += b.v.z * dt; b.p.y = r;
    b.w = v3(b.v.z / r, 0, -b.v.x / r); // pure rolling
    return;
  }

  const sp = len(b.v);
  let ax = -K_DRAG * sp * b.v.x;
  let ay = -G - K_DRAG * sp * b.v.y;
  let az = -K_DRAG * sp * b.v.z;
  const m = cross(b.w, b.v);
  ax += K_MAGNUS * m.x; ay += K_MAGNUS * m.y; az += K_MAGNUS * m.z;
  if (b.swingOn && b.bounces === 0) {
    const hs = Math.hypot(b.v.x, b.v.z);
    if (hs > 1) { ax += (b.swing * b.v.z) / hs; az += (-b.swing * b.v.x) / hs; }
  }
  b.v.x += ax * dt; b.v.y += ay * dt; b.v.z += az * dt;
  b.p.x += b.v.x * dt; b.p.y += b.v.y * dt; b.p.z += b.v.z * dt;
  const decay = 1 - 0.05 * dt;
  b.w.x *= decay; b.w.y *= decay; b.w.z *= decay;

  if (b.p.y < r) {
    b.p.y = r;
    if (b.v.y < 0) bounce(b);
  }
}

// Impulse-based bounce: restitution on the normal, Coulomb friction at the contact
// point (which includes spin), so spin genuinely makes the ball turn and grip.
function bounce(b) {
  const s = surfaceAt(b.p);
  const r = BALL_R;
  const jn = -(1 + s.e) * b.v.y;
  b.v.y = -s.e * b.v.y;

  // contact-point slip velocity = v + w x (0,-r,0)
  const sx = b.v.x + b.w.z * r;
  const sz = b.v.z - b.w.x * r;
  const sm = Math.hypot(sx, sz);
  if (sm > 1e-6) {
    const dv = Math.min(s.mu * jn, (2 / 7) * sm); // 2/7 = slip removed for a solid sphere to roll
    const dvx = (-sx / sm) * dv, dvz = (-sz / sm) * dv;
    b.v.x += dvx; b.v.z += dvz;
    const k = 5 / (2 * r * r);
    b.w.x += -r * dvz * k;
    b.w.z += r * dvx * k;
  }
  if (b.bounces === 0 && b.seamKick) b.v.x += b.seamKick;
  if (!b.firstBounce) b.firstBounce = { x: b.p.x, z: b.p.z };
  b.bounces++;
  if (b.v.y < 0.5) { b.v.y = 0; b.rolling = true; }
}

export function hitsStumps(p, zS = STUMPS.z) {
  return (
    Math.abs(p.z - zS) < 0.02 + BALL_R &&
    Math.abs(p.x) < STUMPS.halfWidth + BALL_R &&
    p.y < STUMPS.height + 0.015 + BALL_R
  );
}
