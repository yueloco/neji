'use strict';
/* ============================================================
 * CORE DEFENSE — Step1: skeleton + auto-fire + basic enemies
 * ============================================================ */
(() => {

const TWO_PI = Math.PI * 2;

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
      fireInterval: 0.45, // sec/shot
      damage: 3,
      bulletSpeed: 560,
      bulletRadius: 4,
      range: 9999,
    },
    enemies: [],
    bullets: [],
    spawnTimer: 0,
    spawnInterval: 1.0,
    enemiesToSpawn: 12,
    enemiesSpawned: 0,
    waveCleared: false,
    betweenWaves: 0,
    flash: 0,
  };
  mode = 'playing';
  paused = false;
  hideOverlay();
  fadeHint();
  updateHud();
}

// ---------- Enemy spawn ----------
function spawnEnemy() {
  const a = Math.random() * TWO_PI;
  const dist = Math.max(W, H) * 0.6 + 40;
  const x = CX + Math.cos(a) * dist;
  const y = CY + Math.sin(a) * dist;
  const wave = game.wave;
  const hp = 3 + wave * 0.8;
  game.enemies.push({
    x, y, r: 14,
    hp, maxHp: hp,
    speed: 55 + wave * 2,
    damage: 1,
    color: '#ff5d6e',
    flash: 0,
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

  // Spawn
  if (g.enemiesSpawned < g.enemiesToSpawn) {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnEnemy();
      g.enemiesSpawned++;
      g.spawnTimer = g.spawnInterval;
    }
  }

  // Tower aim & fire
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

  // Bullets
  for (const b of g.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    // collision
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx*dx + dy*dy <= rr*rr) {
        e.hp -= b.damage;
        e.flash = 0.12;
        b.dead = true;
        if (e.hp <= 0) {
          e.dead = true;
          g.kills++;
          g.score += 10;
        }
        break;
      }
    }
  }
  g.bullets = g.bullets.filter(b => !b.dead);

  // Enemies move toward center
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = t.x - e.x, dy = t.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    if (e.flash > 0) e.flash -= dt;
    // reach core
    if (d < t.r + e.r) {
      t.hp -= e.damage;
      e.dead = true;
      g.flash = 0.25;
      if (t.hp <= 0) {
        t.hp = 0;
        gameOver();
      }
    }
  }
  g.enemies = g.enemies.filter(e => !e.dead);

  // Wave clear
  if (g.enemiesSpawned >= g.enemiesToSpawn && g.enemies.length === 0 && !g.waveCleared) {
    g.waveCleared = true;
    g.betweenWaves = 1.5;
  }
  if (g.waveCleared) {
    g.betweenWaves -= dt;
    if (g.betweenWaves <= 0) nextWave();
  }

  if (g.flash > 0) g.flash -= dt;

  updateHud();
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
  game.enemiesToSpawn = 10 + game.wave * 3;
  game.enemiesSpawned = 0;
  game.spawnInterval  = Math.max(0.25, 1.0 - game.wave * 0.04);
  game.spawnTimer = 0.5;
  game.waveCleared = false;
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

  // enemies
  for (const e of game.enemies) {
    ctx.save();
    if (e.flash > 0) {
      ctx.fillStyle = '#fff';
    } else {
      ctx.fillStyle = e.color;
    }
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
    // hp bar
    if (e.hp < e.maxHp) {
      const w = 26, h = 3;
      ctx.fillStyle = '#000a';
      ctx.fillRect(e.x - w/2, e.y - e.r - 8, w, h);
      ctx.fillStyle = '#5dffa1';
      ctx.fillRect(e.x - w/2, e.y - e.r - 8, w * (e.hp / e.maxHp), h);
    }
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
