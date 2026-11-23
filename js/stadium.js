// Stadium environment: sky, striped outfield, textured pitch, boundary boards, tiered
// stands with an instanced crowd, roof and floodlights. All procedural (canvas textures).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STUMPS } from './physics.js';
import { GROUND_CENTER, BOUNDARY_R } from './game.js';
import { mat } from './models.js';

const GROUND_R = 78;

function canvasTex(w, h, draw, renderer) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function grassTexture(renderer) {
  return canvasTex(2048, 2048, (x, W) => {
    const s = W / (2 * GROUND_R), cx = W / 2, cy = W / 2;
    const toPx = (m) => m * s;
    // mowing stripes along the pitch, with a faint cross-cut
    const stripe = 5.5;
    for (let i = -16; i <= 16; i++) {
      x.fillStyle = i % 2 ? '#4d9a37' : '#5bab42';
      x.fillRect(cx + toPx(i * stripe - stripe / 2), 0, toPx(stripe) + 1, W);
    }
    x.globalAlpha = 0.07;
    for (let i = -16; i <= 16; i++) {
      x.fillStyle = i % 2 ? '#000' : '#fff';
      x.fillRect(0, cy + toPx(i * stripe - stripe / 2), W, toPx(stripe) + 1);
    }
    // grain
    for (let i = 0; i < 90000; i++) {
      x.globalAlpha = 0.12 + Math.random() * 0.12;
      x.fillStyle = Math.random() < 0.5 ? '#3c7f2a' : '#79c25a';
      x.fillRect(Math.random() * W, Math.random() * W, 2, 2);
    }
    // the square: slightly paler, worn
    x.globalAlpha = 0.25;
    x.fillStyle = '#8bbf5b';
    x.fillRect(cx - toPx(10), cy - toPx(15), toPx(20), toPx(30));
    // outside the rope: darker
    x.globalAlpha = 1;
    x.save();
    x.beginPath(); x.rect(0, 0, W, W); x.arc(cx, cy, toPx(BOUNDARY_R + 0.4), 0, Math.PI * 2, true);
    x.fillStyle = 'rgba(20,60,20,0.35)'; x.fill('evenodd');
    x.restore();
    // 30-yard circle (dashed)
    const R30 = 27.43, half = 10.06;
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = Math.max(2, toPx(0.12));
    x.setLineDash([toPx(0.6), toPx(0.9)]);
    x.beginPath();
    x.arc(cx, cy - toPx(half), toPx(R30), Math.PI, 0);
    x.lineTo(cx + toPx(R30), cy + toPx(half));
    x.arc(cx, cy + toPx(half), toPx(R30), 0, Math.PI);
    x.closePath();
    x.stroke();
  }, renderer);
}

function pitchTexture(renderer) {
  return canvasTex(256, 2048, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#b9a774'); g.addColorStop(0.15, '#d4c08d'); g.addColorStop(0.5, '#dcc999');
    g.addColorStop(0.85, '#d4c08d'); g.addColorStop(1, '#b9a774');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 26000; i++) {
      x.globalAlpha = 0.08 + Math.random() * 0.15;
      x.fillStyle = Math.random() < 0.5 ? '#9c8a5a' : '#efe0b6';
      x.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // faint grass tint patches
    for (let i = 0; i < 60; i++) {
      x.globalAlpha = 0.06;
      x.fillStyle = '#7f9a4a';
      x.beginPath(); x.ellipse(Math.random() * W, Math.random() * H, 20 + Math.random() * 40, 40 + Math.random() * 90, 0, 0, Math.PI * 2); x.fill();
    }
    // worn footmarks near both creases
    for (const yc of [H * 0.09, H * 0.91]) {
      for (let i = 0; i < 40; i++) {
        x.globalAlpha = 0.12;
        x.fillStyle = '#8d7a4c';
        x.beginPath(); x.ellipse(W * (0.25 + Math.random() * 0.5), yc + (Math.random() - 0.5) * 150, 6 + Math.random() * 12, 10 + Math.random() * 18, 0, 0, Math.PI * 2); x.fill();
      }
    }
    // hairline cracks
    x.globalAlpha = 0.25; x.strokeStyle = '#7a6a42'; x.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      let px = Math.random() * W, py = Math.random() * H;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 18; py += (Math.random() - 0.5) * 18; x.lineTo(px, py); }
      x.stroke();
    }
  }, renderer);
}

function boardTexture(renderer, label, bg1, bg2, fg) {
  return canvasTex(1024, 128, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, bg1); g.addColorStop(1, bg2);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 14; i++) { x.beginPath(); x.moveTo(i * 90 - 40, H); x.lineTo(i * 90 + 10, 0); x.lineTo(i * 90 + 40, 0); x.lineTo(i * 90 - 10, H); x.fill(); }
    x.fillStyle = fg;
    x.font = 'italic 800 92px "Barlow Condensed", Arial Narrow, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, W / 2, H / 2 + 4);
  }, renderer);
}

function puffTexture(renderer) {
  return canvasTex(256, 256, (x, W) => {
    for (let i = 0; i < 14; i++) {
      const px = W * (0.2 + Math.random() * 0.6), py = W * (0.4 + Math.random() * 0.25), r = W * (0.12 + Math.random() * 0.16);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
  }, renderer);
}

export function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function flatRect(w, d, material, x, z, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

export function buildStadium(scene, renderer) {
  const C = GROUND_CENTER;

  // ---- sky ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x1d63c4) }, mid: { value: new THREE.Color(0x6fa9e6) }, bot: { value: new THREE.Color(0xdbeaf6) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = clamp(vP.y, 0.0, 1.0);
        vec3 c = mix(bot, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.8, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  sky.position.set(C.x, 0, C.z);
  scene.add(sky);
  const puff = puffTexture(renderer);
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, fog: false, depthWrite: false, opacity: 0.75 }));
    const a = Math.random() * Math.PI * 2, r = 260 + Math.random() * 120;
    s.position.set(C.x + Math.cos(a) * r, 70 + Math.random() * 90, C.z + Math.sin(a) * r);
    s.scale.set(120 + Math.random() * 90, 50 + Math.random() * 30, 1);
    scene.add(s);
  }

  // ---- ground ----
  const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_R, 96), new THREE.MeshStandardMaterial({ map: grassTexture(renderer), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(C.x, 0, C.z);
  ground.receiveShadow = true;
  scene.add(ground);

  const pitch = flatRect(3.05, 22.6, new THREE.MeshStandardMaterial({ map: pitchTexture(renderer), roughness: 0.9 }), 0, C.z, 0.004);
  scene.add(pitch);
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  for (const [zS, dir] of [[0, -1], [STUMPS.bowlerZ, 1]]) {
    scene.add(flatRect(2.64, 0.05, white, 0, zS, 0.007));               // bowling crease
    scene.add(flatRect(3.66, 0.05, white, 0, zS + dir * 1.22, 0.007));  // popping crease
    for (const x of [-1.32, 1.32]) scene.add(flatRect(0.05, 2.44, white, x, zS, 0.007));         // return creases
  }
  for (const x of [-0.75, 0.95]) scene.add(flatRect(0.03, 0.9, white, x, -1.22 - 0.45, 0.007)); // wide guides

  // boundary rope (cushion)
  const rope = new THREE.Mesh(new THREE.TorusGeometry(BOUNDARY_R, 0.16, 8, 160), mat(0xf5d33a, { roughness: 0.5 }));
  rope.rotation.x = -Math.PI / 2;
  rope.position.set(C.x, 0.12, C.z);
  rope.castShadow = true;
  scene.add(rope);

  // ---- advertising boards ----
  const ads = [
    ['BIG HIT ZONE', '#0b1d4f', '#1f4fbf', '#ffd400'],
    ['CRICKET LIVE', '#c8102e', '#ff4b2b', '#ffffff'],
    ['POWER PLAY', '#111111', '#3a3a3a', '#39ff88'],
    ['HOWZAT!', '#ffb300', '#ffda44', '#0b1d4f'],
    ['STRAIGHT DRIVE', '#5b1a8f', '#9b3fd1', '#ffffff'],
    ['FREE HIT', '#00875a', '#2bd17e', '#ffffff'],
  ].map((a) => new THREE.MeshStandardMaterial({ map: boardTexture(renderer, ...a), roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.12 }));
  const AD_R = BOUNDARY_R + 3.5, n = 56;
  const boardGeo = new THREE.BoxGeometry((2 * Math.PI * AD_R) / n - 0.25, 1.0, 0.12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = new THREE.Mesh(boardGeo, ads[i % ads.length]);
    b.position.set(C.x + Math.sin(a) * AD_R, 0.5, C.z + Math.cos(a) * AD_R);
    b.lookAt(C.x, 0.5, C.z);
    scene.add(b);
  }

  // ---- stands ----
  const GAP = 0.2; // leave room for the sight screens at both ends
  const segs = [[GAP, Math.PI - 2 * GAP], [Math.PI + GAP, Math.PI - 2 * GAP]];
  const concrete = mat(0x9aa3ad, { roughness: 0.9, side: THREE.DoubleSide });
  const seatsA = mat(0x2b4a8c, { roughness: 0.8, side: THREE.DoubleSide });
  function tiers(r0, y0, n, d, h) {
    const pts = [new THREE.Vector2(r0, 0), new THREE.Vector2(r0, y0)];
    for (let i = 0; i < n; i++) {
      pts.push(new THREE.Vector2(r0 + i * d + d, y0 + i * h));
      pts.push(new THREE.Vector2(r0 + i * d + d, y0 + (i + 1) * h));
    }
    pts.push(new THREE.Vector2(r0 + n * d + 0.5, y0 + n * h + 2.2));
    pts.push(new THREE.Vector2(r0 + n * d + 1.5, y0 + n * h + 2.2));
    pts.push(new THREE.Vector2(r0 + n * d + 1.5, 0));
    return pts;
  }
  const lower = { r0: 72, y0: 1.6, n: 22, d: 0.95, h: 0.5 };
  const upper = { r0: 95, y0: 15, n: 16, d: 0.95, h: 0.62 };
  for (const [s0, len] of segs) {
    for (const [t, m] of [[lower, seatsA], [upper, concrete]]) {
      const lathe = new THREE.Mesh(new THREE.LatheGeometry(tiers(t.r0, t.y0, t.n, t.d, t.h), 120, s0, len), m);
      lathe.position.set(C.x, 0, C.z);
      lathe.receiveShadow = true;
      scene.add(lathe);
    }
    // upper tier support wall under it
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(95, 95, 15, 120, 1, true, s0, len), concrete);
    wall.position.set(C.x, 7.5, C.z);
    scene.add(wall);
    // roof
    const roof = new THREE.Mesh(new THREE.RingGeometry(92, 118, 120, 1, s0 - Math.PI / 2, len), mat(0xf2f4f7, { side: THREE.DoubleSide, roughness: 0.6, emissive: 0xc9d2de, emissiveIntensity: 0.55 }));
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(C.x, 36, C.z);
    scene.add(roof);
  }

  // crowd: instanced little people (body + head), random shirt colours
  const body = new THREE.BoxGeometry(0.44, 0.55, 0.3); body.translate(0, 0.28, 0);
  const head = new THREE.BoxGeometry(0.2, 0.22, 0.2); head.translate(0, 0.68, 0);
  const colorAttr = (g, c) => g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(c).flat(), 3));
  colorAttr(body, [1, 1, 1]); colorAttr(head, [0.32, 0.22, 0.16]);
  const personGeo = mergeGeometries([body, head]);
  const palette = [0x1f4fbf, 0x1f4fbf, 0xffd400, 0xff7a00, 0xffffff, 0xc8102e, 0x2bd17e, 0x0b1d4f, 0xff4fa3, 0x7fd4ff, 0x222222];
  const seats = [];
  for (const t of [lower, upper]) {
    for (let i = 0; i < t.n; i++) {
      const r = t.r0 + i * t.d + t.d * 0.55, y = t.y0 + i * t.h;
      const step = 0.62 / r;
      for (const [s0, len] of segs) {
        for (let a = s0 + step / 2; a < s0 + len; a += step) if (Math.random() < 0.86) seats.push([a, r, y]);
      }
    }
  }
  const crowd = new THREE.InstancedMesh(personGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), seats.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  seats.forEach(([a, r, y], i) => {
    pos.set(C.x + Math.sin(a) * r, y, C.z + Math.cos(a) * r);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a + Math.PI + (Math.random() - 0.5) * 0.4);
    const k = 0.9 + Math.random() * 0.2;
    sc.set(k, k, k);
    crowd.setMatrixAt(i, m4.compose(pos, q, sc));
    crowd.setColorAt(i, col.setHex(palette[(Math.random() * palette.length) | 0]).multiplyScalar(0.75 + Math.random() * 0.25));
  });
  crowd.userData.seats = seats;
  scene.add(crowd);

  // sight screens (black, white ball)
  for (const z of [C.z - BOUNDARY_R - 7, C.z + BOUNDARY_R + 7]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 0.4), mat(0x0c0c0f, { roughness: 0.9 }));
    s.position.set(0, 4.5, z);
    scene.add(s);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.4, 0.6), mat(0x555a60));
    frame.position.set(0, 9.1, z);
    scene.add(frame);
  }

  // floodlight towers
  const towerMat = mat(0x8c939a, { metalness: 0.5, roughness: 0.5 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6d8, emissiveIntensity: 1.2 });
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const r = 122;
    const x = C.x + Math.sin(a) * r, z = C.z + Math.cos(a) * r;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 58, 8), towerMat);
    pole.position.set(x, 29, z);
    const headG = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 0.8), towerMat);
    headG.add(panel);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.2), lampMat);
      l.position.set(-4.2 + i * 2.8, -2.2 + j * 2.2, 0.45);
      headG.add(l);
    }
    headG.position.set(x, 60, z);
    headG.lookAt(C.x, 0, C.z);
    scene.add(pole, headG);
  }

  return { crowd };
}
