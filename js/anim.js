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

export class Animator {
  constructor(S) {
    this.S = S;
    this.prevState = null;
    this.relT = 0;
    this.lean = 0.3; this.roll = 0;
    this.bowl = { phase: 0, prevZ: null };
    this.fs = S.fielders.map(() => ({ px: null, pz: 0, v: 0, phase: Math.random() * 6, yaw: 0, crouch: 0 }));
    this.ns = { px: null, pz: 0, phase: 0 };
    this.tmp = { a: V(), b: V(), c: V(), d: V(), e: V() };
    this.bw = { fl: V(), fr: V(), hl: V(), hr: V(), plantR: 0, plantL: 0, relZ: -19.2, relX: 0.55 };
    this.time = 0;
    this.vbat = { H: V(), Hs: V(), Hb: V(), Hf: V(), Y: V(), qF: new THREE.Quaternion(), q: new THREE.Quaternion(), qS: new THREE.Quaternion(),
      qB: new THREE.Quaternion(), qP: new THREE.Quaternion(), m: new THREE.Matrix4(), one: new THREE.Vector3(1, 1, 1) };
  }

  update(g, dt) {
    this.time += dt;
    if (g.state === 'runup') this.relT = 0;
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
      hipY: 0.845 - 0.02 * trig - 0.1 * k + 0.03 * ft, hipX: 0.04 + 0.2 * k, hipZ: 0.04 + 0.03 * k,
      hipYaw: 0.08 + 0.5 * s, hipRoll: -0.06 * k, hipPitch: 0.06 + 0.06 * k,
      twist: 0.06 + 0.3 * s,
      // trigger: back foot moves a little back and across
      footR: [-0.25 + 0.03 * trig, 0.08 + 0.05 * ft, 0.06 + 0.04 * trig], footYawR: 0.05 + 0.5 * ft, footPitchR: -0.55 * ft,
      footL: [lerp(0.22, strideX, k), 0.08 + 0.1 * Math.sin(Math.PI * k), lerp(0.08, strideZ, k)], footYawL: 0.35 + 0.15 * k,
      kneeL: [0.9, 0.1, 1], kneeR: [-0.3, 0, 1],
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
  bowler(g, dt) {
    const ch = this.S.bowler, B = this.bw, st = this.bowl;
    const d = g.del;
    if (!d) { ch.pose(readyPose(0.6, -30, 0, 0)); return; }
    const pace = !d.spinner;
    const R = d.runup, TA = pace ? 0.55 : 0.5, D = pace ? 10 : 4.5, dS = pace ? 2.6 : 1.6;
    const zR = B.relZ, x0 = B.relX;
    const v1 = (D - dS) / (R - TA);
    const bq = (v1 * TA - dS) / (TA * TA), aq = Math.max(0, v1 - 2 * bq * TA);
    const distLeft = (tr) => (tr > TA ? dS + v1 * (tr - TA) : aq * tr + bq * tr * tr);
    const tr = this.toRelease(g);
    let p;
    if (g.state === 'runup' || g.state === 'menu') {
      const z = zR - distLeft(Math.max(0, tr));
      const dz = st.prevZ == null || g.state === 'menu' || Math.abs(z - st.prevZ) > 1 ? 0 : z - st.prevZ;
      st.prevZ = z;
      const v = dt > 0 ? Math.abs(dz) / dt : 0;
      if (g.state === 'menu') { ch.pose(readyPose(x0, zR - D, 0, 0)); return; }
      if (tr > TA) {
        st.phase += (dz * Math.PI) / (2 * strideOf(v));
        p = runPose(x0, z, 0, st.phase, v);
        p.handR = [-0.18, 1.05, 0.25]; // ball held near chest during the run
      } else {
        const u = 1 - tr / TA;
        const zAt = (uu) => zR - distLeft(TA * (1 - uu));
        const yaw = keys([[0, 0], [0.3, -0.6], [0.55, -1.35], [0.8, -1.25], [1, -0.3]], u);
        p = {
          x: x0, z, yaw,
          hipY: keys([[0, 0.93], [0.25, 1.08], [0.4, 1.14], [0.58, 0.97], [0.85, 0.92], [1, 0.86]], u),
          lean: keys([[0, 0.2], [0.35, -0.05], [0.7, -0.25], [0.9, 0.0], [1, 0.45]], u),
          roll: keys([[0, 0], [0.7, 0.25], [1, -0.15]], u),
          headYaw: -yaw * 0.85, headPitch: 0.05,
          kneeL: [0.2, 0, 1], kneeR: [-0.2, 0, 1],
        };
        // back (right) foot lands at u=0.58, front (left) foot at u=0.85; planted feet stay fixed in world
        if (u < 0.58) B.fr.set(x0 - 0.1, keys([[0, 0.2], [0.3, 0.35], [0.5, 0.16], [0.58, 0.08]], u), z + keys([[0, -0.45], [0.3, -0.3], [0.58, -0.1]], u));
        else B.fr.set(x0 - 0.1, 0.08, zAt(0.58) + 0.05);
        if (u < 0.85) B.fl.set(x0 + 0.12, keys([[0, 0.08], [0.3, 0.42], [0.55, 0.48], [0.75, 0.3], [0.85, 0.08]], u), z + keys([[0, 0.35], [0.3, 0.25], [0.55, 0.45], [0.85, 0.6]], u));
        else B.fl.set(x0 + 0.12, 0.08, zAt(0.85) + 0.6);
        p.footR = B.fr; p.footL = B.fl;
        p.footYawR = -yaw - 1.2; p.footYawL = -yaw * 0.6;
        const beta = keys([[0, 2.3], [0.35, 2.7], [0.55, 3.4], [0.75, 4.9], [1, 6.5]], u);
        const r = keys([[0, 0.3], [0.35, 0.32], [0.55, 0.55], [0.7, 0.6]], u);
        const betaL = keys([[0, 2.4], [0.35, 1.3], [0.6, 0.35], [0.85, 0.5], [1, 2.2]], u);
        const rL = keys([[0, 0.3], [0.4, 0.55], [0.85, 0.58], [1, 0.4]], u);
        p.handR = (sh) => B.hr.set(sh.x - 0.05, sh.y + r * Math.cos(beta), sh.z + r * Math.sin(beta));
        p.handL = (sh) => B.hl.set(sh.x + 0.08, sh.y + rL * Math.cos(betaL), sh.z + rL * Math.sin(betaL));
        p.elbowR = [-1, 0, 0]; p.elbowL = [1, -0.5, 0];
        B.plantL = zAt(0.85) + 0.6;
      }
    } else {
      // follow-through: carry on across the pitch, decelerate, peel off to the off side
      const w = this.relT;
      const z = zR + 2.0 * (1 - Math.exp(-w / 0.6));
      const x = x0 + 1.4 * smooth(w / 1.4);
      const dz = st.prevZ == null ? 0 : z - st.prevZ;
      st.prevZ = z;
      if (w < 0.4) {
        const yaw = keys([[0, -0.3], [0.2, 0.35], [0.4, 0.3]], w);
        B.fl.set(x0 + 0.12, 0.08, B.plantL);
        B.fr.set(x - 0.1, keys([[0, 0.15], [0.15, 0.35], [0.3, 0.12], [0.4, 0.08]], w), lerp(B.plantL - 0.9, z + 0.5, smooth(w / 0.3)));
        const beta = 6.5 + 3.0 * (1 - Math.exp(-w / 0.1));
        p = {
          x, z, yaw, hipY: keys([[0, 0.86], [0.15, 0.82], [0.4, 0.9]], w),
          lean: keys([[0, 0.45], [0.15, 0.7], [0.4, 0.35]], w), roll: -0.1,
          footL: B.fl, footR: B.fr, kneeL: [0.2, 0, 1], kneeR: [-0.2, 0, 1],
          handR: (sh) => B.hr.set(sh.x + 0.3 * smooth(w / 0.2), sh.y + 0.6 * Math.cos(beta), sh.z + 0.6 * Math.sin(beta)),
          handL: [0.25, 0.85, -0.2], elbowR: [-1, 0, 0],
          headYaw: -yaw * 0.6, headPitch: 0.1,
        };
      } else {
        const v = dt > 0 ? Math.hypot(dz, 0) / dt : 0;
        st.phase += (Math.abs(dz) * Math.PI) / (2 * strideOf(v));
        p = runPose(x, z, 0.25, st.phase, v);
      }
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
