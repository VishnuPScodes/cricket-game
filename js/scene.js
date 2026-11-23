// Builds the 3D world: lighting, stadium, players, stumps, bat and ball.
import * as THREE from 'three';
import { BAT, BLADE_CENTER } from './bat.js';
import { BALL_R, STUMPS } from './physics.js';
import { buildStadium, blobTexture } from './stadium.js';
import { Character, makeBatMeshes, mat } from './models.js';

function makeStumps(z) {
  const g = new THREE.Group();
  const r = 0.019;
  const wood = mat(0xf6efdc, { roughness: 0.45 });
  const band = mat(0x1f4fbf, { roughness: 0.45 });
  const stumps = [];
  for (const x of [-STUMPS.halfWidth + r, 0, STUMPS.halfWidth - r]) {
    const s = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r, r, STUMPS.height, 12), wood);
    post.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.001, r + 0.001, 0.22, 12), band);
    stripe.position.y = 0.05;
    s.add(post, stripe);
    s.position.set(x, STUMPS.height / 2, 0);
    g.add(s);
    stumps.push(s);
  }
  const bails = [];
  for (const x of [-0.055, 0.055]) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.095, 3, 8), wood);
    b.rotation.z = Math.PI / 2;
    b.castShadow = true;
    b.position.set(x, STUMPS.height + 0.008, 0);
    g.add(b);
    bails.push(b);
  }
  g.position.z = z;
  g.userData = { stumps, bails };
  return g;
}

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f5ef'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#d9d4c6'; x.fillRect(0, 58, 256, 12);
  x.fillStyle = '#3a3a3a';
  for (let i = 0; i < 256; i += 6) { x.fillRect(i, 55, 3, 2); x.fillRect(i + 3, 71, 3, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKINS = [0x8d5a3b, 0xc08a5e, 0xa86f48, 0xe0b48f, 0x6e4329, 0xd29e76];
const pick = (a) => a[(Math.random() * a.length) | 0];

export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe2f2, 160, 480);

  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.05, 1200);

  scene.add(new THREE.HemisphereLight(0xd6ebff, 0x5b7d3a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(22, 45, 18);
  sun.target.position.set(0, 0, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 34, bottom: -34, near: 1, far: 140 });
  scene.add(sun, sun.target);

  const { crowd } = buildStadium(scene, renderer);

  const stumps = makeStumps(0);
  const bowlerStumps = makeStumps(STUMPS.bowlerZ);
  scene.add(stumps, bowlerStumps);

  // ---- people ----
  const batKit = { shirt: 0x1846b8, trousers: 0x14337f, trim: 0xffd400, shoe: 0xffffff, longSleeves: true };
  const batsman = new Character(scene, { ...batKit, pads: true, gloves: 0xf4f4f4, headgear: 'helmet', helmet: 0x0b1d4f, skin: 0xb07a52, number: 7 });
  const nonStriker = new Character(scene, { ...batKit, pads: true, gloves: 0xf4f4f4, headgear: 'helmet', helmet: 0x0b1d4f, skin: 0x8d5a3b, number: 18 });
  const fieldKit = { shirt: 0xe2442f, trousers: 0x2a1a3f, trim: 0xffffff, shoe: 0xf4f4f4 };
  const bowler = new Character(scene, { ...fieldKit, headgear: null, skin: pick(SKINS), number: 9 });
  const fielders = [];
  for (let i = 0; i < 10; i++) {
    const keeper = i === 0;
    fielders.push(new Character(scene, {
      ...fieldKit,
      skin: pick(SKINS),
      headgear: keeper ? 'helmet' : Math.random() < 0.6 ? 'cap' : 'hat',
      helmet: 0x2a1a3f, capColor: 0x2a1a3f, hatColor: 0xf0ead8,
      pads: keeper, gloves: keeper ? 0xf2f2f2 : null, keeper, longSleeves: keeper,
      number: 10 + i,
    }));
  }
  const umpire = new Character(scene, { shirt: 0x9ad0ff, trousers: 0x1a1a1a, trim: 0x9ad0ff, shoe: 0x111111, headgear: 'hat', hatColor: 0xf5f2e8, skin: pick(SKINS), longSleeves: true });

  // soft blob shadows (players outside the shadow camera stay grounded)
  const blobTex = blobTexture();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobs = [];
  for (const c of [bowler, umpire, nonStriker, ...fielders]) {
    const b = new THREE.Mesh(blobGeo, blobMat);
    b.scale.set(0.9, 1, 0.9);
    b.renderOrder = 1;
    scene.add(b);
    blobs.push({ mesh: b, ch: c });
  }

  // ---- bat (physics-driven) and the non-striker's bat ----
  const bat = makeBatMeshes(BAT, BLADE_CENTER);
  bat.matrixAutoUpdate = false;
  scene.add(bat);
  const bat2 = makeBatMeshes(BAT, BLADE_CENTER);
  scene.add(bat2);

  // ---- ball: drawn 1.4x physical size so it stays readable (physics uses true size) ----
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.4, 20, 14), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.35 }));
  ball.castShadow = true;
  scene.add(ball);
  const ballShadow = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  ballShadow.renderOrder = 2;
  scene.add(ballShadow);
  const trail = [];
  const trailGeo = new THREE.SphereGeometry(BALL_R * 1.2, 8, 6);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 * (1 - i / 12), depthWrite: false }));
    m.scale.setScalar(1 - i / 16);
    scene.add(m);
    trail.push(m);
  }

  return { scene, camera, sun, stumps, bowlerStumps, batsman, nonStriker, bat, bat2, ball, ballShadow, trail, bowler, fielders, umpire, blobs, crowd };
}
