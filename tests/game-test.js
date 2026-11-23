import { Game, DT, CONTACT_Z } from '../js/game.js';
import { Bat } from '../js/bat.js';
import { stepBall } from '../js/physics.js';

function swingTime(bat){ const s=new Bat(); Object.assign(s,{pitchSens:bat.pitchSens,yawSens:bat.yawSens,omegaMax:bat.omegaMax,phiT:bat.phiT,faceT:bat.faceT}); s.reset(); s.start(); let t=0; while(s.phi<s.phiT){s.update(DT);t+=DT;} return t; }

for (const diff of ['easy','medium','hard']) {
  for (const sigma of [0.015, 0.03]) {
    const tally = {};
    let matches=0, wins=0, totalRuns=0, totalBalls=0;
    for (let m=0;m<6;m++){
      const g=new Game(); g.aim = 0; g.start({difficulty:diff,target:100,overs:10});
      let press=null, prevState=null, steps=0;
      while(g.state!=='end' && steps++ < 2e7){
        if(g.state==='play' && prevState!=='play'){
          g.aim = Math.floor(Math.random()*5)-2; g.shot = Math.floor(Math.random()*3)-1; g.retarget();
          const c=g.ball.clone(); let t=0; while(c.p.z<CONTACT_Z){stepBall(c,DT);t+=DT;}
          press = t - g.bat.timeToContact() + gaussian()*sigma;
        }
        if(g.state==='play' && press!==null && g.t>=press){ g.swing(); press=null; }
        if(g.state==='result' && prevState==='play') tally[g.message]=(tally[g.message]||0)+1;
        prevState=g.state;
        g.step(DT);
      }
      if(g.state==='end'){ const msg=g.message; tally[msg]=(tally[msg]||0)+1; }
      matches++; if(g.outcome==='won') wins++; totalRuns+=g.runs; totalBalls+=g.balls;
    }
    console.log(diff, 'timing sd', sigma*1000+'ms', 'wins', wins+'/'+matches, 'RR/over', (totalRuns/totalBalls*6).toFixed(1));
    console.log('  ', JSON.stringify(tally));
  }
}
function gaussian(){ let u=Math.random(),v=Math.random(); return Math.sqrt(-2*Math.log(u||1e-9))*Math.cos(2*Math.PI*v); }
