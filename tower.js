'use strict';
/* ============================================================
 * CORE DEFENSE — Step2: enemy variety + bosses
 * ============================================================ */
(() => {

const TWO_PI = Math.PI * 2;
const rand   = (a, b) => a + Math.random() * (b - a);
const pick   = arr => arr[(Math.random() * arr.length) | 0];

// ---------- Enemy archetypes ----------
// hp/speed scale with wave; baseline values here are for wave 1.
const ENEMY_TYPES = {
  grunt:    { color:'#ff5d6e', r:14, hp:3,  speed:55,  damage:1, score:10 },
  fast:     { color:'#ffa05d', r:11, hp:2,  speed:115, damage:1, score:14 },
  tank:     { color:'#a06eff', r:24, hp:14, speed:32,  damage:2, score:32 },
  shield:   { color:'#5da6ff', r:15, hp:5,  speed:48,  damage:1, score:24, shield:6 },
  splitter: { color:'#5dffa1', r:17, hp:6,  speed:50,  damage:1, score:18, splits:2 },
  ranged:   { color:'#ff5dc4', r:13, hp:4,  speed:42,  damage:1, score:24,
              ranged:true, keepDist:200, shotCd:1.6, projSpeed:210, projDmg:1 },
  boss:     { color:'#ff3a3a', r:54, hp:90, speed:22,  damage:5, score:300, boss:true,
              shotCd:1.1,  projSpeed:230, projDmg:1, multishot:5, spread:0.5 },
};

// Enemy type unlocked at given wave (boss handled separately every 5 waves).
function rollWave(wave) {
  const queue = [];
  if (wave % 5 === 0) {
    // boss wave: 1 boss + a stream of small minions
    queue.push({ type:'boss', delay:1.2 });
    const minionCount = 4 + Math.floor(wave / 5) * 2;
    for (let i = 0; i < minionCount; i++) {
      queue.push({ type: pick(['grunt','fast']), delay: 1.6 + i * 0.7 });
    }
    return queue;
  }
  // pool unlocks
  const pool = ['grunt'];
  if (wave >= 3)  pool.push('fast');
  if (wave >= 6)  pool.push('tank');
  if (wave >= 8)  pool.push('shield');
  if (wave >= 10) pool.push('splitter');
  if (wave >= 12) pool.push('ranged');
  // count + spacing
  const count = 10 + wave * 2;
  const interval = Math.max(0.28, 0.95 - wave * 0.035);
  for (let i = 0; i < count; i++) {
    queue.push({ type: pick(pool), delay: 0.4 + i * interval });
  }
  return queue;
}

// ---------- Wave banner ----------
const banner = document.createElement('div');
banner.className = 'wave-banner';
function showBanner(main, sub) {
  banner.innerHTML = `${main}<span class="sub">${sub || ''}</span>`;
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => banner.classList.remove('show'), 1600);
}

// ---------- DOM ----------
const canvas       = document.getElementById('stage');
const ctx          = canvas.getContext('2d');
const stageWrap    = document.getElementById('stageWrap');
const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText  = document.getElementById('overlayText');
const overlayStats = document.getElementById('overlayStats');
const overlayMain  = document.getElementById('overlayMain');
const overlaySub   = document.getElementById('overlaySub');
const hint         = document.getElementById('centerHint');
const hudWave      = document.getElementById('waveNum');
const hudScore     = document.getElementById('scoreNum');
const hudHp        = document.getElementById('hpFill');
const hudEnemy     = document.getElementById('enemyNum');
const btnPause     = document.getElementById('btnPause');
const btnMute      = document.getElementById('btnMute');

// ---------- Canvas sizing ----------
let W = 0, H = 0, CX = 0, CY = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const r = stageWrap.getBoundingClientRect();
  W = r.width; H = r.height;
  CX = W / 2; CY = H / 2;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

// ---------- Game state ----------
let game = null;
let mode = 'title'; // title | playing | gameover
let paused = false;

function newGame() {
  game = {
    wave: 1,
    score: 0,
    kills: 0,
    tower: {
      x: 0, y: 0, r: 22,
      hp: 5, maxHp: 5,
      angle: -Math.PI / 2,
      cooldown: 0,
      fireInterval: 0.45,
      damage: 3,
      bulletSpeed: 560,
      bulletRadius: 4,
    },
    enemies: [],
    bullets: [],
    enemyShots: [],
    waveQueue: rollWave(1),
    waveTimer: 0,
    waveCleared: false,
    betweenWaves: 0,
    flash: 0,
  };
  mode = 'playing';
  paused = false;
  hideOverlay();
  fadeHint();
  if (banner.parentNode !== stageWrap) stageWrap.appendChild(banner);
  showBanner(`WAVE 1`, '迎撃開始');
  updateHud();
}

// ---------- Enemy spawn ----------
function spawnEnemy(type, originAngle) {
  const cfg  = ENEMY_TYPES[type];
  const wave = game.wave;
  const a = originAngle != null ? originAngle : Math.random() * TWO_PI;
  const dist = Math.max(W, H) * 0.6 + 40;
  const x = CX + Math.cos(a) * dist;
  const y = CY + Math.sin(a) * dist;

  // scaling: hp grows ~6%/wave, speed +1%/wave (capped)
  const hpScale    = 1 + (wave - 1) * 0.07;
  const speedScale = 1 + Math.min(0.6, (wave - 1) * 0.012);
  const hp     = Math.round(cfg.hp     * hpScale);
  const shield = cfg.shield ? Math.round(cfg.shield * hpScale) : 0;
  const speed  = cfg.speed  * speedScale;

  game.enemies.push({
    x, y,
    kind: type,
    r: cfg.r,
    color: cfg.color,
    hp, maxHp: hp,
    shield, maxShield: shield,
    speed,
    damage: cfg.damage,
    score:  cfg.score,
    boss:   !!cfg.boss,
    splits: cfg.splits || 0,
    ranged: !!cfg.ranged,
    keepDist: cfg.keepDist || 0,
    shotCd:   cfg.shotCd ? cfg.shotCd * 0.6 + Math.random() * cfg.shotCd : 0,
    shotInterval: cfg.shotCd || 0,
    projSpeed: cfg.projSpeed || 0,
    projDmg:   cfg.projDmg   || 0,
    multishot: cfg.multishot || 1,
    spread:    cfg.spread    || 0,
    flash: 0,
    dead: false,
  });

  if (cfg.boss) showBanner('!!  BOSS  !!', `WAVE ${wave}`);
}

function spawnEnemyShot(e, angle) {
  game.enemyShots.push({
    x: e.x, y: e.y,
    vx: Math.cos(angle) * e.projSpeed,
    vy: Math.sin(angle) * e.projSpeed,
    r: 5,
    damage: e.projDmg,
    life: 4.0,
    color: e.color,
    dead: false,
  });
}

// ---------- Targeting ----------
function findTarget(t) {
  let best = null, bestD = Infinity;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD) { bestD = d2; best = e; }
  }
  return best;
}

// ---------- Update ----------
function update(dt) {
  const g = game;
  const t = g.tower;
  t.x = CX; t.y = CY;

  // ----- Spawn from queue -----
  g.waveTimer += dt;
  while (g.waveQueue.length && g.waveQueue[0].delay <= g.waveTimer) {
    const item = g.waveQueue.shift();
    spawnEnemy(item.type);
  }

  // ----- Tower aim & fire -----
  const target = findTarget(t);
  if (target) {
    const dx = target.x - t.x, dy = target.y - t.y;
    t.angle = Math.atan2(dy, dx);
  }
  t.cooldown -= dt;
  if (t.cooldown <= 0 && target) {
    fireBullet(t, target);
    t.cooldown = t.fireInterval;
  }

  // ----- Player bullets -----
  for (const b of g.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    if (b.x < -50 || b.x > W + 50 || b.y < -50 || b.y > H + 50) { b.dead = true; continue; }
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx*dx + dy*dy <= rr*rr) {
        applyDamage(e, b.damage);
        b.dead = true;
        break;
      }
    }
  }
  g.bullets = g.bullets.filter(b => !b.dead);

  // ----- Enemy shots -----
  for (const s of g.enemyShots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) { s.dead = true; continue; }
    const dx = t.x - s.x, dy = t.y - s.y;
    const rr = t.r + s.r;
    if (dx*dx + dy*dy <= rr*rr) {
      damageCore(s.damage);
      s.dead = true;
    }
  }
  g.enemyShots = g.enemyShots.filter(s => !s.dead);

  // ----- Enemies move / fire -----
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = t.x - e.x, dy = t.y - e.y;
    const d  = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);

    // ranged & boss: keep distance
    let shouldMove = true;
    if ((e.ranged || e.boss) && e.keepDist > 0 && d <= e.keepDist + 4) {
      shouldMove = false;
    } else if (e.boss && d <= 220) {
      shouldMove = false;
    }
    if (shouldMove) {
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
    }
    if (e.flash > 0) e.flash -= dt;

    // shooting
    if (e.shotInterval > 0) {
      e.shotCd -= dt;
      if (e.shotCd <= 0 && d < Math.max(W, H)) {
        if (e.boss && e.multishot > 1) {
          for (let i = 0; i < e.multishot; i++) {
            const t01 = (e.multishot === 1) ? 0 : (i / (e.multishot - 1)) - 0.5;
            spawnEnemyShot(e, ang + t01 * e.spread);
          }
        } else {
          spawnEnemyShot(e, ang);
        }
        e.shotCd = e.shotInterval;
      }
    }

    // reach core
    if (d < t.r + e.r) {
      damageCore(e.damage);
      e.dead = true;
    }
  }

  // process kills (splits etc.)
  for (let i = g.enemies.length - 1; i >= 0; i--) {
    const e = g.enemies[i];
    if (!e.dead) continue;
    if (e._counted !== true && e.hp <= 0) {
      g.kills++;
      g.score += e.score;
      if (e.splits > 0) {
        for (let s = 0; s < e.splits; s++) {
          const a = Math.random() * TWO_PI;
          const off = e.r + 6;
          spawnChild(e, a, off);
        }
      }
      e._counted = true;
    }
  }
  g.enemies = g.enemies.filter(e => !e.dead);

  // wave clear (queue empty AND no enemies on field)
  if (!g.waveCleared && g.waveQueue.length === 0 && g.enemies.length === 0) {
    g.waveCleared = true;
    g.betweenWaves = 1.6;
  }
  if (g.waveCleared) {
    g.betweenWaves -= dt;
    if (g.betweenWaves <= 0) nextWave();
  }

  if (g.flash > 0) g.flash -= dt;

  updateHud();
}

function applyDamage(e, dmg) {
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, dmg);
    e.shield -= absorbed;
    dmg -= absorbed;
  }
  if (dmg > 0) e.hp -= dmg;
  e.flash = 0.12;
  if (e.hp <= 0) e.dead = true;
}

function damageCore(amount) {
  const t = game.tower;
  t.hp -= amount;
  game.flash = Math.max(game.flash, 0.28);
  if (t.hp <= 0) { t.hp = 0; gameOver(); }
}

function spawnChild(parent, angle, off) {
  const x = parent.x + Math.cos(angle) * off;
  const y = parent.y + Math.sin(angle) * off;
  const cfg = ENEMY_TYPES.grunt;
  const wave = game.wave;
  const hpScale = 1 + (wave - 1) * 0.05;
  const hp = Math.max(1, Math.round(cfg.hp * 0.6 * hpScale));
  game.enemies.push({
    x, y, kind:'grunt', r: cfg.r - 3, color: cfg.color,
    hp, maxHp: hp, shield:0, maxShield:0,
    speed: cfg.speed * 1.15, damage: cfg.damage, score: 6,
    boss:false, splits:0, ranged:false, keepDist:0,
    shotCd:0, shotInterval:0, projSpeed:0, projDmg:0,
    multishot:1, spread:0, flash:0, dead:false,
  });
}

function fireBullet(t, target) {
  const dx = target.x - t.x, dy = target.y - t.y;
  const d  = Math.hypot(dx, dy) || 1;
  const sp = t.bulletSpeed;
  game.bullets.push({
    x: t.x + (dx/d) * (t.r + 2),
    y: t.y + (dy/d) * (t.r + 2),
    vx: (dx/d) * sp,
    vy: (dy/d) * sp,
    r: t.bulletRadius,
    damage: t.damage,
    life: 2.0,
    dead: false,
  });
}

function nextWave() {
  game.wave++;
  game.waveQueue = rollWave(game.wave);
  game.waveTimer = 0;
  game.waveCleared = false;
  if (game.wave % 5 === 0) {
    showBanner(`WAVE ${game.wave}`, 'BOSS WAVE');
  } else {
    showBanner(`WAVE ${game.wave}`, '迎撃継続');
  }
}

// ---------- Render ----------
function render() {
  ctx.clearRect(0, 0, W, H);

  // background grid
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = '#1c2740';
  ctx.lineWidth = 1;
  const step = 40;
  ctx.beginPath();
  for (let x = (CX % step); x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = (CY % step); y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();

  // damage flash vignette
  if (game && game.flash > 0) {
    ctx.save();
    ctx.globalAlpha = game.flash * 1.2;
    const grd = ctx.createRadialGradient(CX, CY, Math.min(W,H)*0.2, CX, CY, Math.max(W,H)*0.7);
    grd.addColorStop(0, 'rgba(255,79,122,0)');
    grd.addColorStop(1, 'rgba(255,79,122,0.6)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (!game) return;

  // bullets
  for (const b of game.bullets) {
    ctx.save();
    ctx.fillStyle = '#fff7a8';
    ctx.shadowColor = '#ffd24a';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  // enemy projectiles
  for (const s of game.enemyShots) {
    ctx.save();
    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  // enemies
  for (const e of game.enemies) {
    drawEnemy(e);
  }

  // tower
  const t = game.tower;
  // outer ring
  ctx.save();
  ctx.strokeStyle = 'rgba(90,214,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r + 8, 0, TWO_PI);
  ctx.stroke();
  ctx.restore();
  // body
  ctx.save();
  ctx.fillStyle = '#0c1430';
  ctx.strokeStyle = '#5ad6ff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#5ad6ff';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r, 0, TWO_PI);
  ctx.fill();
  ctx.stroke();
  // barrel
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.fillStyle = '#5ad6ff';
  ctx.fillRect(t.r - 4, -4, 16, 8);
  ctx.restore();
  // core dot
  ctx.save();
  ctx.fillStyle = '#a8f0ff';
  ctx.beginPath();
  ctx.arc(t.x, t.y, 5, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

// ---------- Enemy rendering ----------
function drawEnemy(e) {
  ctx.save();
  const baseFill = e.flash > 0 ? '#ffffff' : e.color;
  ctx.shadowColor = e.color;
  ctx.shadowBlur  = e.boss ? 22 : 10;

  if (e.kind === 'tank') {
    // hex
    ctx.fillStyle = baseFill;
    polygon(e.x, e.y, e.r, 6, 0);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1a0e36';
    polygon(e.x, e.y, e.r, 6, 0);
    ctx.stroke();
  } else if (e.kind === 'fast') {
    // triangle pointing toward core
    const ang = Math.atan2(CY - e.y, CX - e.x);
    ctx.fillStyle = baseFill;
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(e.r, 0);
    ctx.lineTo(-e.r * 0.7, e.r * 0.7);
    ctx.lineTo(-e.r * 0.7, -e.r * 0.7);
    ctx.closePath();
    ctx.fill();
  } else if (e.kind === 'splitter') {
    // diamond
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y - e.r);
    ctx.lineTo(e.x + e.r, e.y);
    ctx.lineTo(e.x, e.y + e.r);
    ctx.lineTo(e.x - e.r, e.y);
    ctx.closePath();
    ctx.fill();
  } else if (e.kind === 'ranged') {
    // square
    ctx.fillStyle = baseFill;
    ctx.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
  } else if (e.kind === 'boss') {
    // ring + body
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 6, 0, TWO_PI);
    ctx.stroke();
    // inner core
    ctx.fillStyle = '#fff5b8';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 0.35, 0, TWO_PI);
    ctx.fill();
  } else {
    // grunt + shield default circle
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();

  // shield ring
  if (e.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(150,210,255,0.85)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#5da6ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 4, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  // hp bar (skip for full-hp non-boss)
  if (e.hp < e.maxHp || e.boss) {
    const w = e.boss ? 80 : Math.max(24, e.r * 1.7);
    const h = e.boss ? 5 : 3;
    const yy = e.y - e.r - (e.boss ? 14 : 8);
    ctx.fillStyle = '#000a';
    ctx.fillRect(e.x - w/2, yy, w, h);
    ctx.fillStyle = e.boss ? '#ffd24a' : '#5dffa1';
    ctx.fillRect(e.x - w/2, yy, w * Math.max(0, e.hp / e.maxHp), h);
  }
}

function polygon(x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + i * TWO_PI / sides;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ---------- HUD ----------
function updateHud() {
  if (!game) return;
  hudWave.textContent  = game.wave;
  hudScore.textContent = game.score;
  hudEnemy.textContent = game.enemies.length;
  const pct = Math.max(0, game.tower.hp / game.tower.maxHp);
  hudHp.style.width = (pct * 100).toFixed(1) + '%';
  hudHp.classList.toggle('warn', pct <= 0.5 && pct > 0.25);
  hudHp.classList.toggle('crit', pct <= 0.25);
}

// ---------- Overlay ----------
function showTitle() {
  mode = 'title';
  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'CORE DEFENSE';
  overlayText.textContent  = '中央コアを守れ。360°から押し寄せる敵を自動で迎撃する。';
  overlayStats.innerHTML   = '';
  overlayMain.textContent  = 'スタート';
  overlaySub.style.display = 'none';
  overlayMain.onclick = () => newGame();
}

function gameOver() {
  mode = 'gameover';
  overlay.classList.remove('hidden');
  overlayTitle.textContent = 'GAME OVER';
  overlayText.textContent  = 'コアが破壊された';
  overlayStats.innerHTML = `
    <div class="stat"><div class="label">WAVE</div><div class="val">${game.wave}</div></div>
    <div class="stat"><div class="label">KILLS</div><div class="val">${game.kills}</div></div>
    <div class="stat"><div class="label">SCORE</div><div class="val">${game.score}</div></div>
  `;
  overlayMain.textContent  = 'もう一度';
  overlaySub.style.display = '';
  overlaySub.textContent   = 'タイトルへ';
  overlayMain.onclick = () => newGame();
  overlaySub.onclick  = () => showTitle();
}

function hideOverlay() { overlay.classList.add('hidden'); }
function fadeHint() {
  if (!hint) return;
  setTimeout(() => hint.classList.add('fade'), 2500);
}

// ---------- Buttons ----------
btnPause.addEventListener('click', () => {
  if (mode !== 'playing') return;
  paused = !paused;
  btnPause.textContent = paused ? '▶' : '⏸';
});
btnMute.addEventListener('click', () => {
  // sound TBD in step 5
});

// ---------- Loop ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (mode === 'playing' && !paused) update(dt);
  render();
  requestAnimationFrame(tick);
}

// ---------- Init ----------
resize();
showTitle();
requestAnimationFrame(tick);

})();
