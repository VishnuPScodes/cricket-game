// Character animation: drives every Character from the game state each frame.
// Pure visuals. Nothing here feeds back into physics or rules.
import * as THREE from 'three';
import { PHI_BACK } from './bat.js';

const PHI_END = 1.0;
const PHI_BLEND = -0.85; // visual bat equals the physics bat from here on (contact is near phi = 0)

// Bat orientation from the hands->toe direction and a hint for where the face points.
// Same convention as bat.js: local Y = toe->handle, Z = face normal, X = Y x Z.
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();
function batBasis(q, toToe, faceHint) {
  _by.copy(toToe).normalize().negate();
  _bz.copy(faceHint).addScaledVector(_by, -faceHint.dot(_by)).normalize();
  _bx.crossVectors(_by, _bz);
  return q.setFromRotationMatrix(_bm.makeBasis(_bx, _by, _bz));
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Keyframe interpolation with smoothstep between keys; values are numbers.
function keys(arr, u) {
  if (u <= arr[0][0]) return arr[0][1];
  for (let i = 1; i < arr.length; i++) {
    if (u <= arr[i][0]) {
      const [u0, a] = arr[i - 1], [u1, b] = arr[i];
      return lerp(a, b, smooth((u - u0) / (u1 - u0)));
    }
  }
  return arr[arr.length - 1][1];
}
const V = () => new THREE.Vector3();

// ---- reusable poses ----
const strideOf = (v) => clamp(0.1 + v * 0.055, 0.1, 0.55);
function runPose(x, z, yaw, phase, v) {
  const A = strideOf(v), lift = clamp(0.03 + v * 0.03, 0.03, 0.3);
  const s = Math.sin(phase), c = Math.cos(phase);
  const foot = (ph, side) => [side * 0.11, 0.08 + lift * Math.max(0, Math.cos(ph)), A * Math.sin(ph)];
  const arm = clamp(0.06 + v * 0.045, 0.06, 0.38);
  const bend = clamp(v / 7, 0, 1);
  const lean = clamp(0.03 + v * 0.03, 0, 0.32);
  return {
    x, z, yaw, hipY: 0.95 - 0.04 * bend + 0.025 * bend * Math.abs(c), lean, twist: 0.12 * bend * s,
    footL: foot(phase, 1), footR: foot(phase + Math.PI, -1),
    handL: [0.2, lerp(0.88, 1.05, bend) + 0.08 * bend * Math.max(0, -s), 0.05 + lean * 0.4 - arm * s],
    handR: [-0.2, lerp(0.88, 1.05, bend) + 0.08 * bend * Math.max(0, s), 0.05 + lean * 0.4 + arm * s],
    elbowL: [0.3, -0.2, -1], elbowR: [-0.3, -0.2, -1],
    headPitch: -lean * 0.7,
  };
}
// c: 0 = standing relaxed, 1 = crouched "walking in" ready position
function readyPose(x, z, yaw, c) {
  return {
    x, z, yaw, hipY: lerp(0.96, 0.8, c), lean: lerp(0.02, 0.42, c), headPitch: lerp(0, -0.4, c),
    footL: [lerp(0.12, 0.22, c), 0.08, lerp(0, 0.05, c)], footR: [lerp(-0.12, -0.22, c), 0.08, lerp(0, -0.05, c)],
    footYawL: 0.15, footYawR: -0.15,
    kneeL: [0.4, 0, 1], kneeR: [-0.4, 0, 1],
    handL: [lerp(0.24, 0.2, c), lerp(0.9, 0.62, c), lerp(0.03, 0.42, c)],
    handR: [lerp(-0.24, -0.2, c), lerp(0.9, 0.62, c), lerp(0.03, 0.42, c)],
    elbowL: [1, -0.5, -0.4], elbowR: [-1, -0.5, -0.4],
  };
}
function keeperPose(x, z, yaw, c) {
  return {
    x, z, yaw, hipY: lerp(0.9, 0.52, c), lean: lerp(0.15, 0.5, c), headPitch: lerp(-0.1, -0.5, c),
    footL: [0.26, 0.08, 0.02], footR: [-0.26, 0.08, 0.02], footYawL: 0.35, footYawR: -0.35,
    kneeL: [0.8, 0, 1], kneeR: [-0.8, 0, 1],
    handL: [0.07, lerp(1.0, 0.35, c), lerp(0.4, 0.48, c)], handR: [-0.07, lerp(1.0, 0.35, c), lerp(0.4, 0.48, c)],
    elbowL: [1, -0.6, 0], elbowR: [-1, -0.6, 0],
  };
}

// ---- running gait ----
// Per-leg cycle c in [0,1): stance (foot planted, sliding back under the hips at exactly the
// running speed so it stays fixed on the ground) then swing (heel kicks up behind, knee drives
// through, foot reaches forward). The two legs are half a cycle apart, so there is a flight phase.
const STANCE = 0.28;
const cadence = (v) => 2.4 + 0.22 * v;                     // steps per second
const gaitLift = (v) => clamp(0.05 + 0.05 * v, 0.07, 0.38);
function gaitFoot(c, a, lift, side, out) {
  c -= Math.floor(c);
  if (c < STANCE) { out.z = a * (1 - 2 * c / STANCE); out.y = 0.08; out.pitch = 0; }
  else {
    const s = (c - STANCE) / (1 - STANCE);
    out.z = -a + 2 * a * (0.5 - 0.5 * Math.cos(Math.PI * s));
    out.y = 0.08 + lift * Math.sin(Math.PI * s) * (1.15 - 0.5 * s);
    out.pitch = s < 0.6 ? 0.8 * Math.sin((Math.PI * s) / 0.6) : -0.2 * Math.sin((Math.PI * (s - 0.6)) / 0.4);
  }
  out.x = side * 0.09;
  return out;
}
function gaitPose(x, z, yaw, cL, v, lean) {
  const f = cadence(v), a = (v * STANCE) / f, lift = gaitLift(v);
  const L = gaitFoot(cL, a, lift, 1, {}), R = gaitFoot(cL + 0.5, a, lift, -1, {});
  const bend = clamp(v / 7, 0, 1);
  const sL = a > 1e-3 ? clamp(L.z / a, -1, 1) : 0, sR = -sL;
  const arm = 0.08 + 0.035 * v, rise = 0.14 * bend;
  return {
    x, z, yaw, sL,
    hipY: 0.925 - 0.035 * bend - (0.01 + 0.022 * bend) * Math.cos(4 * Math.PI * (cL - STANCE / 2)),
    lean: lean ?? 0.04 + 0.03 * v, headPitch: -(lean ?? 0.1) * 0.7,
    hipYaw: -0.14 * bend * sL, twist: 0.24 * bend * sL,
    footL: [L.x, L.y, L.z], footR: [R.x, R.y, R.z], footPitchL: L.pitch, footPitchR: R.pitch,
    kneeL: [0.1, 0, 1], kneeR: [-0.1, 0, 1],
    // arms pump opposite the legs, elbows bent, hands rising as they come forward
    handL: [0.19, 0.96 + rise * Math.max(0, sR) - 0.03 * bend * Math.max(0, -sR), 0.04 + arm * sR],
    handR: [-0.19, 0.96 + rise * Math.max(0, sL) - 0.03 * bend * Math.max(0, -sL), 0.04 + arm * sL],
    elbowL: [0.3, -0.2, -1], elbowR: [-0.3, -0.2, -1],
  };
}
// root-local point of a pose -> world
function toWorld(p, a, out) {
  const c = Math.cos(p.yaw ?? 0), s = Math.sin(p.yaw ?? 0);
  return out.set(p.x + a[0] * c + a[2] * s, a[1], p.z - a[0] * s + a[2] * c);
}
// Bowling actions. Speeds in m/s: v0 start of the run, v1 at take-off, v2 at release.
// uB/uF: back-foot and front-foot contact as fractions of the gather; ff: front foot z (popping crease -18.9).
const BOWL = {
  pace: { TA: 0.62, v0: 2.4, v1: 6.8, v2: 3.0, bound: 0.15, stride: 0.45, side: -1.45, uB: 0.55, uF: 0.8, ff: -19.02, x0: 0.38, vF: 4.2 },
  spin: { TA: 0.55, v0: 1.2, v1: 3.2, v2: 1.5, bound: 0.05, stride: 0.38, side: -1.2, uB: 0.55, uF: 0.8, ff: -19.0, x0: 0.22, vF: 2.6 },
};

export class Animator {
  constructor(S) {
    this.S = S;
    this.prevState = null;
    this.relT = 0;
    this.lean = 0.3; this.roll = 0;
    this.bowl = { cyc: 0, ftW: null };
    this.fs = S.fielders.map(() => ({ px: null, pz: 0, v: 0, phase: Math.random() * 6, yaw: 0, crouch: 0 }));
    this.ns = { px: null, pz: 0, phase: 0 };
    this.tmp = { a: V(), b: V(), c: V(), d: V(), e: V() };
    this.bw = { fl: V(), fr: V(), hl: V(), hr: V(), kl: V(), kr: V(), e1: V(), e2: V() };
    this.time = 0;
    this.vbat = { H: V(), Hs: V(), Hb: V(), Hf: V(), Y: V(), qF: new THREE.Quaternion(), q: new THREE.Quaternion(), qS: new THREE.Quaternion(),
      qB: new THREE.Quaternion(), qP: new THREE.Quaternion(), m: new THREE.Matrix4(), one: new THREE.Vector3(1, 1, 1) };
  }

  update(g, dt) {
    this.time += dt;
    // time since release: exact while the ball is live, so the hand meets the ball at release
    if (g.state === 'runup') this.relT = 0;
    else if (g.state === 'play') this.relT = g.t;
    else this.relT += dt;
    this.prevState = g.state;
    this.bowler(g, dt);
    this.batsman(g, dt);
    this.fielders(g, dt);
    this.umpire(g);
    this.nonStriker(g, dt);
    for (const { mesh, ch } of this.S.blobs) {
      mesh.position.set(ch.root.position.x, 0.012, ch.root.position.z);
      mesh.visible = ch.root.visible;
    }
  }

  // time until release during the run-up (s); negative after release
  toRelease(g) {
    if (g.state === 'runup' && g.del) return g.del.runup - g.t;
    return -this.relT;
  }

  // ---------------- batsman ----------------
  batsman(g, dt) {
    const ch = this.S.batsman, bat = g.bat, pose = bat.cur, body = g.body, t = this.tmp;
    const s = clamp((bat.phi - PHI_BACK) / (PHI_END - PHI_BACK), 0, 1);
    const released = g.state !== 'runup' && g.state !== 'menu';
    const k = released ? smooth((this.relT - 0.04) / 0.26) : 0; // front-foot stride
    const trig = g.state === 'runup' ? smooth((0.45 - this.toRelease(g)) / 0.3) : 1; // trigger movement
    // ---- visual bat pose ----
    // Before the swing the physics bat is not collidable, so we show a real stance (bat grounded
    // behind the back foot, hands at the waist) and backlift (hands by the back hip, toe up and back).
    // Once the swing starts, the visual bat blends into the physics bat and matches it exactly
    // well before the contact zone, so what you see hitting the ball is the simulated bat.
    const vb = this.vbat;
    const bx = body.x, bz = body.z;
    const lift = g.state === 'menu' ? 0 : g.state === 'runup' ? smooth((0.5 - this.toRelease(g)) / 0.35) : 1;
    // Stance: hands rest against the front thigh, handle leaning towards the bowler, toe grounded
    // just outside the back foot's toe, face square down the pitch.
    vb.Hs.set(bx + 0.27, 0.875, bz - 0.1);
    batBasis(vb.qS, t.a.set(bx + 0.34, 0.02, bz + 0.17).sub(vb.Hs), t.b.set(0.1, 0, -1));
    // Backlift: hands at the hip, just behind the back hip; toe up towards second slip, face open.
    vb.Hb.set(bx + 0.25, 0.98, bz + 0.12);
    batBasis(vb.qB, t.a.set(0.18, 0.72, 0.67), t.b.set(0.85, -0.35, -0.15));
    vb.H.lerpVectors(vb.Hs, vb.Hb, lift);
    vb.q.slerpQuaternions(vb.qS, vb.qB, lift);
    const w = bat.started ? smooth((bat.phi - PHI_BACK) / (PHI_BLEND - PHI_BACK)) : 0;
    if (w > 0) {
      vb.m.makeBasis(t.a.set(pose.X.x, pose.X.y, pose.X.z), t.b.set(pose.Y.x, pose.Y.y, pose.Y.z), t.c.set(pose.Z.x, pose.Z.y, pose.Z.z));
      vb.qP.setFromRotationMatrix(vb.m);
      vb.H.lerp(t.d.set(pose.H.x, pose.H.y, pose.H.z), w);
      vb.q.slerp(vb.qP, w);
    }
    // Follow-through: once the bat is past the contact zone, finish high over the front shoulder.
    const wf = bat.started ? smooth((bat.phi - 0.45) / (PHI_END + 0.1 - 0.45)) : 0;
    if (wf > 0) {
      const yaw = bat.shotYaw * 0.6;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const rot = (x, z) => [x * c + z * sn, -x * sn + z * c];
      const [hx0, hz0] = rot(0.12, -0.3);
      vb.Hf.set(bx + hx0, 1.5 + 0.12 * g.shot, bz + hz0);
      const [ux, uz] = rot(-0.25, 0.85);
      batBasis(vb.qF, t.a.set(ux, 0.45 + 0.15 * g.shot, uz), t.b.set(0.2, -1, -0.3));
      vb.H.lerp(vb.Hf, wf);
      vb.q.slerp(vb.qF, wf);
    }
    this.S.bat.matrix.compose(vb.H, vb.q, vb.one);
    // hands wrap the handle: top (left) glove just under the knob, bottom (right) glove touching it
    const Y = vb.Y.set(0, 1, 0).applyQuaternion(vb.q);
    const H = vb.H;
    const top = t.c.copy(H).addScaledVector(Y, -0.06);
    const bot = t.d.copy(H).addScaledVector(Y, -0.155);
    // Front-foot stride towards the line of the ball (root-local: +x = towards the bowler, +z = off side).
    const strideX = clamp(bz - bat.Pt.z + 0.12, 0.42, 0.72);
    const strideZ = clamp(bat.Pt.x - bx - 0.2, 0.06, 0.45);
    const ft = wf; // follow-through amount
    const p = {
      x: body.x, z: body.z, yaw: Math.PI / 2,
      // knees flexed in the stance; the front knee bends further into the stride
      // athletic stance: hips flexed and pushed back, chest over the knees, weight on the balls of the feet
      hipY: 0.835 - 0.02 * trig - 0.1 * k + 0.03 * ft, hipX: 0.04 + 0.2 * k, hipZ: -0.03 + 0.05 * k,
      hipYaw: 0.08 + 0.5 * s, hipRoll: -0.06 * k, hipPitch: 0.2 - 0.08 * k,
      twist: 0.06 + 0.3 * s,
      // trigger: back foot moves a little back and across
      footR: [-0.25 + 0.03 * trig, 0.08 + 0.05 * ft, 0.06 + 0.04 * trig], footYawR: 0.05 + 0.5 * ft, footPitchR: -0.55 * ft,
      footL: [lerp(0.22, strideX, k), 0.08 + 0.1 * Math.sin(Math.PI * k), lerp(0.08, strideZ, k)], footYawL: 0.35 + 0.15 * k,
      // knees point over the toes (towards point), not splayed
      kneeL: [0.45, 0, 1], kneeR: [-0.05, 0, 1],
      handL: top, handR: bot, gripQ: vb.q,
      // top-hand elbow points at the bowler and stays high through the shot; bottom elbow tucked in
      elbowL: [1, lerp(-0.4, 0.5, Math.max(lift, w)), 0.35], elbowR: [-0.35, -1, lerp(0.25, -0.2, lift)],
    };
    // Bend the spine so both hands can reach the bat (small grid search, then smoothed).
    ch.setFK({ ...p, lean: 0, roll: 0 });
    const mid = t.e.addVectors(top, bot).multiplyScalar(0.5);
    let best = Infinity, bl = this.lean, br = this.roll;
    const sL = V(), sR = V(), sc = V();
    for (let i = 0; i <= 12; i++) {
      const lean = -0.1 + i * 0.08;
      for (let j = 0; j <= 10; j++) {
        const roll = -0.5 + j * 0.1;
        ch.spine.rotation.x = lean; ch.spine.rotation.z = roll;
        ch.spine.updateMatrixWorld(true);
        ch.mk.sL.getWorldPosition(sL); ch.mk.sR.getWorldPosition(sR);
        sc.addVectors(sL, sR).multiplyScalar(0.5);
        const dL = sL.distanceTo(top), dR = sR.distanceTo(bot), dC = sc.distanceTo(mid);
        const cost = 12 * Math.max(0, dL - 0.53) ** 2 + 12 * Math.max(0, dR - 0.53) ** 2
          + 0.6 * (dC - 0.38) ** 2 + 0.04 * (lean - 0.36) ** 2 + 0.03 * roll * roll;
        if (cost < best) { best = cost; bl = lean; br = roll; }
      }
    }
    const kk = 1 - Math.exp(-28 * dt);
    this.lean = lerp(this.lean, bl, kk); this.roll = lerp(this.roll, br, kk);
    p.lean = this.lean; p.roll = this.roll;
    // head: eyes level, watching the bowler's hand during the run-up and the ball after release
    ch.pose(p);
    if (g.state !== 'menu') {
      const look = g.state === 'runup' ? this.S.bowler.handW.R : t.a.set(g.ball.p.x, g.ball.p.y, g.ball.p.z);
      const hq = ch.head.quaternion;
      ch.head.lookAt(look);
      // limit how far the neck can turn from neutral
      const ang = 2 * Math.acos(Math.min(1, Math.abs(hq.w)));
      if (ang > 1.75) hq.slerp(t.q0 || (t.q0 = new THREE.Quaternion()), 1 - 1.75 / ang);
      ch.head.updateMatrixWorld(true);
    }
  }

  // ---------------- bowler ----------------
  // Run-up: a real running gait (planted feet, flight phase, arm pump) accelerating to the crease.
  // Gather: take off from the left foot into the bound, turn side-on in the air with the front arm
  // reaching high, land on the back foot parallel to the crease, then the braced front leg lands and
  // hips then shoulders whip round as the straight bowling arm comes over the top. Follow-through:
  // the arm sweeps down across the body, the back leg drives through, and the bowler peels away.
  bowler(g, dt) {
    const ch = this.S.bowler, st = this.bowl;
    const d = g.del;
    if (!d) { ch.pose(readyPose(0.6, -31, 0, 0)); return; }
    const P = d.spinner ? BOWL.spin : BOWL.pace;
    const R = d.runup, TA = P.TA, Tr = R - TA, { v0, v1, v2, uB, uF } = P;
    const aR = (v1 - v0) / Tr;
    const gz = (u) => TA * (v1 * u + 0.5 * (v2 - v1) * u * u); // distance travelled into the gather
    const zG = P.ff - P.stride - gz(uF);                         // hips at take-off
    const zStart = zG - (v0 * Tr + 0.5 * aR * Tr * Tr);
    const runZ = (tau) => zStart + v0 * tau + 0.5 * aR * tau * tau;
    const f0 = cadence(v0), f1 = cadence(v1);
    const cyc = (tau) => 0.5 * (f0 * tau + 0.5 * (f1 - f0) * tau * tau / Tr);
    const phi0 = STANCE - cyc(Tr); // the left foot leaves the ground exactly at take-off
    const x0 = P.x0;
    const leanRun = (tau) => lerp(0.32, 0.1, smooth(tau / Tr));
    const runPoseAt = (tau) => {
      const p = gaitPose(x0, runZ(tau), 0, phi0 + cyc(tau), v0 + aR * tau, leanRun(tau));
      // ball cradled at the chest, brought up under the chin over the last strides
      const k = smooth((tau - (Tr - 0.5)) / 0.45);
      p.handR = [lerp(-0.14, -0.06, k), lerp(1.1, 1.36, k) + 0.05 * (1 - k) * p.sL, lerp(0.24, 0.2, k) + 0.06 * (1 - k) * p.sL];
      p.elbowR = [-1, -0.6, -0.3];
      return p;
    };
    const tr = this.toRelease(g);
    if (g.state === 'menu') { ch.pose(readyPose(x0, zStart, 0, 0)); return; }

    if (g.state === 'runup' && tr > TA) {
      ch.pose(runPoseAt(Math.max(0, R - tr)));
      return;
    }
    // hips and feet at the key moments of the action
    const rootG = (u) => zG + gz(u);
    const aT = (v1 * STANCE) / f1, lift1 = gaitLift(v1);
    const L0 = gaitFoot(STANCE, aT, lift1, 1, {}), R0 = gaitFoot(STANCE + 0.5, aT, lift1, -1, {});
    const zTake = zG - aT;                      // left (take-off) foot
    const fb = rootG(uB) + 0.2;                 // back foot lands just ahead of the hips (leaning back)
    const ff = P.ff;                            // front foot lands on the popping crease
    const xL = x0 + 0.04, xR = x0 - 0.02;
    if (g.state === 'runup') {
      const u = clamp(1 - tr / TA, 0, 1);
      const B = this.bw, z = rootG(u);
      const yaw = keys([[0, 0], [0.2, -0.55], [0.45, P.side], [uB, P.side], [uF, P.side + 0.3], [0.92, P.side * 0.45], [1, -0.25]], u);
      const twist = keys([[0, 0], [0.45, -0.1], [uF, -0.32], [0.93, -0.05], [1, 0.15]], u);
      const p = {
        x: x0, z, yaw, twist,
        hipY: keys([[0, 0.86], [0.24, 0.86 + P.bound], [0.42, 0.86 + P.bound * 0.75], [uB, 0.84], [0.68, 0.81], [uF, 0.86], [1, 0.95]], u),
        lean: keys([[0, 0.1], [0.25, 0.02], [uB, -0.2], [uF - 0.04, -0.16], [uF, -0.06], [1, 0.28]], u),
        roll: keys([[0, 0], [uB, 0.12], [uF, 0.15], [0.93, -0.08], [1, -0.3]], u),
        headYaw: -(yaw + twist) * 0.92, headPitch: keys([[0, -0.05], [uB, 0.12], [1, 0.0]], u),
      };
      // front (left) foot: drives the knee up in the bound, reaches out and lands braced
      if (u < uF) {
        const dz = keys([[0, -aT], [0.25, 0.18], [uB, 0.1], [0.7, 0.32], [uF, P.stride]], u);
        const y = keys([[0, 0.08], [0.25, 0.44], [uB, 0.36], [0.72, 0.2], [uF, 0.08]], u);
        B.fl.set(lerp(x0 + 0.09, xL, smooth(u / uF)), y, u < 0.02 ? zTake : z + dz);
      } else B.fl.set(xL, 0.08, ff);
      // back (right) foot: swings through in the air, lands side-on, then drags towards the crease
      if (u < uB) {
        const dz = keys([[0, R0.z], [0.22, 0.28], [0.4, 0.34], [uB, fb - rootG(uB)]], u);
        const y = keys([[0, R0.y], [0.2, 0.32], [0.4, 0.18], [uB, 0.08]], u);
        B.fr.set(lerp(x0 - 0.09, xR, smooth(u / uB)), y, z + dz);
      } else {
        const k = smooth((u - uF) / (1 - uF));
        B.fr.set(xR, 0.08 + 0.03 * k, fb + 0.28 * k);
      }
      p.footL = B.fl; p.footR = B.fr;
      p.footYawL = keys([[0, 0], [uF, -0.25], [1, -0.25]], u) - yaw;
      p.footYawR = keys([[0, 0], [0.35, -1.1], [uB, -1.45], [1, -1.45]], u) - yaw;
      p.footPitchR = keys([[0, R0.pitch], [0.3, 0.3], [uB, 0], [uF, 0], [1, 0.65]], u);
      p.footPitchL = keys([[0, L0.pitch], [0.25, 0.5], [0.72, -0.1], [uF, 0]], u);
      p.kneeL = B.kl.set(0, 0.25, 1); p.kneeR = B.kr.set(-0.5, 0, 0.85);
      // bowling arm: windmill in the vertical plane along the pitch (beta: 0 up, pi/2 forward, pi down)
      const beta = keys([[0, 1.75], [0.22, 1.45], [0.36, 1.75], [uB, 3.5], [0.68, 4.1], [uF, 4.6], [1, 2 * Math.PI + 0.14]], u);
      const r = keys([[0, 0.22], [0.3, 0.24], [0.45, 0.4], [uB, 0.52], [0.68, 0.566], [1, 0.568]], u);
      const xr = keys([[0, 0.1], [0.35, 0.1], [uB, -0.02], [1, 0.07]], u);
      // front arm: reaches high towards the batsman in the bound, then pulls down hard to the hip
      const betaL = keys([[0, 2.3], [0.15, 1.3], [0.32, 0.35], [uB, 0.3], [uF, 0.6], [0.9, 1.9], [1, 2.8]], u);
      const rL = keys([[0, 0.3], [0.3, 0.56], [uF, 0.56], [1, 0.42]], u);
      const xl = keys([[0, 0], [uF, 0], [1, 0.14]], u);
      p.handR = (sh) => B.hr.set(sh.x + xr, sh.y + r * Math.cos(beta), sh.z + r * Math.sin(beta));
      p.handL = (sh) => B.hl.set(sh.x + xl, sh.y + rL * Math.cos(betaL), sh.z + rL * Math.sin(betaL));
      p.elbowR = [-1, -0.6, -0.4]; p.elbowL = [1, -0.6, -0.2];
      // ease out of the running gait over the first part of the take-off
      const k = smooth(u / 0.18);
      if (k < 1) this.poseBlend(ch, runPoseAt(Tr + u * TA), p, k);
      else ch.pose(p);
      return;
    }

    // ---- follow-through ----
    const w = this.relT;
    const zRel = rootG(1), tau0 = 0.9, vF = P.vF;
    const fz = (s) => zRel + vF * tau0 * (1 - Math.exp(-s / tau0));
    const fx = (s) => x0 + 1.5 * smooth(s / 1.6); // peel away to the off side, off the pitch
    const W1 = 0.24;
    const vAt = (s) => Math.hypot(vF * Math.exp(-s / tau0), (fx(s + 0.01) - fx(s - 0.01)) / 0.02);
    const B = this.bw;
    // gait that takes over once the back leg has come through (right foot starts its stance)
    if (st.ftW == null || w < st.ftW) st.cyc = 0.5;
    else st.cyc += dt * cadence(vAt(w)) / 2;
    st.ftW = w;
    const gaitAt = (s) => {
      const yawT = Math.atan2(fx(s + 0.02) - fx(s), fz(s + 0.02) - fz(s));
      const p = gaitPose(fx(s), fz(s), yawT, st.cyc, Math.max(0.3, vAt(s)), 0.25);
      return p;
    };
    if (w < W1) {
      const yaw = keys([[0, -0.25], [0.1, 0.35], [W1, 0.3]], w);
      const twist = keys([[0, 0.15], [0.1, 0.32], [W1, 0.05]], w);
      // where the gait wants the feet when it takes over
      const gEnd = gaitAt(W1);
      const ge = toWorld(gEnd, gEnd.footR, B.e1), gl = toWorld(gEnd, gEnd.footL, B.e2);
      const s1 = smooth(w / W1);
      const fbDrag = fb + 0.28;
      B.fr.set(lerp(xR, ge.x, s1), 0.08 + 0.34 * Math.sin(Math.PI * Math.min(1, w / W1)), lerp(fbDrag, ge.z, s1));
      const kl = smooth((w - 0.14) / (W1 - 0.14));
      B.fl.set(lerp(xL, gl.x, kl), lerp(0.08, gl.y, kl), lerp(ff, gl.z, kl));
      const beta = keys([[0, 2 * Math.PI + 0.14], [0.08, 7.6], [0.18, 8.9], [W1, 9.1]], w);
      const r = keys([[0, 0.568], [W1, 0.5]], w);
      const xr = keys([[0, 0.07], [0.18, 0.42], [W1, 0.38]], w);
      const betaL = keys([[0, 2.8], [0.12, 3.8], [W1, 3.6]], w);
      const p = {
        x: fx(w), z: fz(w), yaw, twist,
        hipY: keys([[0, 0.95], [0.1, 0.8], [W1, 0.85]], w),
        lean: keys([[0, 0.28], [0.1, 0.82], [W1, 0.4]], w),
        roll: keys([[0, -0.3], [0.12, -0.1], [W1, 0]], w),
        headYaw: -(yaw + twist) * 0.7, headPitch: keys([[0, 0], [0.1, -0.35], [W1, -0.1]], w),
        footL: B.fl, footR: B.fr, footYawL: -0.25 - yaw, footYawR: lerp(-1.45, 0.3, s1) - yaw,
        footPitchR: keys([[0, 0.65], [0.1, 0.6], [W1, 0]], w),
        kneeL: B.kl.set(0, 0.2, 1), kneeR: B.kr.set(0, 0, 1),
        handR: (sh) => B.hr.set(sh.x + xr, sh.y + r * Math.cos(beta), sh.z + r * Math.sin(beta)),
        handL: (sh) => B.hl.set(sh.x + 0.14, sh.y + 0.43 * Math.cos(betaL), sh.z + 0.43 * Math.sin(betaL)),
        elbowR: [-1, -0.6, -0.4], elbowL: [1, -0.6, -0.2],
      };
      ch.pose(p);
      return;
    }
    // decelerating run-off, arms blending back into the gait, then standing and turning back
    const pg = gaitAt(w);
    const stand = readyPose(fx(w), fz(w), 0.4, 0);
    const kStand = smooth((w - 1.5) / 0.5);
    if (w < W1 + 0.2) {
      // hands come out of the follow-through into the running arm swing
      const k = smooth((w - W1) / 0.2);
      const pf = { ...pg, handR: [lerp(0.15, pg.handR[0], k), lerp(0.75, pg.handR[1], k), lerp(0.35, pg.handR[2], k)],
        handL: [lerp(0.3, pg.handL[0], k), lerp(0.85, pg.handL[1], k), lerp(-0.2, pg.handL[2], k)] };
      ch.pose(pf);
    } else if (kStand > 0) this.poseBlend(ch, pg, stand, kStand);
    else ch.pose(pg);
  }

  // Blend two poses: scalars are interpolated; feet and hands are resolved to world positions first.
  poseBlend(ch, pA, pB, k) {
    const bl = this.blend ??= { a: {}, b: {} };
    ch.pose(pA);
    for (const s of ['L', 'R']) { (bl.a['h' + s] ??= V()).copy(ch.handW[s]); (bl.a['f' + s] ??= V()).copy(ch.L[s].foot.position); }
    ch.pose(pB);
    for (const s of ['L', 'R']) { (bl.b['h' + s] ??= V()).copy(ch.handW[s]); (bl.b['f' + s] ??= V()).copy(ch.L[s].foot.position); }
    const p = { ...pB };
    for (const key of ['x', 'z', 'hipY', 'hipX', 'hipZ', 'lean', 'twist', 'roll', 'hipYaw', 'hipPitch', 'hipRoll', 'headYaw', 'headPitch',
      'footYawL', 'footYawR', 'footPitchL', 'footPitchR']) {
      const a = pA[key] ?? 0, b = pB[key] ?? 0;
      p[key] = lerp(a, b, k);
    }
    p.yaw = (pA.yaw ?? 0) + wrap((pB.yaw ?? 0) - (pA.yaw ?? 0)) * k;
    for (const s of ['L', 'R']) {
      p['hand' + s] = (bl['h' + s] ??= V()).lerpVectors(bl.a['h' + s], bl.b['h' + s], k);
      p['foot' + s] = (bl['f' + s] ??= V()).lerpVectors(bl.a['f' + s], bl.b['f' + s], k);
    }
    ch.pose(p);
  }

  // ---------------- fielders & keeper ----------------
  fielders(g, dt) {
    const b = g.ball.p;
    const tr = this.toRelease(g);
    const alert = (g.state === 'runup' && tr < 0.7) || (g.state === 'play' && !g.batHit);
    g.fielders.forEach((f, i) => {
      const ch = this.S.fielders[i], st = this.fs[i];
      if (st.px == null || g.state === 'runup' && Math.hypot(f.x - st.px, f.z - st.pz) > 3) { st.px = f.x; st.pz = f.z; }
      const dx = f.x - st.px, dz = f.z - st.pz, d = Math.hypot(dx, dz);
      st.px = f.x; st.pz = f.z;
      st.v = lerp(st.v, dt > 0 ? d / dt : 0, 0.25);
      st.crouch = lerp(st.crouch, alert ? 1 : 0, 1 - Math.exp(-6 * dt));
      let p;
      if (st.v > 0.6) {
        if (d > 1e-4) st.yaw = Math.atan2(dx, dz);
        st.phase += (d * Math.PI) / (2 * strideOf(st.v));
        p = runPose(f.x, f.z, st.yaw, st.phase, st.v);
      } else {
        const look = g.batHit && g.state !== 'runup' ? b : { x: 0, z: i === 0 ? -20 : -1 };
        st.yaw = Math.atan2(look.x - f.x, look.z - f.z);
        p = i <= 1 ? keeperPose(f.x, f.z, st.yaw, i === 0 ? st.crouch : st.crouch * 0.6) : readyPose(f.x, f.z, st.yaw, st.crouch);
      }
      ch.pose(p);
    });
  }

  // ---------------- umpire ----------------
  umpire(g) {
    const ch = this.S.umpire, m = g.state === 'result' || g.state === 'end' ? g.message : '';
    const p = readyPose(-0.1, -22.3, 0, g.state === 'runup' ? 0.35 : 0.15);
    p.handL = [0.05, 0.95, 0.24]; p.handR = [-0.05, 0.95, 0.24];
    p.elbowL = [1, -0.3, 0]; p.elbowR = [-1, -0.3, 0];
    const t = this.time;
    if (/BOWLED|CAUGHT|LBW/.test(m) && !/NOT OUT/.test(m)) { p.handR = [-0.12, 2.08, 0.12]; p.lean = -0.05; }
    else if (/SIX/.test(m)) { p.handL = [0.14, 2.08, 0.05]; p.handR = [-0.14, 2.08, 0.05]; }
    else if (/FOUR/.test(m)) { p.handR = [lerp(-0.6, 0.25, 0.5 + 0.5 * Math.sin(t * 9)), 1.42, 0.38]; p.elbowR = [-0.5, -1, 0]; }
    else if (/WIDE/.test(m)) { p.handL = [0.76, 1.45, 0.05]; p.handR = [-0.76, 1.45, 0.05]; }
    else if (/NO BALL/.test(m)) { p.handR = [-0.76, 1.45, 0.05]; }
    ch.pose(p);
  }

  // ---------------- non-striker ----------------
  nonStriker(g, dt) {
    const ch = this.S.nonStriker, st = this.ns, t = this.tmp;
    const tr = this.toRelease(g);
    const walkT = g.state === 'runup' ? 0.7 - tr : g.state === 'menu' ? 0 : 0.7 + this.relT;
    const z = -19.7 + 1.7 * smooth(walkT / 1.6);
    const x = -1.35;
    if (st.px == null || Math.abs(z - st.pz) > 1) st.pz = z;
    const dz = z - st.pz;
    st.pz = z;
    const v = dt > 0 ? Math.abs(dz) / dt : 0;
    let p;
    if (v > 0.3) { st.phase += (Math.abs(dz) * Math.PI) / (2 * strideOf(v)); p = runPose(x, z, 0, st.phase, v); }
    else p = readyPose(x, z, 0, 0.1);
    p.handR = [-0.26, 0.86, 0.16]; p.handL = [0.2, 0.9, 0.06];
    p.elbowR = [-1, -0.3, -0.3];
    ch.pose(p);
    // bat held in the right hand, toe pointing down and forward
    const hand = ch.handW.R;
    const fwd = t.a.set(0, 0, 1).applyQuaternion(ch.root.quaternion);
    const toe = t.b.copy(hand).add(t.c.set(0, -0.8, 0)).addScaledVector(fwd, 0.35);
    const up = t.c.subVectors(hand, toe).normalize();
    const bat2 = this.S.bat2;
    bat2.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, up);
    bat2.position.copy(hand).addScaledVector(up, 0.08);
  }
}
