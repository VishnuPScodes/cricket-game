import { Ball, stepBall } from '../js/physics.js';
import { Bat, PHI_BACK } from '../js/bat.js';
import { DIFFICULTY, makeDelivery, SIM_DT } from '../js/bowling.js';

const CONTACT_Z = -1.55;
function launch(d){ const b=new Ball(); b.p={...d.p0}; b.v={...d.v0}; b.w={...d.w}; b.swing=d.swing; b.swingOn=true; b.seamKick=d.seam; return b; }
function predict(d){ const c=launch(d); let t=0; while(c.p.z<CONTACT_Z){stepBall(c,SIM_DT); t+=SIM_DT;} return {p:{...c.p}, t, speed:Math.hypot(c.v.x,c.v.y,c.v.z)}; }
// time for bat to reach phiT from backlift
function swingTime(bat){ const b=Object.create(bat); const sim=new Bat(); Object.assign(sim,{pitchSens:bat.pitchSens,yawSens:bat.yawSens,omegaMax:bat.omegaMax,phiT:bat.phiT,faceT:bat.faceT}); sim.reset(); sim.start(); let t=0; while(sim.phi<sim.phiT){sim.update(SIM_DT);t+=SIM_DT;} return t; }

function playBall(diffName, d, aim, type, pressOffset){
  const cfg=DIFFICULTY[diffName]; const bat=new Bat(); bat.configure(cfg);
  const pr=predict(d);
  bat.aimAt(pr.p, aim, type, {x:0,y:0}); bat.P={...bat.Pt}; bat.reset();
  const press = pr.t - swingTime(bat) + pressOffset;
  const b=launch(d); let t=0, hit=null;
  while(t<1.5){ if(!bat.started && t>=press) bat.start(); stepBall(b,SIM_DT); bat.update(SIM_DT); t+=SIM_DT;
    if(!hit){ hit=bat.collide(b,SIM_DT); if(hit){ hit.v={...b.v}; break; } } }
  if(!hit) return 'MISS';
  // fly to rest/landing
  const v=hit.v; const launchAng=Math.atan2(v.y,Math.hypot(v.x,v.z))*180/Math.PI; const dir=Math.atan2(-v.x,-v.z)*180/Math.PI;
  let bb=b.clone(); const nb=bb.bounces; const z0={...bb.p}; let tt=0; while(bb.bounces===nb && tt<8){stepBall(bb,SIM_DT);tt+=SIM_DT;}
  const carry=Math.hypot(bb.p.x-z0.x,bb.p.z-z0.z);
  return `exit ${(hit.exitSpeed*3.6).toFixed(0)}km/h launch ${launchAng.toFixed(0)}° dir ${dir.toFixed(0)}° (+=leg) carry ${carry.toFixed(0)}m sweetOff ${hit.sweetOffset.toFixed(2)} edge ${hit.edge}`;
}

for (const diff of ['easy','medium','hard']) {
  console.log('==', diff);
  for (let i=0;i<4;i++){
    const d=makeDelivery(DIFFICULTY[diff]); const b=launch(d); let t=0;
    while(b.p.z<0 && t<3){stepBall(b,SIM_DT);t+=SIM_DT;}
    const pr=predict(d);
    console.log(`${d.spinner?'spin':'pace'} rel ${(d.speed*3.6).toFixed(0)} len ${d.length.toFixed(1)} bounce@ z=${b.firstBounce?.z.toFixed(2)} x=${b.firstBounce?.x.toFixed(2)} (target x ${d.lineX.toFixed(2)}) atStumps x=${b.p.x.toFixed(2)} y=${b.p.y.toFixed(2)} speed ${(Math.hypot(b.v.x,b.v.y,b.v.z)*3.6).toFixed(0)} flight ${pr.t.toFixed(3)}s`);
  }
}
console.log('== timing sweep, medium, straight normal shot');
const d=makeDelivery(DIFFICULTY.medium);
for (const off of [-0.06,-0.04,-0.02,-0.01,0,0.01,0.02,0.04]) console.log(off, playBall('medium', d, 0, 0, off));
console.log('== shot types / aims (perfect timing)');
for (const type of [-1,0,1]) for (const aim of [-1,0,1]) console.log('type',type,'aim',aim, playBall('medium', d, aim*0.5, type, 0));
