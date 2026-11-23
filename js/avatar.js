// Skinned human avatars (a rigged glTF model) driven by the procedural animation.
// The procedural Character still computes the pose (FK torso + IK limbs); its body meshes are
// hidden and the avatar's skeleton is aimed along the same joints each frame. Kit items that the
// model doesn't have (helmet, cap, pads, batting gloves) stay procedural and ride along.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ik, LEN } from './models.js';

let proto = null;
const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

export async function loadAvatarModel(url) {
  const g = await new GLTFLoader().loadAsync(url);
  proto = g.scene;
  proto.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const mn = o.material.name;
    if (mn === 'Wolf3D_Headwear') { o.userData.drop = true; return; }
    // the model wears a tailcoat: keep only the part of the top above the waistband (a shirt tucked in)
    if (mn === 'Wolf3D_Outfit_Top') cutBelow(o.geometry, 0.985);
    o.castShadow = true;
    o.frustumCulled = false; // bones move far from the bind-pose bounds
  });
  const drop = [];
  proto.traverse((o) => { if (o.userData.drop) drop.push(o); });
  drop.forEach((o) => o.removeFromParent());
  // stretch the limb bones to the procedural rig's segment lengths so the IK joints line up exactly
  const b = (n) => proto.getObjectByName(n);
  for (const s of ['Left', 'Right']) {
    b(s + 'ForeArm').position.setLength(LEN.upper);
    b(s + 'Hand').position.setLength(LEN.fore);
    b(s + 'Leg').position.setLength(LEN.thigh);
    b(s + 'Foot').position.setLength(LEN.shin);
  }
  proto.updateMatrixWorld(true);
}

// Turn the tailcoat into a plain shirt: cut the tails off at the waist and drop the small
// decorative pieces (bow tie, buttons, buttonhole rose), keeping collar, cuffs and waistcoat.
function cutBelow(geo, y) {
  const pos = geo.attributes.position, idx = geo.index.array;
  const P = (i, d) => (d === 0 ? pos.getX(i) : d === 1 ? pos.getY(i) : pos.getZ(i));
  const weld = new Map(), wid = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(P(i, 0) * 2000)},${Math.round(P(i, 1) * 2000)},${Math.round(P(i, 2) * 2000)}`;
    if (!weld.has(k)) weld.set(k, weld.size);
    wid[i] = weld.get(k);
  }
  const par = Array.from({ length: weld.size }, (_, i) => i);
  const f = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < idx.length; t += 3) { const a = f(wid[idx[t]]); par[f(wid[idx[t + 1]])] = a; par[f(wid[idx[t + 2]])] = a; }
  const C = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = f(wid[idx[t]]);
    let c = C.get(r);
    if (!c) C.set(r, c = { tris: 0, min: [9, 9, 9], max: [-9, -9, -9] });
    c.tris++;
    for (let k = 0; k < 3; k++) for (let d = 0; d < 3; d++) {
      c.min[d] = Math.min(c.min[d], P(idx[t + k], d)); c.max[d] = Math.max(c.max[d], P(idx[t + k], d));
    }
  }
  const drop = new Set();
  for (const [r, c] of C) {
    const size = Math.max(c.max[0] - c.min[0], c.max[1] - c.min[1], c.max[2] - c.min[2]);
    const cx = (c.max[0] + c.min[0]) / 2;
    if (size < 0.12 && !(Math.abs(cx) > 0.3 && c.tris > 100)) drop.add(r);
  }
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const cy = (P(idx[t], 1) + P(idx[t + 1], 1) + P(idx[t + 2], 1)) / 3;
    if (cy > y && !drop.has(f(wid[idx[t]]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  geo.setIndex(keep);
}

const plain = (color, src, rough = 0.8, folds = true) => new THREE.MeshStandardMaterial({
  color, roughness: rough, metalness: 0, normalMap: folds ? src.normalMap : null, normalScale: new THREE.Vector2(0.6, 0.6),
});

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m0 = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _h = new THREE.Vector3();
const _p = new THREE.Vector3(), _k = new THREE.Vector3(), _e = new THREE.Vector3();
const FRONT = new THREE.Vector3(0, 0, 1);
// head bone -> skull centre (0, 0.098, -0.008), skull radius ~0.107; the procedural headgear was
// built around a 0.1 m skull centred 0.125 above its origin
const HAIR = { y: 0.098, z: -0.008, tilt: -0.42 }, HAT = { s: 1.07, y: 0.098 - 0.125 * 1.07, z: 0.004 };
export { HAIR, HAT };

// rotation taking the frame (a0 along the bone, h0 hinge) to (a1, h1)
function frameRot(a0, h0, a1, h1, out) {
  _c.crossVectors(a0, h0);
  _m0.makeBasis(a0, h0, _c);
  _c.crossVectors(a1, h1);
  _m.makeBasis(a1, h1, _c);
  _m.multiply(_m0.transpose());
  return out.setFromRotationMatrix(_m);
}

export class Avatar {
  constructor(scene, ch) {
    const o = ch.o;
    this.ch = ch;
    this.obj = SkeletonUtils.clone(proto);
    scene.add(this.obj);
    this.b = {};
    for (const n of BONES) this.b[n] = this.obj.getObjectByName(n);
    // kit colours: replace the costume textures with plain cloth, keeping the fold normals
    // the model's skin texture is fair; tint it (in linear space) toward this player's tone
    const sk = new THREE.Color(o.skin ?? 0xc08a5e), ref = new THREE.Color(0xd8a890);
    const skinTint = new THREE.Color(Math.min(1, sk.r / ref.r), Math.min(1, sk.g / ref.g), Math.min(1, sk.b / ref.b));
    this.obj.traverse((m) => {
      if (!m.isSkinnedMesh) return;
      const mn = m.material.name;
      if (mn === 'Wolf3D_Outfit_Top') m.material = plain(o.shirt ?? 0x1f4fbf, m.material, 0.8, false);
      else if (mn === 'Wolf3D_Outfit_Bottom') m.material = plain(o.trousers ?? 0x1f4fbf, m.material, 0.85);
      else if (mn === 'Wolf3D_Outfit_Footwear') m.material = plain(o.shoe ?? 0xf4f4f4, m.material, 0.55);
      else if (mn === 'Wolf3D_Skin' || mn === 'Wolf3D_Body') { m.material = m.material.clone(); m.material.color.copy(skinTint); }
    });
    // bind pose data (model space = world space at identity)
    this.bind = {};
    for (const n of BONES) {
      const bone = this.b[n];
      this.bind[n] = { q: bone.getWorldQuaternion(new THREE.Quaternion()), p: bone.getWorldPosition(new THREE.Vector3()) };
    }
    const W = (n) => this.bind[n].p;
    this.hipOff = new THREE.Vector3().addVectors(W('LeftUpLeg'), W('RightUpLeg')).multiplyScalar(0.5).sub(W('Hips'));
    this.ankleUp = (W('LeftFoot').y + W('RightFoot').y) / 2 - 0.08; // procedural ankles sit 8 cm up
    this.limb = {};
    for (const [s, side] of [['L', 'Left'], ['R', 'Right']]) {
      for (const [k, A, B, C] of [['leg', 'UpLeg', 'Leg', 'Foot'], ['arm', 'Arm', 'ForeArm', 'Hand']]) {
        const a0 = W(side + B).clone().sub(W(side + A)).normalize();
        const d0 = W(side + C).clone().sub(W(side + B)).normalize();
        // hinge from anatomy (knees point forward, elbows back), not from the slight bind-pose bend
        const h0 = new THREE.Vector3().crossVectors(a0, k === 'leg' ? new THREE.Vector3(0, 0, -1) : FRONT).normalize();
        this.limb[s + k] = { A: side + A, B: side + B, C: side + C, a0, d0, h0 };
      }
    }
    // gloved hands disappear inside the procedural batting/keeping gloves
    if (o.gloves) for (const n of ['LeftHand', 'RightHand']) this.b[n].scale.setScalar(0.01);
    // short hair and headgear follow the avatar's head bone (holder axes = model axes)
    const holder = new THREE.Group();
    holder.quaternion.copy(this.bind.Head.q).invert();
    this.b.Head.add(holder);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.48),
      new THREE.MeshStandardMaterial({ color: o.hair ?? 0x16100b, roughness: 0.95 }));
    hair.scale.set(0.109, 0.113, 0.112);
    hair.position.set(0, HAIR.y, HAIR.z);
    hair.rotation.x = HAIR.tilt;
    holder.add(hair);
    if (ch.headgear) { holder.add(ch.headgear); ch.headgear.position.set(0, HAT.y, HAT.z); ch.headgear.scale.setScalar(HAT.s); }
    // hide the procedural body; keep its kit
    const keep = new Set([ch.headgear]);
    for (const s of ['L', 'R']) {
      if (o.pads) keep.add(ch.L[s].shin);
      if (o.gloves) { keep.add(ch.L[s].hand); if (ch.L[s].cuff) keep.add(ch.L[s].cuff); }
    }
    const hide = (root) => root.traverse((m) => {
      if (!m.isMesh) return;
      for (let x = m; x; x = x.parent) if (keep.has(x)) return;
      m.visible = false;
    });
    hide(ch.root); hide(ch.limbs);
  }

  set visible(v) { this.obj.visible = v; }

  aimLimb(L, J0, J1, J2, pole) {
    // J0..J2: world joint positions (root, middle, end); hinge from the bend, or from the pole when straight
    const { a0, d0, h0 } = L;
    _a.subVectors(J1, J0).normalize();
    _b.subVectors(J2, J1).normalize();
    _h.crossVectors(_a, _b);
    _c.crossVectors(_a, pole).multiplyScalar(-0.05);
    _h.add(_c).normalize();
    this.setWorld(L.A, frameRot(a0, h0, _a, _h, _q2).multiply(this.bind[L.A].q));
    this.setWorld(L.B, frameRot(d0, h0, _b, _h, _q2).multiply(this.bind[L.B].q));
  }

  setWorld(n, qWorld) {
    const bone = this.b[n];
    bone.parent.getWorldQuaternion(_q);
    bone.quaternion.copy(_q.invert().multiply(qWorld));
    bone.updateMatrixWorld(true);
  }

  drive() {
    const ch = this.ch, B = this.bind;
    this.obj.visible = ch.root.visible;
    if (!this.obj.visible) return;
    const qH = ch.hips.getWorldQuaternion(new THREE.Quaternion());
    const qS = ch.spine.getWorldQuaternion(new THREE.Quaternion());
    const qN = ch.head.getWorldQuaternion(new THREE.Quaternion());
    // pelvis: hip joints where the rig's are, lifted by the model's ankle height
    ch.mk.hL.getWorldPosition(_p);
    ch.mk.hR.getWorldPosition(_k);
    _p.add(_k).multiplyScalar(0.5);
    _p.y += this.ankleUp;
    _e.copy(this.hipOff).applyQuaternion(qH);
    const hips = this.b.Hips;
    hips.position.copy(_p).sub(_e);
    hips.quaternion.copy(qH).multiply(B.Hips.q);
    hips.updateMatrixWorld(true);
    this.setWorld('Spine', _q2.slerpQuaternions(qH, qS, 0.35).multiply(B.Spine.q));
    this.setWorld('Spine1', _q2.slerpQuaternions(qH, qS, 0.7).multiply(B.Spine1.q));
    this.setWorld('Spine2', _q2.copy(qS).multiply(B.Spine2.q));
    this.setWorld('Neck', _q2.slerpQuaternions(qS, qN, 0.5).multiply(B.Neck.q));
    this.setWorld('Head', _q2.copy(qN).multiply(B.Head.q));
    const tg = ch.tg;
    for (const s of ['L', 'R']) {
      const t = tg[s], side = s === 'L' ? 'Left' : 'Right';
      // legs: from the avatar's own hip joint to the (lifted) ankle target
      const leg = this.limb[s + 'leg'];
      const J0 = this.b[leg.A].getWorldPosition(new THREE.Vector3());
      const J2 = t.ankle.clone(); J2.y += this.ankleUp;
      const J1 = ik(J0, J2, LEN.thigh, LEN.shin, t.kneePole, new THREE.Vector3());
      this.aimLimb(leg, J0, J1, J2, t.kneePole);
      this.setWorld(side + 'Foot', _q2.copy(ch.L[s].foot.quaternion).multiply(B[side + 'Foot'].q));
      // arms: shoulder raises with the arm, then IK to the hand target
      const arm = this.limb[s + 'arm'];
      const sh = side + 'Shoulder';
      this.setWorld(sh, _q2.copy(qS).multiply(B[sh].q));
      const A0 = this.b[arm.A].getWorldPosition(new THREE.Vector3());
      const elev = Math.max(0, _a.subVectors(t.hand, A0).normalize().dot(_c.set(0, 1, 0).applyQuaternion(qS)));
      if (elev > 0) {
        _c.set(0, 0, 1).applyQuaternion(qS);
        _q.setFromAxisAngle(_c, (s === 'L' ? 1 : -1) * 0.35 * elev * elev);
        this.setWorld(sh, _q2.copy(_q).multiply(qS).multiply(B[sh].q));
        this.b[arm.A].getWorldPosition(A0);
      }
      const A1 = ik(A0, t.hand, LEN.upper, LEN.fore, t.elbowPole, new THREE.Vector3());
      this.aimLimb(arm, A0, A1, t.hand, t.elbowPole);
      // bare hands follow the forearm
      if (!ch.o.gloves) {
        this.b[arm.B].getWorldQuaternion(_q);
        _q.multiply(_q2.copy(B[arm.B].q).invert()).multiply(B[arm.C].q);
        this.setWorld(arm.C, _q);
      }
    }
  }
}
