// Procedural low-poly cricketers. The torso and head use forward kinematics.
// Limbs are tapered segments placed between world-space joints solved with 2-bone IK,
// so hands can grip the physics-driven bat and feet can stay planted.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();

export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, ...o });
const cast = (m) => { m.castShadow = true; return m; };

// Tapered limb: geometry along +Y, rDist at the distal (+Y) end.
function limb(rProx, rDist, len, material) {
  const m = cast(new THREE.Mesh(new THREE.CylinderGeometry(rDist, rProx, len, 12), material));
  m.userData.len = len;
  return m;
}
function ball(r, material, sx = 1, sy = 1, sz = 1) {
  const m = cast(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), material));
  m.scale.set(sx, sy, sz);
  return m;
}
export function placeSeg(m, a, b) {
  _d.subVectors(b, a);
  const L = _d.length() || 1e-6;
  m.position.addVectors(a, b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _d.divideScalar(L));
  m.scale.y = L / m.userData.len;
}

// Two-bone IK: returns the middle joint. Stretches (no clamp) if the target is out of reach.
export function ik(A, T, l1, l2, pole, out) {
  _d.subVectors(T, A);
  let dist = _d.length() || 1e-6;
  _d.divideScalar(dist);
  if (dist >= (l1 + l2) * 0.999) return out.copy(A).addScaledVector(_d, (dist * l1) / (l1 + l2));
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1);
  _p.normalize();
  return out.copy(A).addScaledVector(_d, a).addScaledVector(_p, h);
}

// ---- headgear ----
function helmet(color) {
  const g = new THREE.Group();
  const shellMat = mat(color, { roughness: 0.35, metalness: 0.1 });
  const shell = cast(new THREE.Mesh(new THREE.SphereGeometry(0.128, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), shellMat));
  shell.scale.set(1, 1.02, 1.12);
  shell.position.y = 0.1;
  const peak = cast(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.08), shellMat));
  peak.position.set(0, 0.1, 0.14);
  peak.rotation.x = 0.2;
  g.add(shell, peak);
  const metal = mat(0x2a2d33, { metalness: 0.6, roughness: 0.4 });
  for (const [y, r] of [[0.06, 0.135], [0.015, 0.132], [-0.03, 0.12]]) {
    const geo = new THREE.TorusGeometry(r, 0.0055, 4, 18, 2.3);
    geo.rotateZ(Math.PI / 2 - 1.15);
    geo.rotateX(Math.PI / 2);
    const bar = new THREE.Mesh(geo, metal);
    bar.position.y = y;
    bar.scale.z = 1.08;
    g.add(bar);
  }
  const vbar = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 5), metal);
  vbar.position.set(0, 0.015, 0.145);
  g.add(vbar);
  const guard = cast(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.02), shellMat));
  guard.position.set(0, 0.0, -0.12);
  g.add(guard);
  return g;
}
function cap(color) {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.8 });
  const dome = cast(new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m));
  dome.position.y = 0.11;
  dome.scale.z = 1.08;
  const brim = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 16, 1, false, -Math.PI / 2, Math.PI), m));
  brim.position.set(0, 0.11, 0.06);
  brim.scale.z = 1.5;
  g.add(dome, brim);
  return g;
}
function wideHat(color) {
  const g = new THREE.Group();
  const m = mat(color, { roughness: 0.85 });
  const brim = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20), m));
  brim.position.y = 0.15;
  const crown = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.1, 16), m));
  crown.position.y = 0.2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.111, 0.111, 0.025, 16), mat(0x222222));
  band.position.y = 0.165;
  g.add(brim, crown, band);
  return g;
}

export const LEN = { thigh: 0.45, shin: 0.46, upper: 0.29, fore: 0.28 };

export class Character {
  constructor(scene, o = {}) {
    const skin = mat(o.skin ?? 0xc08a5e, { roughness: 0.6 });
    const shirt = mat(o.shirt ?? 0x1f4fbf, { roughness: 0.65 });
    const trim = mat(o.trim ?? 0xffffff, { roughness: 0.65 });
    const trousers = mat(o.trousers ?? o.shirt ?? 0x1f4fbf, { roughness: 0.75 });
    const shoe = mat(o.shoe ?? 0xf4f4f4, { roughness: 0.5 });
    const glove = o.gloves ? mat(o.gloves, { roughness: 0.6 }) : skin;
    this.o = o;

    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.hips.rotation.order = 'YXZ';
    this.root.add(this.hips);
    this.hips.add(ball(1, trousers, 0.17, 0.13, 0.12));
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.035, 16), trim);
    belt.scale.z = 0.72; belt.position.y = 0.07;
    this.hips.add(belt);

    this.spine = new THREE.Group();
    this.spine.position.y = 0.06;
    this.spine.rotation.order = 'YXZ';
    this.hips.add(this.spine);
    const torso = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.155, 0.44, 18), shirt));
    torso.scale.z = 0.64; torso.position.y = 0.22;
    const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), shirt));
    chest.scale.set(0.2, 0.075, 0.128); chest.position.y = 0.44;
    // side stripes (kit trim) and collar
    for (const x of [-0.19, 0.19]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.4, 0.06), trim);
      s.position.set(x * 0.92, 0.22, 0); s.rotation.z = x > 0 ? 0.08 : -0.08;
      this.spine.add(s);
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 16), trim);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.5;
    this.spine.add(torso, chest, collar);
    if (o.number) this.spine.add(numberPatch(o.number, o.trim ?? 0xffffff));
    for (const x of [-0.2, 0.2]) {
      const sh = ball(0.068, shirt);
      sh.position.set(x, 0.41, 0);
      this.spine.add(sh);
    }
    const neck = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), skin));
    neck.position.y = 0.53;
    this.spine.add(neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.56;
    this.head.rotation.order = 'YXZ';
    this.spine.add(this.head);
    const skull = ball(0.1, skin, 0.92, 1.08, 1.0);
    skull.position.y = 0.1;
    this.head.add(skull);
    const hair = ball(0.102, mat(o.hair ?? 0x1b120c, { roughness: 0.9 }), 0.93, 0.9, 1.0);
    hair.position.set(0, 0.125, -0.01);
    this.head.add(hair);
    for (const x of [-0.035, 0.035]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), mat(0x111111));
      eye.position.set(x, 0.115, 0.09);
      this.head.add(eye);
    }
    if (o.headgear === 'helmet') this.head.add(helmet(o.helmet ?? 0x1c2c64));
    else if (o.headgear === 'cap') this.head.add(cap(o.capColor ?? o.shirt ?? 0x1f4fbf));
    else if (o.headgear === 'hat') this.head.add(wideHat(o.hatColor ?? 0xf4f1e6));

    const mk = (parent, x, y, z) => { const m = new THREE.Object3D(); m.position.set(x, y, z); parent.add(m); return m; };
    this.mk = { hL: mk(this.hips, 0.095, -0.04, 0), hR: mk(this.hips, -0.095, -0.04, 0),
      sL: mk(this.spine, 0.21, 0.4, 0), sR: mk(this.spine, -0.21, 0.4, 0) };

    // limbs live in world space
    this.limbs = new THREE.Group();
    const padMat = mat(0xf7f7f2, { roughness: 0.55 });
    const sleeve = o.longSleeves ? shirt : skin;
    this.L = {};
    for (const s of ['L', 'R']) {
      const legMat = trousers;
      const L = {
        thigh: limb(0.085, 0.062, LEN.thigh, legMat),
        knee: ball(0.062, o.pads ? padMat : legMat),
        shin: o.pads ? limb(0.082, 0.07, LEN.shin + 0.1, padMat) : limb(0.06, 0.045, LEN.shin, legMat),
        foot: cast(new THREE.Mesh(footGeo(), shoe)),
        upper: limb(0.056, 0.046, LEN.upper, shirt),
        elbow: ball(0.046, sleeve),
        fore: limb(0.044, 0.035, LEN.fore, sleeve),
        hand: o.gloves ? (o.keeper ? ball(0.075, glove, 1, 1.1, 0.95) : battingGlove(glove)) : ball(0.042, skin),
      };
      // batting gloves have a padded gauntlet that follows the forearm into the wrist
      if (o.gloves && !o.keeper) L.cuff = limb(0.05, 0.043, 0.085, glove);
      if (o.pads) {
        const ridges = new THREE.Group();
        for (const x of [-0.035, 0, 0.035]) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.018, LEN.shin + 0.06, 0.02), padMat);
          r.position.set(x, 0, 0.075);
          ridges.add(r);
        }
        L.shin.add(ridges);
      }
      Object.values(L).forEach((m) => this.limbs.add(m));
      this.L[s] = L;
    }
    scene.add(this.root, this.limbs);

    this.j = { hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3(),
      sh: new THREE.Vector3(), elbow: new THREE.Vector3(), hand: new THREE.Vector3(), pole: new THREE.Vector3() };
    this.handW = { L: new THREE.Vector3(), R: new THREE.Vector3() };
    this.shW = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  }

  set visible(v) { this.root.visible = v; this.limbs.visible = v; }

  // Resolve a target: Vector3 = world; array = root-local; function(shoulderWorld) => world.
  target(t, out, base) {
    if (t instanceof THREE.Vector3) return out.copy(t);
    if (typeof t === 'function') return out.copy(t(base));
    return this.root.localToWorld(out.set(t[0], t[1], t[2]));
  }
  dir(t, out) { return out.set(t[0], t[1], t[2]).applyQuaternion(this.root.quaternion); }

  setFK(p) {
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.yaw ?? 0;
    this.hips.position.set(p.hipX ?? 0, p.hipY ?? 0.96, p.hipZ ?? 0);
    this.hips.rotation.set(p.hipPitch ?? 0, p.hipYaw ?? 0, p.hipRoll ?? 0);
    this.spine.rotation.set(p.lean ?? 0, p.twist ?? 0, p.roll ?? 0);
    this.head.rotation.set(p.headPitch ?? 0, p.headYaw ?? 0, 0);
    this.root.updateMatrixWorld(true);
  }

  pose(p) {
    this.setFK(p);
    const j = this.j;
    for (const s of ['L', 'R']) {
      const L = this.L[s], sg = s === 'L' ? 1 : -1;
      // leg
      this.mk['h' + s].getWorldPosition(j.hip);
      this.target(p['foot' + s] ?? [sg * 0.12, 0.08, 0], j.ankle);
      this.dir(p['knee' + s] ?? [sg * 0.15, 0, 1], j.pole);
      ik(j.hip, j.ankle, LEN.thigh, LEN.shin, j.pole, j.knee);
      placeSeg(L.thigh, j.hip, j.knee);
      L.knee.position.copy(j.knee);
      if (this.o.pads) {
        _p.subVectors(j.knee, j.ankle).normalize();
        const top = j.knee.clone().addScaledVector(_p, 0.1);
        placeSeg(L.shin, top, j.ankle);
        L.shin.scale.y = 1;
      } else placeSeg(L.shin, j.knee, j.ankle);
      L.foot.position.copy(j.ankle);
      L.foot.rotation.set(p['footPitch' + s] ?? 0, (p.yaw ?? 0) + (p['footYaw' + s] ?? 0), 0, 'YXZ');
      // arm
      this.mk['s' + s].getWorldPosition(j.sh);
      this.shW[s].copy(j.sh);
      this.target(p['hand' + s] ?? [sg * 0.24, 0.9, 0.04], j.hand, j.sh);
      this.dir(p['elbow' + s] ?? [sg * 0.4, -0.2, -1], j.pole);
      ik(j.sh, j.hand, LEN.upper, LEN.fore, j.pole, j.elbow);
      placeSeg(L.upper, j.sh, j.elbow);
      L.elbow.position.copy(j.elbow);
      placeSeg(L.fore, j.elbow, j.hand);
      L.hand.position.copy(j.hand);
      if (L.cuff) {
        _p.subVectors(j.elbow, j.hand).normalize();
        placeSeg(L.cuff, _p.clone().multiplyScalar(0.03).add(j.hand), _p.clone().multiplyScalar(0.115).add(j.hand));
      }
      // a gripping glove lies along the handle; otherwise the hand follows the forearm
      if (p.gripQ) {
        // top hand's knuckles face the same way as the bat face, bottom hand's the opposite way
        L.hand.quaternion.copy(p.gripQ);
        if (s === 'R') L.hand.quaternion.multiply(FLIP_Y);
      }
      else L.hand.quaternion.copy(L.fore.quaternion);
      this.handW[s].copy(j.hand);
    }
  }
}

// Batting glove: a fist wrapped around the handle (axis = local Y), with knuckle roll and cuff.
// The handle runs through the fist along local Y; +Z is the back of the hand.
function battingGlove(material) {
  const g = new THREE.Group();
  const accent = mat(0x1846b8, { roughness: 0.6 });
  // palm wrapped round the handle
  const fist = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.05, 4, 12), material));
  fist.scale.set(1.15, 1, 1.05);
  g.add(fist);
  // four padded finger rolls curled over the handle (sausage padding on the back of the fingers)
  for (let i = 0; i < 4; i++) {
    const roll = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.0145, 0.05, 3, 8), material));
    roll.rotation.y = Math.PI / 2;
    roll.position.set(-0.012, 0.033 - i * 0.022, 0.03);
    roll.scale.set(1, 1, 1);
    g.add(roll);
    const band = new THREE.Mesh(new THREE.CapsuleGeometry(0.0148, 0.012, 3, 8), accent);
    band.rotation.y = Math.PI / 2;
    band.position.set(-0.012, 0.033 - i * 0.022, 0.031);
    g.add(band);
  }
  // thumb along the side of the handle
  const thumb = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.045, 3, 8), material));
  thumb.position.set(0.04, 0.0, 0.0);
  thumb.rotation.z = 0.25;
  g.add(thumb);
  // padded back-of-hand panel with the maker's patch
  const back = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.02), material));
  back.position.set(0.012, -0.01, 0.033);
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.004), accent);
  patch.position.set(0.012, -0.015, 0.045);
  g.add(back, patch);
  return g;
}

function footGeo() {
  const g = new THREE.BoxGeometry(0.1, 0.075, 0.27, 1, 1, 2);
  g.translate(0, -0.045, 0.06);
  return g;
}

function numberPatch(num, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#' + new THREE.Color(color).getHexString();
  x.font = 'bold 92px "Barlow Condensed", Arial Narrow, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(num), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7 }));
  m.position.set(0, 0.26, -0.105);
  m.rotation.y = Math.PI;
  return m;
}

// ---- bat (visual) ----
export function makeBatMeshes(BAT, BLADE_CENTER) {
  const g = new THREE.Group();
  const w = BAT.width, t = BAT.thick;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -t / 2);
  shape.lineTo(w / 2, -t / 2);
  shape.lineTo(w / 2, t * 0.05);
  shape.quadraticCurveTo(w * 0.28, t * 0.5 + 0.012, 0, t / 2 + 0.016);
  shape.quadraticCurveTo(-w * 0.28, t * 0.5 + 0.012, -w / 2, t * 0.05);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: BAT.blade, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.004, bevelSegments: 2 });
  geo.translate(0, 0, -BAT.blade / 2);
  geo.rotateX(-Math.PI / 2); // extrude axis -> Y; shape y -> -Z, so the flat face points +Z
  const willow = mat(0xe3c38d, { roughness: 0.55 });
  const blade = cast(new THREE.Mesh(geo, willow));
  blade.position.y = -BLADE_CENTER;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, BAT.blade * 0.98), new THREE.MeshStandardMaterial({ map: batStickerTex(), roughness: 0.5 }));
  face.position.set(0, -BLADE_CENTER, t / 2 + 0.0075);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, BAT.blade * 0.5), new THREE.MeshStandardMaterial({ map: batStickerTex(true), roughness: 0.5 }));
  back.position.set(0, -BLADE_CENTER + 0.05, -t / 2 - 0.022);
  back.rotation.y = Math.PI;
  const grip = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0165, BAT.handle, 12), new THREE.MeshStandardMaterial({ map: gripTex(), roughness: 0.8 })));
  grip.position.y = -BAT.handle / 2;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 6), mat(0x111111));
  g.add(blade, face, back, grip, knob);
  return g;
}

function batStickerTex(backSide = false) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, '#d8b57c'); grd.addColorStop(0.5, '#ecd3a2'); grd.addColorStop(1, '#d8b57c');
  x.fillStyle = grd; x.fillRect(0, 0, 128, 512);
  x.globalAlpha = 0.18; x.strokeStyle = '#8a6a3a';
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(14 + i * 12, 0); x.lineTo(16 + i * 12, 512); x.stroke(); }
  x.globalAlpha = 1;
  if (!backSide) {
    x.fillStyle = '#0d1b3e'; x.fillRect(10, 30, 108, 140);
    x.fillStyle = '#f2b705'; x.fillRect(10, 30, 108, 18); x.fillRect(10, 152, 108, 18);
    x.save(); x.translate(64, 100); x.rotate(-Math.PI / 2);
    x.fillStyle = '#ffffff'; x.font = 'italic 800 46px "Barlow Condensed", Arial Narrow, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BLAST', 0, 2); x.restore();
    x.fillStyle = '#c8102e'; x.fillRect(10, 430, 108, 46);
    x.fillStyle = '#fff'; x.font = '800 30px "Barlow Condensed", Arial Narrow, sans-serif';
    x.textAlign = 'center'; x.fillText('PRO', 64, 464);
  } else {
    x.fillStyle = '#0d1b3e'; x.fillRect(20, 160, 88, 200);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function gripTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#c8102e'; x.fillRect(0, 0, 64, 256);
  x.strokeStyle = '#111'; x.lineWidth = 6;
  for (let i = -4; i < 12; i++) { x.beginPath(); x.moveTo(0, i * 28); x.lineTo(64, i * 28 + 20); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
