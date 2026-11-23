// Tiny 3D vector helpers (plain objects so physics runs without Three.js).
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const copy = (a) => ({ x: a.x, y: a.y, z: a.z });
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Rotate about +Y. Positive angle turns -Z (towards bowler) towards -X (leg side).
export const rotY = (a, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return v3(a.x * c + a.z * s, a.y, -a.x * s + a.z * c);
};
export const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
