// Setup menu, HUD and end screen (plain DOM).
const $ = (id) => document.getElementById(id);

export function initMenu(onStart) {
  const choice = { difficulty: 'easy', target: 30, overs: 2 };
  document.querySelectorAll('.opts').forEach((group) => {
    const key = group.dataset.key;
    group.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
        btn.classList.add('sel');
        choice[key] = key === 'difficulty' ? btn.dataset.v : Number(btn.dataset.v);
      });
    });
  });
  $('start').addEventListener('click', () => {
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('start').blur();
    onStart({ ...choice });
  });
  $('again').addEventListener('click', () => {
    $('end').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
  });
}

const AIM_LABELS = { 2: 'LEG ◄◄', 1: 'LEG ◄', 0: 'STRAIGHT', [-1]: 'OFF ►', [-2]: 'OFF ►►' };

function msgKind(m) {
  if (/NOT OUT/.test(m)) return 'extra';
  if (/^SIX/.test(m)) return 'six';
  if (/^FOUR/.test(m)) return 'four';
  if (/BOWLED|CAUGHT|LBW/.test(m)) return 'out';
  if (/WIDE|NO BALL/.test(m)) return 'extra';
  return 'small';
}

let last = '', lastMsg = '';

export function updateHUD(g) {
  if (!g.cfg) return;
  const need = Math.max(0, g.target - g.runs);
  const left = g.totalBalls - g.balls;
  const overs = `${Math.floor(g.balls / 6)}.${g.balls % 6}`;
  const key = [g.runs, g.wkts, g.balls, g.aim, g.shot, g.message, g.state].join('|');
  if (key === last) return;
  last = key;
  $('score').textContent = `${g.runs}/${g.wkts}`;
  $('overs').textContent = `${overs} (${g.overs})`;
  $('target').textContent = g.target;
  $('need').textContent = need;
  $('left').textContent = left;
  $('aim').textContent = AIM_LABELS[g.aim];
  // direction segments: light from centre out to the chosen side
  document.querySelectorAll('.segs i').forEach((el) => {
    const a = Number(el.dataset.a);
    el.classList.toggle('on', a === 0 ? g.aim === 0 : Math.sign(a) === Math.sign(g.aim) && Math.abs(a) <= Math.abs(g.aim));
  });
  document.querySelectorAll('.shots i').forEach((el) => el.classList.toggle('on', Number(el.dataset.s) === g.shot));

  const msg = $('msg');
  if (g.message !== lastMsg) {
    lastMsg = g.message;
    msg.className = '';
    if (g.message) {
      msg.querySelector('span').textContent = g.message;
      void msg.offsetWidth; // restart the pop animation
      msg.className = `show ${msgKind(g.message)}`;
    }
  }

  if (g.state === 'end') {
    const t = $('endTitle');
    t.textContent = g.outcome === 'won' ? 'YOU WON!' : g.outcome === 'tie' ? 'TIED!' : 'YOU LOST';
    t.className = `end-title ${g.outcome}`;
    const res = g.outcome === 'won' ? `Chased ${g.target} with ${g.totalBalls - g.balls} balls to spare` : `Fell ${g.target - g.runs} short of ${g.target}`;
    $('endText').textContent = `${g.runs}/${g.wkts} in ${overs} overs · ${res}`;
    setTimeout(() => $('end').classList.remove('hidden'), 1200);
  }
}
