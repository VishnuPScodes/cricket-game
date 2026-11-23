// Bat: a solid blade (oriented box) swung on an arc. The swing is kinematic; the
// bat-ball impact is a real collision (impulse with restitution & effective mass that
// depend on where the ball meets the blade). Nothing about the shot result is scripted.
import { v3, add, sub, scale, dot, cross, rotY, len, clamp } from './vec.js';
import { BALL_R, BALL_M } from './physics.js';

export const BAT = { arm: 0.32, handle: 0.30, blade: 0.56, width: 0.108, thick: 0.05, sweet: 0.69 };
export const BLADE_CENTER = BAT.handle + BAT.blade / 2;   // distance hands -> blade centre
const SWEET_Y = -(BAT.sweet - BLADE_CENTER);               // sweet spot in blade-local Y
export const PHI_BACK = -1.9;                              // backlift angle (rad)
const TAU = 0.045;        // swing acceleration time constant (s)
const PHI_BRAKE = 1.0;    // start of follow-through braking
const BRAKE = 260;        // rad/s^2
const BAT_SPEED = 21;     // sweet-spot speed at full swing (m/s)

// Shot type: ideal arc angle at contact and face tilt (+ = face opens upwards).
export const SHOT_TYPES = {
  [-1]: { phiT: -0.12, faceT: -0.14 }, // ground
  [0]: { phiT: 0.05, faceT: 0.0 },     // normal
  [1]: { phiT: 0.3, faceT: 0.32 },     // lofted
};

const arc = (phi) => v3(0, -Math.cos(phi), -Math.sin(phi));
const faceDir = (phi) => v3(0, Math.sin(phi), -Math.cos(phi));

export class Bat {
  constructor() {
    this.P = v3(-0.1, 1.6, -1.5);
    this.Pt = { ...this.P };
    this.shotYaw = 0;
    this.phiT = 0.05; this.faceT = 0;
    this.pitchSens = 0.65; this.yawSens = 0.35;
    this.omegaMax = 25;
    this.reset();
  }

  configure(diff) {
    this.pitchSens = diff.pitchSens;
    this.yawSens = diff.yawSens;
    this.omegaMax = BAT_SPEED / (BAT.arm + BAT.sweet * this.pitchSens);
  }

  reset() {
    this.phi = PHI_BACK; this.omega = 0; this.t = 0;
    this.started = false; this.swinging = false;
    this.cur = this.poseAt(this.phi);
    this.prev = this.cur;
  }

  // Batsman footwork: place the swing so the sweet spot meets the (predicted) ball.
  aimAt(contact, yaw, type, noise) {
    const st = SHOT_TYPES[type];
    this.shotYaw = yaw; this.phiT = st.phiT; this.faceT = st.faceT;
    const n = rotY(faceDir(st.faceT), yaw);
    const ss = sub(contact, scale(n, BALL_R + BAT.thick / 2));
    ss.x = clamp(ss.x + noise.x, -0.65, 1.0);
    ss.y += noise.y;
    const off = add(scale(rotY(arc(st.phiT), yaw), BAT.arm), scale(rotY(arc(st.faceT), yaw), BAT.sweet));
    const P = sub(ss, off);
    P.y = clamp(P.y, 0.95, 2.3);
    this.Pt = P;
  }

  // timingError: seconds early(-)/late(+) vs the ideal press. `assist` (0..1) is how much
  // of that error the batsman instinctively corrects (difficulty's timing window).
  start(timingError = 0, assist = 0) {
    if (this.started) return false;
    this.started = this.swinging = true;
    const corr = Math.abs(timingError) < 0.12 ? timingError * assist : 0;
    if (corr < 0) this.t = corr; // early: hold the backlift a moment longer
    else if (corr > 0) {          // late: bring the bat down from a shorter backlift
      for (let t = 0; t < corr; t += 0.001) {
        this.t += 0.001;
        this.phi += this.omegaMax * (1 - Math.exp(-this.t / TAU)) * 0.001;
      }
    }
    return true;
  }

  // Seconds from pressing swing until the bat reaches the ideal contact angle.
  timeToContact() {
    let t = 0, phi = PHI_BACK;
    while (phi < this.phiT) { t += 0.0005; phi += this.omegaMax * (1 - Math.exp(-t / TAU)) * 0.0005; }
    return t;
  }

  poseAt(phi) {
    const d = phi - this.phiT;
    const phiF = this.faceT + this.pitchSens * d;
    const psi = this.shotYaw + this.yawSens * clamp(d, -0.8, 1.2);
    const u = rotY(arc(phiF), psi);          // hands -> toe
    const Z = rotY(faceDir(phiF), psi);      // face normal
    const Y = scale(u, -1);
    const X = cross(Y, Z);
    const H = add(this.P, scale(rotY(arc(phi), psi), BAT.arm));
    const C = add(H, scale(u, BLADE_CENTER));
    return { H, C, X, Y, Z };
  }

  update(dt) {
    const d = sub(this.Pt, this.P), dl = len(d), step = 4 * dt;
    this.P = dl > step ? add(this.P, scale(d, step / dl)) : { ...this.Pt };
    if (this.swinging) {
      this.t += dt;
      if (this.t < 0) this.omega = 0;
      else if (this.phi < PHI_BRAKE) this.omega = this.omegaMax * (1 - Math.exp(-this.t / TAU));
      else this.omega = Math.max(0, this.omega - BRAKE * dt);
      this.phi += this.omega * dt;
      if (this.phi >= PHI_BRAKE && this.omega === 0) this.swinging = false;
    }
    this.prev = this.cur;
    this.cur = this.poseAt(this.phi);
  }

  static worldPoint(pose, l) {
    return add(add(add(pose.C, scale(pose.X, l[0])), scale(pose.Y, l[1])), scale(pose.Z, l[2]));
  }

  // Sphere vs oriented box. Returns impact info and modifies the ball, or null.
  collide(ball, dt) {
    if (!this.started) return null;
    const c = this.cur;
    const d = sub(ball.p, c.C);
    const lx = dot(d, c.X), ly = dot(d, c.Y), lz = dot(d, c.Z);
    const hx = BAT.width / 2, hy = BAT.blade / 2, hz = BAT.thick / 2;
    const cx = clamp(lx, -hx, hx), cy = clamp(ly, -hy, hy), cz = clamp(lz, -hz, hz);
    const ex = lx - cx, ey = ly - cy, ez = lz - cz;
    const dist = Math.hypot(ex, ey, ez);
    if (dist > BALL_R) return null;
    const nl = dist > 1e-6 ? [ex / dist, ey / dist, ez / dist] : [0, 0, lz >= 0 ? 1 : -1];
    const nW = add(add(scale(c.X, nl[0]), scale(c.Y, nl[1])), scale(c.Z, nl[2]));

    const cl = [cx, cy, cz];
    const cp = Bat.worldPoint(c, cl);
    const vb = scale(sub(cp, Bat.worldPoint(this.prev, cl)), 1 / dt); // bat velocity at contact
    const vrel = sub(ball.v, vb);
    const vn = dot(vrel, nW);
    if (vn >= 0) return null;

    // Impact location: distance from sweet spot along blade, and across the blade.
    const s = cy - SWEET_Y;
    const side = cx / hx;
    const M = (0.25 + 0.85 * Math.exp(-((s / 0.17) ** 2))) * (1 - 0.45 * side * side);
    const e = 0.22 + 0.33 * Math.exp(-((s / 0.2) ** 2));
    const ratio = M / (BALL_M + M);
    const jn = -(1 + e) * vn * ratio;
    const vt = sub(vrel, scale(nW, vn));
    ball.v = add(ball.v, add(scale(nW, jn), scale(vt, -0.35 * ratio)));
    ball.p = add(cp, scale(nW, BALL_R + 0.001));
    ball.w = scale(ball.w, 0.2);
    return { sweetOffset: s, side, edge: Math.abs(nl[0]) > 0.6, batSpeed: len(vb), exitSpeed: len(ball.v) };
  }
}
