// Game rules & flow: deliveries, wickets, fielding, scoring, target chase.
import { gauss, clamp } from './vec.js';
import { Ball, stepBall, hitsStumps, BALL_R, STUMPS } from './physics.js';
import { Bat } from './bat.js';
import { DIFFICULTY, makeDelivery, SIM_DT } from './bowling.js';

export const DT = SIM_DT;
export const GROUND_CENTER = { x: 0, z: -10.06 };
export const BOUNDARY_R = 62;
export const CONTACT_Z = -1.55;   // where the batsman aims to meet the ball
const POPPING_Z = -1.22;
const DEFAULT_CONTACT = { x: 0.05, y: 0.55, z: CONTACT_Z };
const AIM_STEP = 0.5;             // rad per direction step

const FIELD = [
  { x: 0.2, z: 14, reach: 1.5, speed: 5 },   // wicket-keeper
  { x: 2.4, z: 14.5, reach: 1.3 },           // slip
  { x: 24, z: -3 },                          // point
  { x: 22, z: -22 },                         // cover
  { x: 9, z: -36 },                          // mid-off
  { x: -9, z: -36 },                         // mid-on
  { x: -24, z: -17 },                        // mid-wicket
  { x: -26, z: 3 },                          // square leg
  { x: -24, z: 40 },                         // fine leg
  { x: 26, z: 38 },                          // third man
];

export class Game {
  constructor() {
    this.ball = new Ball();
    this.bat = new Bat();
    this.fielders = FIELD.map((f) => ({ home: f, x: f.x, z: f.z, reach: f.reach || 1.1, speed: f.speed || 7 }));
    this.bowler = { x: 0.6, z: -30 };
    this.state = 'menu';
    this.aim = 0;     // -2..2, + = leg side
    this.shot = 0;    // -1 ground, 0 normal, 1 lofted
    this.message = '';
    this.stumpsBroken = false;
  }

  start({ difficulty, target, overs }) {
    this.cfg = DIFFICULTY[difficulty];
    this.target = target;
    this.totalBalls = overs * 6;
    this.overs = overs;
    this.runs = 0; this.wkts = 0; this.balls = 0;
    this.outcome = null;
    this.bat.configure(this.cfg);
    this.nextBall();
  }

  nextBall() {
    this.state = 'runup';
    this.t = 0;
    this.del = makeDelivery(this.cfg);
    this.pred = null; this.noise = { x: 0, y: 0 };
    this.batHit = false; this.padHit = false; this.crease = null;
    this.stumpsBroken = false;
    this.message = '';
    this.fielders.forEach((f) => { f.x = f.home.x; f.z = f.home.z; });
    this.ball.reset();
    this.bat.reset();
    this.retarget();
    this.bat.P = { ...this.bat.Pt };
    this.bat.reset();
  }

  // ---- input ----
  swing() {
    if (this.state !== 'play' || this.batHit) return;
    const ideal = this.flightTime - this.bat.timeToContact();
    this.bat.start(this.t - ideal, this.cfg.timingAssist);
  }
  setAim(d) { this.aim = clamp(this.aim + d, -2, 2); this.retarget(); }
  setShot(d) { this.shot = clamp(this.shot + d, -1, 1); this.retarget(); }

  retarget() {
    if (this.bat.started) return;
    this.bat.aimAt(this.pred || DEFAULT_CONTACT, this.aim * AIM_STEP, this.shot, this.noise);
  }

  get body() { return { x: this.bat.P.x - 0.5, z: this.bat.P.z + 0.25 }; }

  // ---- simulation ----
  step(dt) {
    if (this.state === 'runup') return this.stepRunup(dt);
    if (this.state === 'play') return this.stepPlay(dt);
    if (this.state === 'result') {
      this.t += dt;
      if (this.batHit) stepBall(this.ball, dt);
      if (this.t > 2.2) this.nextBall();
    }
  }

  stepRunup(dt) {
    this.t += dt;
    const d = this.del;
    const k = Math.min(1, this.t / d.runup);
    this.bowler.x = 0.6;
    this.bowler.z = -19.2 - (1 - k) * (d.spinner ? 3.5 : 11);
    this.ball.p = { x: this.bowler.x - 0.3, y: 1.2 + k * 0.9, z: this.bowler.z };
    this.bat.update(dt);
    if (k >= 1) this.release();
  }

  release() {
    const d = this.del, b = this.ball;
    b.reset();
    b.p = { ...d.p0 }; b.v = { ...d.v0 }; b.w = { ...d.w };
    b.swing = d.swing; b.swingOn = true; b.seamKick = d.seam;
    // Batsman reads the delivery (footwork). Imperfect on higher difficulty.
    const c = b.clone();
    let n = 0;
    for (; n < 20000 && c.p.z < CONTACT_Z; n++) stepBall(c, DT);
    this.pred = { ...c.p };
    this.flightTime = n * DT;
    const sd = this.cfg.noise;
    this.noise = { x: gauss() * sd, y: gauss() * sd * 1.5 };
    this.retarget();
    this.state = 'play';
    this.t = 0;
    if (d.noBall) this.message = 'NO BALL';
  }

  stepPlay(dt) {
    const b = this.ball;
    stepBall(b, dt);
    this.bat.update(dt);
    this.t += dt;
    this.bowler.z = Math.min(-16.5, this.bowler.z + dt * 3);

    if (this.batHit) return this.stepLive(dt);

    const hit = this.bat.collide(b, dt);
    if (hit) return this.onBatHit(hit);
    if (!this.padHit && this.hitsPads(b.p)) return this.judgeLBW();
    if (!this.crease && b.p.z >= POPPING_Z) this.crease = { x: b.p.x, y: b.p.y };
    if (hitsStumps(b.p)) return this.wicket('BOWLED');
    if (b.p.z > 9 || this.t > 5) return this.deadUnhit();
  }

  hitsPads(p) {
    const body = this.body;
    const dx = Math.max(Math.abs(p.x - body.x) - 0.17, 0);
    const dy = Math.max(Math.abs(p.y - 0.4) - 0.4, 0);
    const dz = Math.max(Math.abs(p.z - body.z) - 0.12, 0);
    return Math.hypot(dx, dy, dz) < BALL_R;
  }

  judgeLBW() {
    this.padHit = true;
    const b = this.ball, fb = b.firstBounce;
    const pitchedOutsideLeg = fb && fb.x < -(STUMPS.halfWidth + BALL_R);
    const inLine = Math.abs(b.p.x) < STUMPS.halfWidth + BALL_R;
    if (!pitchedOutsideLeg && inLine) {
      const c = b.clone();
      for (let i = 0; i < 4000 && c.p.z < 0.3 && !c.stopped; i++) {
        stepBall(c, DT);
        if (hitsStumps(c.p)) return this.wicket('LBW');
      }
    }
    this.finish({ runs: 0, msg: 'NO RUN' });
  }

  deadUnhit() {
    const c = this.crease;
    const wide = c && (c.x > 0.95 || c.x < -0.75 || c.y > 2.0);
    if (wide) return this.finish({ runs: 0, extras: 1, legal: false, msg: 'WIDE' });
    this.finish({ runs: 0, msg: this.bat.started ? 'BEATEN' : 'NO RUN' });
  }

  onBatHit() {
    const b = this.ball;
    this.batHit = true;
    this.hitT = this.t;
    this.bouncesAtHit = b.bounces;
    b.swingOn = false; b.rolling = false; b.stopped = false;
    // Where will it first come down? Fielders under it run there.
    const c = b.clone();
    for (let i = 0; i < 16000 && c.bounces === b.bounces; i++) stepBall(c, DT);
    this.landing = { x: c.p.x, z: c.p.z };
    this.pickChasers();
    this.lastPick = 0;
  }

  pickChasers() {
    const b = this.ball;
    const bounced = b.bounces > this.bouncesAtHit;
    const tx = bounced ? b.p.x + b.v.x * 1.0 : this.landing.x;
    const tz = bounced ? b.p.z + b.v.z * 1.0 : this.landing.z;
    this.chasers = [...this.fielders]
      .sort((a, c) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(c.x - tx, c.z - tz))
      .slice(0, 2);
  }

  stepLive(dt) {
    const b = this.ball;
    const ts = this.t - this.hitT;
    const bounced = b.bounces > this.bouncesAtHit;

    if (Math.hypot(b.p.x - GROUND_CENTER.x, b.p.z - GROUND_CENTER.z) > BOUNDARY_R) {
      return this.scoreRuns(bounced ? 4 : 6, bounced ? 'FOUR' : 'SIX');
    }
    if (ts > 0.03 && hitsStumps(b.p)) return this.wicket('BOWLED');

    if (bounced && ts - this.lastPick > 0.2) { this.pickChasers(); this.lastPick = ts; }
    for (const f of this.chasers) {
      const tx = bounced ? b.p.x + b.v.x * 0.3 : this.landing.x;
      const tz = bounced ? b.p.z + b.v.z * 0.3 : this.landing.z;
      const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz), s = f.speed * dt;
      if (d > s) { f.x += (dx / d) * s; f.z += (dz / d) * s; } else { f.x = tx; f.z = tz; }
    }
    for (const f of this.fielders) {
      if (Math.hypot(f.x - b.p.x, f.z - b.p.z) > f.reach) continue;
      if (!bounced && b.p.y < 2.5 && ts > 0.08) return this.wicket('CAUGHT');
      if (bounced && b.p.y < 1.2) return this.fielded(f, ts);
    }
    if (ts > 14) return this.fielded(this.chasers[0], ts);
  }

  // Runs come from how long the ball took to be fielded and returned.
  fielded(f, ts) {
    const throwDist = Math.min(Math.hypot(f.x, f.z), Math.hypot(f.x, f.z - STUMPS.bowlerZ));
    const T = ts + throwDist / 25 + 0.5;
    const runs = clamp(Math.floor((T + 0.6) / 3.0), 0, 3);
    this.scoreRuns(runs, runs === 0 ? 'NO RUN' : runs === 1 ? '1 RUN' : `${runs} RUNS`);
  }

  scoreRuns(runs, msg) {
    const nb = this.del.noBall;
    this.finish({ runs, extras: nb ? 1 : 0, legal: !nb, msg: nb ? `${msg} + NO BALL` : msg });
  }

  wicket(kind) {
    if (kind === 'BOWLED') this.stumpsBroken = true;
    if (this.del.noBall) return this.finish({ runs: 0, extras: 1, legal: false, msg: 'NO BALL - NOT OUT' });
    this.finish({ runs: 0, wicket: true, msg: kind });
  }

  finish({ runs = 0, extras = 0, legal = !this.del.noBall, wicket = false, msg }) {
    if (this.del.noBall && extras === 0 && !wicket) { extras = 1; msg = `${msg} + NO BALL`; }
    this.runs += runs + extras;
    if (wicket) this.wkts++;
    if (legal) this.balls++;
    this.message = msg;
    this.state = 'result';
    this.t = 0;
    if (this.runs >= this.target) this.end('won');
    else if (this.wkts >= 10 || this.balls >= this.totalBalls) this.end(this.runs === this.target - 1 ? 'tie' : 'lost');
  }

  end(outcome) {
    this.outcome = outcome;
    this.state = 'end';
  }
}
